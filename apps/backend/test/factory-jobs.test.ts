import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  recoverStalledFactoryBuildJobs,
  restoreCompletedFactoryBuildSnapshots
} from "../src/plugin-factory/factory-job-recovery";
import { MemoryStore } from "../src/store/memory-store";

describe("Factory job persistence", () => {
  it("creates and restores a user Factory job", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    expect(owner).toBeDefined();

    const job = await store.createFactoryJob({
      owner: owner!,
      templateId: "auth-kubernetes",
      pluginName: "vault-plugin-auth-kubernetes",
      snapshot: { activeTab: "workspace", favoriteTemplateIds: ["auth-kubernetes"] }
    });

    const restored = await store.getFactoryJob(job.id);
    expect(restored?.ownerId).toBe(owner?.id);
    expect(restored?.snapshot).toEqual({
      activeTab: "workspace",
      favoriteTemplateIds: ["auth-kubernetes"]
    });
  });

  it("updates approval and deployment state without losing the snapshot", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("admin@example.com");
    const job = await store.createFactoryJob({ owner: owner!, pluginName: "demo-plugin", snapshot: { generated: true } });

    const updated = await store.updateFactoryJob(job.id, {
      status: "approved",
      stage: "approval",
      progress: 80,
      approval: {
        status: "approved",
        artifactFingerprint: "a".repeat(64),
        requestedAt: new Date().toISOString(),
        requestedBy: owner!.email,
        decidedAt: new Date().toISOString(),
        decidedBy: owner!.email
      },
      deployment: { mode: "canary", environment: "staging", rollbackReady: true }
    });

    expect(updated.snapshot).toEqual({ generated: true });
    expect(updated.approval.status).toBe("approved");
    expect(updated.approval.artifactFingerprint).toBe("a".repeat(64));
    expect(updated.deployment.mode).toBe("canary");
    expect(updated.progress).toBe(80);
  });

  it("keeps separate workspaces isolated when they generate the same plugin", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const firstArtifact = "a".repeat(64);
    const secondArtifact = "b".repeat(64);
    const first = await store.createFactoryJob({
      owner: owner!,
      templateId: "github-secrets",
      pluginName: "vault-plugin-secrets-github",
      snapshot: { workspaceId: "workspace-first", artifactSha256: firstArtifact }
    });
    const second = await store.createFactoryJob({
      owner: owner!,
      templateId: "github-secrets",
      pluginName: "vault-plugin-secrets-github",
      snapshot: { workspaceId: "workspace-second", artifactSha256: "" }
    });

    await store.updateFactoryJob(second.id, {
      snapshot: { workspaceId: "workspace-second", artifactSha256: secondArtifact }
    });

    expect((await store.getFactoryJob(first.id))?.snapshot).toEqual({
      workspaceId: "workspace-first",
      artifactSha256: firstArtifact
    });
    expect((await store.getFactoryJob(second.id))?.snapshot).toEqual({
      workspaceId: "workspace-second",
      artifactSha256: secondArtifact
    });
  });

  it("rejects a stale Factory workspace snapshot", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({
      owner: owner!,
      pluginName: "versioned-plugin",
      snapshot: { autoRepair: { status: "running" } }
    });
    const completed = await store.updateFactoryJob(job.id, {
      snapshot: { autoRepair: { status: "pass" }, artifactSha256: "a".repeat(64) }
    });

    await expect(
      store.updateFactoryJob(
        job.id,
        { snapshot: { autoRepair: { status: "running" }, artifactSha256: "" } },
        { expectedUpdatedAt: job.updatedAt }
      )
    ).rejects.toThrow("Factory job changed while saving");
    expect((await store.getFactoryJob(job.id))?.snapshot).toEqual(completed.snapshot);
  });

  it("recovers a timed-out build so it can be run again", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({
      owner: owner!,
      pluginName: "stalled-plugin",
      status: "running",
      stage: "security-review",
      progress: 75,
      snapshot: {
        artifactSha256: "",
        generated: { buildArtifact: { sha256: "a".repeat(64) } },
        autoRepair: {
          id: "stalled-run",
          status: "running",
          phase: "building",
          startedAt: new Date(Date.now() - 700_000).toISOString(),
          artifact: { sha256: "a".repeat(64) }
        }
      }
    });

    expect(await recoverStalledFactoryBuildJobs(store, 600_000)).toBe(1);
    const recovered = await store.getFactoryJob(job.id);
    expect(recovered).toMatchObject({ status: "failed", stage: "test", progress: 55 });
    expect(recovered?.snapshot).toMatchObject({
      artifactSha256: "",
      autoRepair: { status: "failed", phase: "complete" },
      generated: { buildTest: { status: "fail" } }
    });
    expect((recovered?.snapshot.autoRepair as Record<string, unknown>).artifact).toBeUndefined();
    expect(recovered?.events.at(-1)?.label).toBe("build-recovery-required");
  });

  it("leaves an active build running during startup recovery", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({
      owner: owner!,
      pluginName: "active-plugin",
      status: "running",
      stage: "test",
      progress: 45,
      snapshot: {
        autoRepair: {
          id: "active-run",
          status: "running",
          phase: "building",
          startedAt: new Date(Date.now() - 30_000).toISOString()
        }
      }
    });

    expect(await recoverStalledFactoryBuildJobs(store, 600_000)).toBe(0);
    expect(await store.getFactoryJob(job.id)).toMatchObject({ status: "running", stage: "test", progress: 45 });
  });

  it("restores missing workspace fields from a verified completed build", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("admin@example.com");
    const files = [{ path: "main.go", language: "go" as const, content: "package main\n" }];
    const scaffoldSha256 = createHash("sha256").update("main.go\0package main\n\0").digest("hex");
    const artifact = {
      bucket: "factory-artifacts",
      key: "factory-builds/restored/artifact/plugin",
      sha256: "a".repeat(64),
      architecture: "arm64" as const,
      command: "vault-plugin-secrets-github",
      builtAt: new Date().toISOString()
    };
    const requirements = {
      targetSystem: "github",
      authMethod: "GitHub App",
      apiBasePath: "https://api.github.com",
      ttl: "1h",
      rotationStrategy: "Rotate on demand",
      revokeStrategy: "Revoke installation token",
      mountPath: "factory-lab/github",
      environment: "dev" as const,
      confirmed: true
    };
    const job = await store.createFactoryJob({
      owner: owner!,
      templateId: "expansion-github-secrets",
      pluginName: "vault-plugin-secrets-github",
      status: "running",
      stage: "security-review",
      progress: 90,
      snapshot: {
        command: "vault-plugin-secrets-github",
        version: "v0.1.0",
        description: "GitHub App credentials",
        draftFiles: [],
        artifactSha256: "",
        requirementsInterview: { spec: requirements },
        autoRepair: {
          id: "completed-run",
          status: "pass",
          phase: "complete",
          maxAttempts: 3,
          attempts: [],
          files,
          scaffoldSha256,
          buildTest: { status: "pass", steps: [] },
          securityReview: { score: 100, posture: "ready", findings: [] },
          artifact,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          summary: "Build passed"
        }
      }
    });

    expect(await restoreCompletedFactoryBuildSnapshots(store)).toBe(1);
    const restored = await store.getFactoryJob(job.id);
    expect(restored?.snapshot).toMatchObject({
      artifactSha256: artifact.sha256,
      draftFiles: files,
      generated: { files, buildArtifact: artifact }
    });
    expect(restored?.events.at(-1)?.label).toBe("build-state-restored");
  });

  it("scopes job history by owner while allowing an all-jobs view", async () => {
    const store = new MemoryStore();
    const developer = await store.getUserByEmail("developer@example.com");
    const admin = await store.getUserByEmail("admin@example.com");
    await store.createFactoryJob({ owner: developer!, pluginName: "developer-plugin" });
    await store.createFactoryJob({ owner: admin!, pluginName: "admin-plugin" });

    expect(await store.listFactoryJobs(developer!.id)).toHaveLength(1);
    expect(await store.listFactoryJobs()).toHaveLength(2);
  });

  it("updates history details without changing plugin artifact fields", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({
      owner: owner!,
      templateId: "auth-kubernetes",
      pluginName: "vault-plugin-auth-kubernetes",
      snapshot: { generated: true }
    });

    const updated = await store.updateFactoryJob(job.id, {
      historyTitle: "Kubernetes auth production review",
      historyNote: "Waiting for platform team feedback"
    });

    expect(updated.historyTitle).toBe("Kubernetes auth production review");
    expect(updated.historyNote).toBe("Waiting for platform team feedback");
    expect(updated.pluginName).toBe(job.pluginName);
    expect(updated.templateId).toBe(job.templateId);
    expect(updated.snapshot).toEqual(job.snapshot);
    expect(updated.approval).toEqual(job.approval);
  });

  it("deletes a saved Factory job and returns the deleted record", async () => {
    const store = new MemoryStore();
    const owner = await store.getUserByEmail("developer@example.com");
    const job = await store.createFactoryJob({ owner: owner!, pluginName: "temporary-plugin" });

    const deleted = await store.deleteFactoryJob(job.id);

    expect(deleted.id).toBe(job.id);
    expect(await store.getFactoryJob(job.id)).toBeUndefined();
    await expect(store.deleteFactoryJob(job.id)).rejects.toThrow("Factory job not found");
  });
});

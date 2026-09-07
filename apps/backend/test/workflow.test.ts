import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config";
import { generateVaultPluginScaffold, vaultPluginTemplates } from "../src/plugin-factory/catalog";
import { factoryExpansionReservedTargets, factoryExpansionTemplates } from "../src/plugin-factory/expansion-catalog";
import { MemoryStore } from "../src/store/memory-store";
import { createVaultClient } from "../src/vault/vault-client";
import { WorkflowService } from "../src/workflow/workflow-service";
import { redact } from "../src/utils/redact";

const mockConfig: AppConfig = {
  port: 4000,
  frontendOrigin: "http://localhost:3000",
  sessionCookieName: "sp_user",
  vaultMode: "mock",
  vaultAuthMode: "mock",
  vaultAppRoleAuthMount: "approle",
  vaultSkipVerify: false,
  vaultUseSystemNamespace: false,
  vaultRequestTimeoutMs: 10000
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflow", () => {
  it("creates, approves, executes, revokes, and audits a GitLab token request", async () => {
    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    const approver = await store.getUserByEmail("approver@example.com");
    if (!developer || !approver) throw new Error("missing seed users");
    const service = new WorkflowService(
      store,
      createVaultClient(mockConfig)
    );

    const request = await service.createRequest({
      actor: developer,
      systemId: "system-tango-ec",
      requestType: "CUSTOM_GITLAB_TOKEN",
      reason: "Need temporary project access for release validation",
      ttl: "1h",
      payload: { project: "tango-ec", requestedToken: "must-not-persist" }
    });
    expect(request.status).toBe("pending");
    expect(request.payload.requestedToken).toBe("[REDACTED]");

    const approved = await service.approveRequest(approver, request.id);
    expect(approved.status).toBe("approved");

    const credential = await service.executeRequest(developer, request.id);
    expect(credential.status).toBe("active");
    expect(credential.vaultLeaseId).toContain("gitlab-token");
    expect(credential.maskedDisplayValue).toContain("...");
    expect(JSON.stringify(credential)).not.toContain("must-not-persist");

    const revoked = await service.revokeCredential(developer, credential.id);
    expect(revoked.status).toBe("revoked");

    const events = await store.listAuditEvents();
    expect(events.map((event) => event.action).sort()).toEqual([
      "credential.revoked",
      "request.approved",
      "request.created",
      "request.executed"
    ]);
  });

  it("persists an approved TTL and conditional approval note before issuing a credential", async () => {
    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    const approver = await store.getUserByEmail("approver@example.com");
    if (!developer || !approver) throw new Error("missing seed users");
    const service = new WorkflowService(store, createVaultClient(mockConfig));

    const request = await service.createRequest({
      actor: developer,
      systemId: "system-tango-ec",
      requestType: "DB_CREDENTIAL",
      reason: "Temporary database validation",
      ttl: "1h",
      payload: { scope: "db_read" }
    });
    const approved = await service.approveRequest(approver, request.id, {
      ttl: "30m",
      note: "Release window only"
    });
    const credential = await service.executeRequest(developer, request.id);

    expect(approved.ttl).toBe("30m");
    expect(approved.payload).toEqual(
      expect.objectContaining({
        approval_type: "conditional",
        approval_condition: "Release window only"
      })
    );
    expect(credential.ttl).toBe("30m");
  });

  it("blocks unauthorized approval and requests for unassigned systems", async () => {
    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    if (!developer) throw new Error("missing seed user");
    const service = new WorkflowService(store, createVaultClient(mockConfig));

    await expect(
      service.createRequest({
        actor: developer,
        systemId: "system-payment-api",
        requestType: "PKI_CERTIFICATE",
        reason: "Unauthorized system request",
        ttl: "1h",
        payload: {}
      })
    ).rejects.toThrow("Forbidden");

    const request = await service.createRequest({
      actor: developer,
      systemId: "system-tango-ec",
      requestType: "CUSTOM_GITLAB_TOKEN",
      reason: "Authorized request",
      ttl: "1h",
      payload: {}
    });
    await expect(service.approveRequest(developer, request.id)).rejects.toThrow("Forbidden");
  });

  it("creates CSV-style request batches and reports row-level failures", async () => {
    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    if (!developer) throw new Error("missing seed user");
    const service = new WorkflowService(store, createVaultClient(mockConfig));

    const result = await service.createRequests(developer, [
      {
        systemId: "system-tango-ec",
        requestType: "CUSTOM_GITLAB_TOKEN",
        reason: "Release validation",
        ttl: "1h",
        payload: { scope: "read_api" }
      },
      {
        systemId: "system-payment-api",
        requestType: "PKI_CERTIFICATE",
        reason: "Unassigned system",
        ttl: "30m",
        payload: { scope: "read_api" }
      }
    ]);

    expect(result.created).toHaveLength(1);
    expect(result.failures).toEqual([{ index: 1, error: "Forbidden" }]);
  });

  it("tracks revoke failures and allows a bulk retry", async () => {
    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    const approver = await store.getUserByEmail("approver@example.com");
    if (!developer || !approver) throw new Error("missing seed users");
    const vault = createVaultClient(mockConfig);
    vi.spyOn(vault, "revokeLease")
      .mockResolvedValueOnce({ revoked: false, detail: { reason: "temporary failure" } })
      .mockResolvedValueOnce({ revoked: true, detail: {} });
    const service = new WorkflowService(store, vault);
    const request = await service.createRequest({
      actor: developer,
      systemId: "system-tango-ec",
      requestType: "CUSTOM_GITLAB_TOKEN",
      reason: "Temporary credential",
      ttl: "1h",
      payload: {}
    });
    await service.approveRequest(approver, request.id);
    const credential = await service.executeRequest(developer, request.id);

    await expect(service.revokeCredential(developer, credential.id)).rejects.toThrow("Vault lease revoke failed");
    expect((await store.getCredential(credential.id))?.status).toBe("revoke_failed");

    const retried = await service.revokeCredentials(developer, [credential.id, credential.id]);
    expect(retried.revoked).toHaveLength(1);
    expect(retried.failures).toHaveLength(0);
    expect((await store.getCredential(credential.id))?.status).toBe("revoked");
  });
});

describe("real Vault adapter", () => {
  it("checks Vault health without requiring a token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          initialized: true,
          sealed: false,
          standby: false,
          version: "2.0.3+ent",
          cluster_name: "vault-cluster"
        }),
        { status: 200 }
      )
    );

    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "token",
      vaultAddr: "http://vault.service:8200",
      vaultToken: "test-token"
    });

    const health = await client.health();
    expect(health.healthy).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://vault.service:8200/v1/sys/health",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({ "X-Vault-Token": "test-token" })
      })
    );
  });

  it("uses AppRole login, issues a DB credential, and returns only masked metadata", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            auth: {
              client_token: "child-token",
              lease_duration: 3600
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            lease_id: "database/creds/tango/abc",
            lease_duration: 1800,
            renewable: true,
            data: {
              username: "v-user",
              password: "plaintext-must-not-appear"
            }
          }),
          { status: 200 }
        )
      );

    const store = new MemoryStore();
    await store.initialize();
    const developer = await store.getUserByEmail("developer@example.com");
    const system = await store.getSystem("system-tango-ec");
    if (!developer || !system) throw new Error("missing seed data");

    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "approle",
      vaultAddr: "http://vault.service:8200",
      vaultRoleId: "role-id",
      vaultSecretId: "secret-id"
    });

    const request = await store.createRequest({
      requester: developer,
      systemId: system.id,
      requestType: "DB_CREDENTIAL",
      reason: "temporary DB access",
      ttl: "30m",
      payload: {},
      riskLevel: "medium"
    });

    const result = await client.issueCredential(request, system);
    expect(result.leaseId).toBe("database/creds/tango/abc");
    expect(result.maskedDisplayValue).toContain("lease:");
    expect(JSON.stringify(result)).not.toContain("plaintext-must-not-appear");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://vault.service:8200/v1/auth/approle/login");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://vault.service:8200/v1/database/creds/tango-ec-readwrite");
  });
});

describe("Vault plugin factory", () => {
  it("includes the requested official, learning, community top 5, and Kafka templates", () => {
    const names = vaultPluginTemplates.map((template) => template.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "vault-plugin-auth-kubernetes",
        "vault-plugin-auth-jwt",
        "vault-plugin-auth-gcp",
        "vault-auth-plugin-example",
        "vault-plugin-secrets-kv",
        "vault-plugin-secrets-azure",
        "vault-plugin-secrets-gcp",
        "vault-plugin-secrets-ad",
        "vault-plugin-secrets-openldap",
        "vault-plugin-secrets-kubernetes",
        "vault-plugin-database-elasticsearch",
        "vault-plugin-database-redis",
        "vault-plugin-database-oracle",
        "vault-plugin-database-snowflake",
        "vault-plugin-database-mongodbatlas",
        "learn-vault-plugin-secrets-hashicups",
        "vault-pki-backend-venafi",
        "vault-plugin-auth-u2f",
        "vault-auth-slack",
        "vault-plugin-secrets-minio",
        "vault-auth-spire",
        "vault-plugin-secrets-kafka"
      ])
    );

    expect(vaultPluginTemplates.filter((template) => template.popularity?.rank).map((template) => template.popularity?.rank)).toEqual([
      1,
      2,
      3,
      4,
      5
    ]);
    expect(vaultPluginTemplates.find((template) => template.name === "vault-plugin-secrets-kafka")).toEqual(
      expect.objectContaining({
        pluginType: "secret",
        integrationTarget: "kafka",
        repository: "Mongey/vault-plugin-secrets-kafka"
      })
    );
  });

  it("adds the reviewed non-duplicate expansion templates without reserved Vault or portal targets", () => {
    const expansion = vaultPluginTemplates.filter((template) => template.tags.includes("catalog expansion"));
    const expansionNames = expansion.map((template) => template.name);
    const reservedTargets = new Set<string>(factoryExpansionReservedTargets);

    expect(vaultPluginTemplates).toHaveLength(53);
    expect(expansion).toHaveLength(31);
    expect(expansionNames).toEqual(factoryExpansionTemplates.map((template) => template.name));
    expect(new Set(vaultPluginTemplates.map((template) => template.id)).size).toBe(vaultPluginTemplates.length);
    expect(new Set(vaultPluginTemplates.map((template) => template.name)).size).toBe(vaultPluginTemplates.length);
    expect(expansion.every((template) => !reservedTargets.has(template.integrationTarget))).toBe(true);
    expect(expansionNames).not.toEqual(
      expect.arrayContaining([
        "vault-plugin-secrets-gitlab",
        "vault-plugin-secrets-jenkins",
        "vault-plugin-secrets-artifactory",
        "vault-plugin-secrets-kafka",
        "vault-pki-backend-venafi",
        "vault-auth-spire",
        "vault-plugin-spiffe-auth"
      ])
    );
  });

  it("preserves the reviewed expansion tiers and partner classification", () => {
    const expansion = vaultPluginTemplates.filter((template) => template.tags.includes("catalog expansion"));

    expect(expansion.filter((template) => template.tags.includes("priority"))).toHaveLength(8);
    expect(expansion.filter((template) => template.tags.includes("conditional"))).toHaveLength(13);
    expect(expansion.filter((template) => template.tags.includes("lab"))).toHaveLength(10);
    expect(expansion.filter((template) => template.source === "partner").map((template) => template.integrationTarget)).toEqual([
      "sectigo-pki",
      "digicert-pki",
      "aerospike"
    ]);
    expect(expansion.filter((template) => template.tags.includes("lab")).every((template) => template.marketplace.riskLevel === "high")).toBe(
      true
    );
  });

  it("generates a complete scaffold from a newly added GitHub template", () => {
    const generated = generateVaultPluginScaffold({
      templateId: "expansion-github-secrets",
      pluginName: "team-github-app-token",
      mountPath: "team/github",
      version: "v0.1.0",
      command: "team-github-app-token",
      description: "Mint short-lived GitHub App installation tokens"
    });

    expect(generated.template.integrationTarget).toBe("github");
    expect(generated.template.marketplace.maturity).toBe("reference");
    expect(generated.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["go.mod", "cmd/team-github-app-token/main.go", "internal/plugin/backend.go", "vault/apply.hcl"])
    );
    expect(generated.dryRun.changes.map((change) => change.target)).toContain(
      "sys/plugins/catalog/secret/team-github-app-token"
    );
    expect(generated.buildTest.status).toBe("warn");
  });

  it("generates a functional GitHub PAT rotation secrets engine", () => {
    const generated = generateVaultPluginScaffold({
      templateId: "expansion-github-pat-rotation",
      pluginName: "team-github-pat-rotation",
      mountPath: "team/github-pat",
      version: "v0.1.0",
      command: "team-github-pat-rotation",
      description: "Validate and rotate GitHub personal access tokens"
    });
    const backend = generated.files.find((file) => file.path === "internal/plugin/backend.go")?.content ?? "";
    const backendTest = generated.files.find((file) => file.path === "internal/plugin/backend_test.go")?.content ?? "";
    const readme = generated.files.find((file) => file.path === "README.md")?.content ?? "";

    expect(generated.template.integrationTarget).toBe("github-pat");
    expect(generated.template.marketplace.maturity).toBe("conditional");
    expect(generated.files).toHaveLength(8);
    expect(backend).toContain('Pattern: "rotate/"');
    expect(backend).toContain('Pattern: "creds/"');
    expect(backend).toContain("validatePAT");
    expect(backend).toContain("revokeOrganizationAccess");
    expect(backend).not.toContain("replace scaffold callbacks");
    expect(backendTest).toContain("TestRotatePATSwitchesTokenAndRevokesPreviousOrganizationAccess");
    expect(readme).toContain("does **not** create a PAT");
    expect(readme).toContain("Classic PAT");
    expect(generated.warnings.join(" ")).toContain("operator-supplied PAT");
  });

  it("generates a scaffold with source files, build commands, and a Vault apply plan", () => {
    const generated = generateVaultPluginScaffold({
      templateId: "community-minio-secrets",
      pluginName: "team-minio-token",
      mountPath: "team/minio",
      version: "v0.1.0",
      command: "team-minio-token",
      description: "Mint short-lived MinIO credentials"
    });

    expect(generated.template.name).toBe("vault-plugin-secrets-minio");
    expect(generated.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["go.mod", "cmd/team-minio-token/main.go", "internal/plugin/backend.go", "vault/apply.hcl"])
    );
    expect(generated.commands.join("\n")).toContain("vault plugin register");
    expect(generated.applyPlan.join("\n")).toContain("Register team-minio-token");
    expect(generated.scaffoldSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.dryRun.changes.map((change) => change.target)).toContain(
      "sys/plugins/catalog/secret/team-minio-token"
    );
    expect(generated.buildTest.steps.map((step) => step.command)).toContain("go test ./...");
    expect(generated.rollbackPlan.commands.join("\n")).toContain("vault secrets disable team/minio");
    expect(generated.securityReview.findings.length).toBeGreaterThan(0);
    expect(generated.blueprint.questions.map((question) => question.id)).toContain("mount-path");
  });

  it("applies plugins through the mock Vault adapter", async () => {
    const client = createVaultClient(mockConfig);
    const result = await client.applyPlugin({
      pluginType: "secret",
      pluginName: "vault-plugin-secrets-minio",
      mountPath: "minio",
      version: "v0.1.0",
      command: "vault-plugin-secrets-minio",
      artifactSha256: "a".repeat(64),
      description: "MinIO plugin"
    });

    expect(result.mode).toBe("mock");
    expect(result.applied).toBe(true);
    expect(result.steps.map((step) => step.status)).toContain("success");
  });

  it("registers and enables a real secret plugin with Vault catalog APIs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              "minio/": {
                type: "vault-plugin-secrets-minio",
                running_plugin_version: "v0.1.0"
              }
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: "generated" } }), { status: 200 })
      );

    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "token",
      vaultAddr: "http://vault.service:8200",
      vaultToken: "root"
    });

    const result = await client.applyPlugin({
      pluginType: "secret",
      pluginName: "vault-plugin-secrets-minio",
      mountPath: "minio",
      version: "v0.1.0",
      command: "vault-plugin-secrets-minio",
      artifactSha256: "b".repeat(64),
      description: "MinIO plugin"
    });

    expect(result.mode).toBe("real");
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://vault.service:8200/v1/sys/mounts",
      "http://vault.service:8200/v1/sys/plugins/catalog/secret/vault-plugin-secrets-minio",
      "http://vault.service:8200/v1/sys/plugins/catalog/secret/vault-plugin-secrets-minio",
      "http://vault.service:8200/v1/sys/mounts/minio",
      "http://vault.service:8200/v1/sys/mounts",
      "http://vault.service:8200/v1/minio/config"
    ]);
    expect(result.steps.at(-1)).toEqual(
      expect.objectContaining({ label: "Plugin read smoke test", status: "success" })
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "vault-plugin-secrets-minio",
          description: "MinIO plugin",
          config: { plugin_version: "v0.1.0" }
        })
      })
    );
  });

  it("inspects, removes, and verifies an existing plugin mount", async () => {
    const mounted = {
      data: {
        "factory-lab/github/": {
          type: "vault-plugin-secrets-github",
          accessor: "github_1234",
          uuid: "mount-uuid",
          description: "Existing GitHub plugin",
          running_plugin_version: "v0.1.0"
        }
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(mounted), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(mounted), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }));

    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "token",
      vaultAddr: "http://vault.service:8200",
      vaultToken: "root",
      vaultPluginAllowedMountPrefix: "factory-lab"
    });

    const inspection = await client.inspectPluginMount({
      pluginType: "secret",
      mountPath: "factory-lab/github"
    });
    expect(inspection).toEqual(
      expect.objectContaining({
        exists: true,
        mountPath: "factory-lab/github",
        mountType: "vault-plugin-secrets-github",
        pluginVersion: "v0.1.0"
      })
    );
    expect(inspection.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const removed = await client.removePluginMount({
      pluginType: "secret",
      mountPath: "factory-lab/github",
      expectedFingerprint: inspection.fingerprint ?? ""
    });
    expect(removed.removed).toBe(true);
    expect(removed.steps.map((step) => step.label)).toEqual([
      "Disable existing mount",
      "Verify mount removal"
    ]);
    expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["http://vault.service:8200/v1/sys/mounts", "GET"],
      ["http://vault.service:8200/v1/sys/mounts", "GET"],
      ["http://vault.service:8200/v1/sys/mounts/factory-lab/github", "DELETE"],
      ["http://vault.service:8200/v1/sys/mounts", "GET"]
    ]);
  });

  it("refuses to remove a mount that changed after inspection", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { "factory-lab/github/": { type: "plugin-a", accessor: "a" } } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { "factory-lab/github/": { type: "plugin-b", accessor: "b" } } }), { status: 200 })
      );
    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "token",
      vaultAddr: "http://vault.service:8200",
      vaultToken: "root",
      vaultPluginAllowedMountPrefix: "factory-lab"
    });
    const inspection = await client.inspectPluginMount({ pluginType: "secret", mountPath: "factory-lab/github" });

    await expect(
      client.removePluginMount({
        pluginType: "secret",
        mountPath: "factory-lab/github",
        expectedFingerprint: inspection.fingerprint ?? ""
      })
    ).rejects.toThrow("changed after inspection");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("automatically removes a new mount and catalog entry when the smoke test fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              "minio/": { type: "vault-plugin-secrets-minio" }
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: ["permission denied"] }), { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const client = createVaultClient({
      ...mockConfig,
      vaultMode: "real",
      vaultAuthMode: "token",
      vaultAddr: "http://vault.service:8200",
      vaultToken: "root"
    });

    await expect(
      client.applyPlugin({
        pluginType: "secret",
        pluginName: "vault-plugin-secrets-minio",
        mountPath: "minio",
        version: "v0.1.0",
        command: "vault-plugin-secrets-minio",
        artifactSha256: "c".repeat(64)
      })
    ).rejects.toThrow(
      "Automatic rollback: mount cleanup returned 204, catalog cleanup returned 204"
    );
    expect(fetchMock.mock.calls.slice(-2).map((call) => [call[0], call[1]?.method])).toEqual([
      ["http://vault.service:8200/v1/sys/mounts/minio", "DELETE"],
      ["http://vault.service:8200/v1/sys/plugins/catalog/secret/vault-plugin-secrets-minio", "DELETE"]
    ]);
  });
});

describe("redaction", () => {
  it("redacts nested sensitive fields", () => {
    expect(redact({ data: { token: "abc", value: "safe" } })).toEqual({
      data: { token: "[REDACTED]", value: "safe" }
    });
  });
});

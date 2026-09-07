import type {
  VaultPluginAutoRepairResult,
  VaultPluginBuildArtifact,
  VaultPluginFactoryJob,
  VaultPluginRequirements
} from "@security-portal/shared";
import { generateVaultPluginScaffold } from "./catalog";
import { hasVerifiedFactoryArtifact } from "./factory-artifact";
import type { PortalStore } from "../store/types";

export async function restoreCompletedFactoryBuildSnapshots(store: PortalStore): Promise<number> {
  const jobs = await store.listFactoryJobs();
  let restored = 0;

  for (const job of jobs) {
    const snapshot = restoreCompletedBuildSnapshot(job);
    if (!snapshot) continue;

    const completedAt = new Date().toISOString();
    await store.updateFactoryJob(job.id, {
      snapshot,
      events: [
        ...job.events,
        {
          id: `${job.id}-build-state-restored`,
          label: "build-state-restored",
          detail: "The verified build result was restored from its persisted artifact evidence.",
          status: "success" as const,
          createdAt: completedAt
        }
      ].slice(-100)
    });
    await store.createAuditEvent({
      actorId: "system",
      actorEmail: "system@security-portal.local",
      action: "vault_plugin.build_state_restored",
      targetType: "vault_plugin_job",
      targetId: job.id,
      result: "success",
      metadata: { build_run_id: (snapshot.autoRepair as VaultPluginAutoRepairResult).id }
    });
    restored += 1;
  }

  return restored;
}

export async function recoverStalledFactoryBuildJobs(store: PortalStore, timeoutMs: number): Promise<number> {
  const now = Date.now();
  const recoveryThresholdMs = timeoutMs + 60_000;
  const jobs = await store.listFactoryJobs();
  let recovered = 0;

  for (const job of jobs) {
    const autoRepair = asRecord(job.snapshot.autoRepair);
    if (job.status !== "running" || autoRepair?.status !== "running") continue;
    const startedAt = typeof autoRepair.startedAt === "string" ? Date.parse(autoRepair.startedAt) : Number.NaN;
    if (!Number.isFinite(startedAt) || now - startedAt <= recoveryThresholdMs) continue;

    const completedAt = new Date().toISOString();
    const elapsedMs = Math.max(0, now - startedAt);
    const summary = "The isolated build was interrupted before its verified artifact state was saved. Run the build again.";
    const buildTest = {
      status: "fail" as const,
      steps: [
        {
          label: "Build state recovery",
          command: "factory build --isolated",
          status: "fail" as const,
          durationMs: elapsedMs,
          detail: summary
        }
      ]
    };
    const generated = asRecord(job.snapshot.generated);
    const autoRepairWithoutArtifact = Object.fromEntries(
      Object.entries(autoRepair).filter(([key]) => key !== "artifact")
    );
    const recoveredGenerated = generated
      ? Object.fromEntries(Object.entries(generated).filter(([key]) => key !== "buildArtifact"))
      : job.snapshot.generated;
    const recoveredSnapshot = {
      ...job.snapshot,
      artifactSha256: "",
      autoRepair: {
        ...autoRepairWithoutArtifact,
        status: "failed",
        phase: "complete",
        completedAt,
        buildTest,
        summary
      },
      generated: recoveredGenerated
        ? {
            ...recoveredGenerated,
            buildTest
          }
        : recoveredGenerated
    };
    await store.updateFactoryJob(job.id, {
      status: "failed",
      stage: "test",
      progress: 55,
      snapshot: recoveredSnapshot,
      deployment: { ...job.deployment, rollbackReady: false },
      events: [
        ...job.events,
        {
          id: `${String(autoRepair.id ?? job.id)}-recovery`,
          label: "build-recovery-required",
          detail: summary,
          status: "warning" as const,
          createdAt: completedAt
        }
      ].slice(-100)
    });
    await store.createAuditEvent({
      actorId: "system",
      actorEmail: "system@security-portal.local",
      action: "vault_plugin.build_recovery_required",
      targetType: "vault_plugin_job",
      targetId: job.id,
      result: "failure",
      metadata: { build_run_id: autoRepair.id, elapsed_ms: elapsedMs }
    });
    recovered += 1;
  }

  return recovered;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function restoreCompletedBuildSnapshot(job: VaultPluginFactoryJob): VaultPluginFactoryJob["snapshot"] | undefined {
  const autoRepair = asCompletedRepair(job.snapshot.autoRepair);
  const artifact = asStoredArtifact(autoRepair?.artifact);
  const draftFiles = Array.isArray(job.snapshot.draftFiles) ? job.snapshot.draftFiles : [];
  const generated = asRecord(job.snapshot.generated);
  const generatedFiles = Array.isArray(generated?.files) ? generated.files : [];
  const sourceStateMissing = draftFiles.length === 0 && generatedFiles.length === 0;
  if (!autoRepair || !artifact || !sourceStateMissing || !job.templateId) return undefined;

  const requirements = asRequirements(asRecord(asRecord(job.snapshot.requirementsInterview)?.spec));
  const version = nonEmptyString(job.snapshot.version);
  const command = nonEmptyString(job.snapshot.command);
  if (!requirements || !version || !command) return undefined;

  try {
    const restoredGenerated = {
      ...generateVaultPluginScaffold({
        templateId: job.templateId,
        pluginName: job.pluginName,
        mountPath: requirements.mountPath,
        version,
        command,
        description: nonEmptyString(job.snapshot.description),
        requirements
      }),
      files: autoRepair.files,
      scaffoldSha256: autoRepair.scaffoldSha256,
      buildTest: autoRepair.buildTest,
      securityReview: autoRepair.securityReview,
      buildArtifact: artifact
    };
    const snapshot = {
      ...job.snapshot,
      generated: restoredGenerated,
      draftFiles: autoRepair.files,
      artifactSha256: artifact.sha256
    };
    return hasVerifiedFactoryArtifact({ ...job, snapshot }, true) ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

function asCompletedRepair(value: unknown): VaultPluginAutoRepairResult | undefined {
  const repair = asRecord(value);
  return repair?.status === "pass" && Array.isArray(repair.files) && repair.files.length > 0
    ? (value as VaultPluginAutoRepairResult)
    : undefined;
}

function asStoredArtifact(value: unknown): VaultPluginBuildArtifact | undefined {
  const artifact = asRecord(value);
  return artifact &&
    nonEmptyString(artifact.bucket) &&
    nonEmptyString(artifact.key) &&
    /^[a-f0-9]{64}$/i.test(nonEmptyString(artifact.sha256) ?? "")
    ? (value as VaultPluginBuildArtifact)
    : undefined;
}

function asRequirements(value: Record<string, unknown> | undefined): VaultPluginRequirements | undefined {
  if (!value) return undefined;
  const environment = value.environment;
  const requiredStrings = [
    value.targetSystem,
    value.authMethod,
    value.apiBasePath,
    value.ttl,
    value.rotationStrategy,
    value.revokeStrategy,
    value.mountPath
  ];
  if (
    requiredStrings.some((field) => !nonEmptyString(field)) ||
    !["dev", "staging", "prod"].includes(String(environment)) ||
    value.confirmed !== true
  ) {
    return undefined;
  }
  return value as unknown as VaultPluginRequirements;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

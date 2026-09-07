import { createHash } from "node:crypto";
import type { VaultPluginFactoryJob } from "@security-portal/shared";

export type FactoryArtifactEvidence = {
  artifactBucket?: string;
  artifactKey?: string;
  artifactSha256?: string;
  command?: string;
  description?: string;
  files: Array<{ content: string; language?: string; path: string }>;
  mountPath?: string;
  pluginName?: string;
  pluginType?: string;
  templateId?: string;
  version?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolvedBuildArtifact(snapshot: Record<string, unknown>): Record<string, unknown> {
  const generated = asRecord(snapshot.generated);
  const autoRepair = asRecord(snapshot.autoRepair);
  const generatedArtifact = asRecord(generated?.buildArtifact);
  const repairedArtifact = asRecord(autoRepair?.artifact);

  return {
    bucket: nonEmptyString(generatedArtifact?.bucket) ?? nonEmptyString(repairedArtifact?.bucket),
    key: nonEmptyString(generatedArtifact?.key) ?? nonEmptyString(repairedArtifact?.key),
    sha256: nonEmptyString(generatedArtifact?.sha256) ?? nonEmptyString(repairedArtifact?.sha256)
  };
}

export function factoryArtifactEvidence(job: VaultPluginFactoryJob): FactoryArtifactEvidence {
  const snapshot = job.snapshot;
  const generated = asRecord(snapshot.generated);
  const template = asRecord(generated?.template);
  const buildArtifact = resolvedBuildArtifact(snapshot);
  const rawFiles = Array.isArray(snapshot.draftFiles)
    ? snapshot.draftFiles
    : Array.isArray(generated?.files)
      ? generated.files
      : [];
  const files = rawFiles
    .map((file) => asRecord(file))
    .filter((file): file is Record<string, unknown> => Boolean(file))
    .map((file) => ({
      path: typeof file.path === "string" ? file.path : "",
      language: typeof file.language === "string" ? file.language : undefined,
      content: typeof file.content === "string" ? file.content : ""
    }))
    .filter((file) => file.path)
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    artifactBucket: nonEmptyString(buildArtifact.bucket),
    artifactKey: nonEmptyString(buildArtifact.key),
    artifactSha256: nonEmptyString(snapshot.artifactSha256) ?? nonEmptyString(buildArtifact.sha256),
    command: typeof generated?.command === "string" ? generated.command : undefined,
    description: typeof generated?.description === "string" ? generated.description : undefined,
    files,
    mountPath: typeof generated?.mountPath === "string" ? generated.mountPath : undefined,
    pluginName: typeof generated?.pluginName === "string" ? generated.pluginName : job.pluginName,
    pluginType: typeof template?.pluginType === "string" ? template.pluginType : undefined,
    templateId: job.templateId,
    version: typeof generated?.version === "string" ? generated.version : undefined
  };
}

export function hasVerifiedFactoryArtifact(job: VaultPluginFactoryJob, requireStoredArtifact: boolean): boolean {
  const autoRepair = asRecord(job.snapshot.autoRepair);
  const buildArtifact = resolvedBuildArtifact(job.snapshot);
  const evidence = factoryArtifactEvidence(job);
  const builtScaffoldSha256 = nonEmptyString(autoRepair?.scaffoldSha256);
  return Boolean(
    autoRepair?.status === "pass" &&
      evidence.artifactSha256 &&
      /^[a-f0-9]{64}$/i.test(evidence.artifactSha256) &&
      nonEmptyString(buildArtifact.sha256)?.toLowerCase() === evidence.artifactSha256.toLowerCase() &&
      builtScaffoldSha256 &&
      hashFactoryFiles(evidence.files) === builtScaffoldSha256 &&
      (!requireStoredArtifact || (evidence.artifactBucket && evidence.artifactKey))
  );
}

export async function factoryArtifactFingerprint(job: VaultPluginFactoryJob): Promise<string> {
  return createHash("sha256").update(JSON.stringify(factoryArtifactEvidence(job))).digest("hex");
}

function hashFactoryFiles(files: Array<{ path: string; content: string }>): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

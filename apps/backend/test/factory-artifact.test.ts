import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { factoryArtifactEvidence, hasVerifiedFactoryArtifact } from "../src/plugin-factory/factory-artifact";
import { MemoryStore } from "../src/store/memory-store";

const sha256 = "a".repeat(64);
const files = [{ path: "main.go", content: "package main\n" }];
const scaffoldSha256 = createHash("sha256")
  .update(`main.go\0package main\n\0`)
  .digest("hex");
const artifact = {
  bucket: "factory-artifacts",
  key: "factory-builds/run/artifact/plugin",
  sha256,
  architecture: "arm64",
  command: "test-plugin",
  builtAt: "2026-07-14T00:00:00.000Z"
};

async function createJob(snapshot: Record<string, unknown>) {
  const store = new MemoryStore();
  const owner = await store.getUserByEmail("developer@example.com");
  return store.createFactoryJob({ owner: owner!, pluginName: "test-plugin", snapshot });
}

describe("Factory artifact evidence", () => {
  it("accepts a persisted verified artifact for real Vault approval", async () => {
    const job = await createJob({
      artifactSha256: sha256,
      generated: { buildArtifact: artifact, files },
      autoRepair: { status: "pass", artifact, scaffoldSha256 }
    });

    expect(hasVerifiedFactoryArtifact(job, true)).toBe(true);
  });

  it("restores artifact evidence from the completed auto-repair result", async () => {
    const job = await createJob({
      generated: { files },
      autoRepair: { status: "pass", artifact, scaffoldSha256 }
    });

    expect(factoryArtifactEvidence(job)).toMatchObject({
      artifactBucket: artifact.bucket,
      artifactKey: artifact.key,
      artifactSha256: sha256
    });
    expect(hasVerifiedFactoryArtifact(job, true)).toBe(true);
  });

  it("rejects an unstored or checksum-mismatched artifact", async () => {
    const unstored = await createJob({
      artifactSha256: sha256,
      generated: { buildArtifact: { sha256 }, files },
      autoRepair: { status: "pass", artifact: { sha256 }, scaffoldSha256 }
    });
    const mismatched = await createJob({
      artifactSha256: "b".repeat(64),
      generated: { buildArtifact: artifact, files },
      autoRepair: { status: "pass", artifact, scaffoldSha256 }
    });

    expect(hasVerifiedFactoryArtifact(unstored, true)).toBe(false);
    expect(hasVerifiedFactoryArtifact(unstored, false)).toBe(true);
    expect(hasVerifiedFactoryArtifact(mismatched, true)).toBe(false);
  });

  it("rejects a verified artifact when the saved source differs from the built source", async () => {
    const job = await createJob({
      artifactSha256: sha256,
      draftFiles: [{ path: "main.go", content: "package changed\n" }],
      generated: { buildArtifact: artifact, files },
      autoRepair: { status: "pass", artifact, scaffoldSha256, files }
    });

    expect(hasVerifiedFactoryArtifact(job, true)).toBe(false);
  });
});

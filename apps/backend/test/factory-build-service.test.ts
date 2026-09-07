import type { CodeBuildClient } from "@aws-sdk/client-codebuild";
import type { S3Client } from "@aws-sdk/client-s3";
import type { VaultPluginGeneratedFile, VaultPluginRequirements } from "@security-portal/shared";
import { describe, expect, it, vi } from "vitest";
import { FactoryBuildService } from "../src/plugin-factory/factory-build-service";

const files: VaultPluginGeneratedFile[] = [
  { path: "go.mod", language: "go", content: "module example.com/test\n\ngo 1.22\n" },
  { path: "cmd/test/main.go", language: "go", content: "package main\nfunc main() {}\n" }
];

const requirements: VaultPluginRequirements = {
  targetSystem: "test",
  authMethod: "sealed configuration",
  apiBasePath: "not applicable",
  ttl: "15m",
  rotationStrategy: "rotate on demand",
  revokeStrategy: "revoke immediately",
  mountPath: "factory-lab/test",
  environment: "dev",
  confirmed: true,
  confirmedAt: new Date().toISOString()
};

describe("FactoryBuildService", () => {
  it("fails closed when the isolated builder is not configured", async () => {
    const repair = vi.fn();
    const service = new FactoryBuildService(
      { mode: "static", prefix: "factory", maxAttempts: 3, pollIntervalMs: 1, timeoutMs: 1000 },
      repair
    );

    const result = await service.run({ pluginName: "test", command: "test", files, requirements });
    expect(result.status).toBe("failed");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.diagnostics).toContain("CodeBuild");
    expect(repair).not.toHaveBeenCalled();
  });

  it("repairs a failed build once and returns the verified ARM64 artifact", async () => {
    let resultReads = 0;
    const s3 = {
      send: vi.fn(async (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetObjectCommand") {
          resultReads += 1;
          const pass = resultReads === 2;
          const payload = {
            status: pass ? "pass" : "fail",
            diagnostics_base64: Buffer.from(pass ? "ok" : "main.go:2: syntax error").toString("base64"),
            sha256: pass ? "a".repeat(64) : "",
            format_status: "pass",
            tidy_status: "pass",
            test_status: pass ? "pass" : "fail",
            build_status: pass ? "pass" : "fail"
          };
          return { Body: { transformToString: async () => JSON.stringify(payload) } };
        }
        return {};
      })
    } as unknown as S3Client;
    const codeBuild = {
      send: vi.fn(async (command: { constructor: { name: string } }) =>
        command.constructor.name === "StartBuildCommand"
          ? { build: { id: `build-${resultReads + 1}` } }
          : { builds: [{ buildStatus: "SUCCEEDED" }] }
      )
    } as unknown as CodeBuildClient;
    const repair = vi.fn(async () => ({
      files: [{ ...files[0] }, { ...files[1], content: "package main\nfunc main() {}\n" }],
      changedFiles: ["cmd/test/main.go"],
      summary: "Fixed the syntax error.",
      provider: "ollama" as const,
      model: "qwen3:8b"
    }));
    const service = new FactoryBuildService(
      {
        mode: "codebuild",
        projectName: "factory-build",
        bucket: "factory-bucket",
        prefix: "factory",
        maxAttempts: 2,
        pollIntervalMs: 1,
        timeoutMs: 1000
      },
      repair,
      { codeBuild, s3 }
    );

    const result = await service.run({ runId: "run-1", pluginName: "test", command: "test", files, requirements });
    expect(result.status).toBe("pass");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.repairedFiles).toEqual(["cmd/test/main.go"]);
    expect(result.artifact?.architecture).toBe("arm64");
    expect(result.artifact?.sha256).toBe("a".repeat(64));
    expect(repair).toHaveBeenCalledOnce();
  });

  it("stops the active CodeBuild run when the Factory job is cancelled", async () => {
    const controller = new AbortController();
    const phases: Array<string | undefined> = [];
    const s3 = {
      send: vi.fn(async () => ({}))
    } as unknown as S3Client;
    const codeBuild = {
      send: vi.fn(async (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "StartBuildCommand") return { build: { id: "build-cancel-1" } };
        if (command.constructor.name === "BatchGetBuildsCommand") {
          return { builds: [{ buildStatus: "IN_PROGRESS", currentPhase: "BUILD" }] };
        }
        return {};
      })
    } as unknown as CodeBuildClient;
    const service = new FactoryBuildService(
      {
        mode: "codebuild",
        projectName: "factory-build",
        bucket: "factory-bucket",
        prefix: "factory",
        maxAttempts: 3,
        pollIntervalMs: 1,
        timeoutMs: 1000
      },
      vi.fn(),
      { codeBuild, s3 }
    );

    const result = await service.run(
      { runId: "run-cancel", pluginName: "test", command: "test", files, requirements },
      (progress) => {
        phases.push(progress.phase);
        if (progress.phase === "building") controller.abort();
      },
      controller.signal
    );

    expect(result.status).toBe("cancelled");
    expect(result.phase).toBe("cancelled");
    expect(result.completedAt).toBeTruthy();
    expect(phases).toContain("building");
    expect(codeBuild.send).toHaveBeenCalledWith(expect.objectContaining({ input: { id: "build-cancel-1" } }));
  });
});

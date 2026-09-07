import { describe, expect, it, vi } from "vitest";
import { VaultPluginDistributor } from "../src/plugin-factory/plugin-distributor";

describe("VaultPluginDistributor", () => {
  it("uses an SSM /bin/sh compatible checksum-verified install command", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Command: { CommandId: "command-1" } })
      .mockResolvedValueOnce({ Status: "Success", StandardErrorContent: "" });
    const distributor = new VaultPluginDistributor(
      {
        mode: "ssm",
        instanceIds: ["i-test"],
        pluginDirectory: "/opt/vault/plugins",
        timeoutMs: 1000,
        pollIntervalMs: 1
      },
      { send } as never
    );

    const result = await distributor.distribute({
      bucket: "factory-artifacts",
      key: "factory-builds/run/artifact/vault-plugin-test",
      sha256: "a".repeat(64),
      architecture: "arm64",
      command: "vault-plugin-test",
      builtAt: new Date().toISOString()
    });

    const input = send.mock.calls[0]?.[0]?.input;
    const command = input?.Parameters?.commands?.[0] ?? "";
    expect(command).toContain("set -eu");
    expect(command).not.toContain("pipefail");
    expect(command).toContain("sha256sum -c -");
    expect(command).toContain("install -o vault -g vault -m 0750");
    expect(result.instanceIds).toEqual(["i-test"]);
  });
});

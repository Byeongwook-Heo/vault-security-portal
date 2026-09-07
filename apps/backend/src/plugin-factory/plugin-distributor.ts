import {
  GetCommandInvocationCommand,
  SendCommandCommand,
  SSMClient
} from "@aws-sdk/client-ssm";
import type { VaultPluginBuildArtifact } from "@security-portal/shared";

interface PluginDistributorConfig {
  mode: "mock" | "ssm";
  instanceIds: string[];
  pluginDirectory: string;
  timeoutMs: number;
  pollIntervalMs: number;
}

export interface PluginDistributionResult {
  mode: "mock" | "ssm";
  instanceIds: string[];
  detail: string;
}

export class VaultPluginDistributor {
  constructor(
    private readonly config: PluginDistributorConfig,
    private readonly ssm: SSMClient = new SSMClient({})
  ) {}

  async distribute(artifact: VaultPluginBuildArtifact): Promise<PluginDistributionResult> {
    if (this.config.mode === "mock") {
      return { mode: "mock", instanceIds: [], detail: "Artifact distribution is skipped in mock mode." };
    }
    if (!this.config.instanceIds.length) throw new Error("Vault plugin distribution requires Vault node IDs");
    assertSafeArtifact(artifact, this.config.pluginDirectory);

    const temporaryPath = `/tmp/${artifact.command}.${artifact.sha256.slice(0, 12)}`;
    const destination = `${this.config.pluginDirectory.replace(/\/+$/g, "")}/${artifact.command}`;
    const command = [
      "set -eu",
      `aws s3 cp 's3://${artifact.bucket}/${artifact.key}' '${temporaryPath}' --only-show-errors`,
      `printf '%s  %s\\n' '${artifact.sha256}' '${temporaryPath}' | sha256sum -c -`,
      `install -d -o vault -g vault -m 0750 '${this.config.pluginDirectory}'`,
      `install -o vault -g vault -m 0750 '${temporaryPath}' '${destination}'`,
      `rm -f '${temporaryPath}'`
    ].join("\n");

    const sent = await this.ssm.send(
      new SendCommandCommand({
        DocumentName: "AWS-RunShellScript",
        InstanceIds: this.config.instanceIds,
        Comment: `Vault Plugin Factory artifact ${artifact.sha256.slice(0, 12)}`,
        Parameters: { commands: [command] },
        TimeoutSeconds: Math.max(30, Math.ceil(this.config.timeoutMs / 1000))
      })
    );
    const commandId = sent.Command?.CommandId;
    if (!commandId) throw new Error("SSM did not return a command ID for plugin distribution");

    const pending = new Set(this.config.instanceIds);
    const failures: string[] = [];
    const deadline = Date.now() + this.config.timeoutMs;
    while (pending.size && Date.now() < deadline) {
      await delay(this.config.pollIntervalMs);
      for (const instanceId of [...pending]) {
        try {
          const invocation = await this.ssm.send(
            new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
          );
          if (["Pending", "InProgress", "Delayed"].includes(invocation.Status ?? "Pending")) continue;
          pending.delete(instanceId);
          if (invocation.Status !== "Success") {
            failures.push(`${instanceId}: ${invocation.Status} ${invocation.StandardErrorContent ?? ""}`.trim());
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/InvocationDoesNotExist/i.test(message)) continue;
          pending.delete(instanceId);
          failures.push(`${instanceId}: ${message}`);
        }
      }
    }
    for (const instanceId of pending) failures.push(`${instanceId}: distribution timed out`);
    if (failures.length) throw new Error(`Vault plugin distribution failed: ${failures.join("; ")}`);

    return {
      mode: "ssm",
      instanceIds: this.config.instanceIds,
      detail: `${artifact.command} was checksum-verified and installed on ${this.config.instanceIds.length} Vault nodes.`
    };
  }
}

function assertSafeArtifact(artifact: VaultPluginBuildArtifact, pluginDirectory: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(artifact.command)) throw new Error("Unsafe plugin command");
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) throw new Error("Invalid plugin binary SHA256");
  if (!/^[a-zA-Z0-9._/-]+$/.test(artifact.bucket) || !/^[a-zA-Z0-9._/-]+$/.test(artifact.key)) {
    throw new Error("Unsafe plugin artifact location");
  }
  if (!pluginDirectory.startsWith("/") || /['\n\r]/.test(pluginDirectory)) {
    throw new Error("Unsafe Vault plugin directory");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

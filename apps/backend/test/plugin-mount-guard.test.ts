import { describe, expect, it } from "vitest";
import type { VaultInventory } from "@security-portal/shared";
import { resolveManagedPluginMount } from "../src/vault/plugin-mount-guard";

const inventory: VaultInventory = {
  mode: "real",
  syncedAt: "2026-07-15T00:00:00.000Z",
  mounts: [
    {
      path: "factory-lab/github",
      kind: "secret",
      type: "vault-plugin-secrets-github",
      source: "external",
      catalogType: "secret"
    },
    {
      path: "sys",
      kind: "secret",
      type: "system",
      source: "builtin",
      catalogType: "secret"
    }
  ],
  plugins: [
    {
      name: "vault-plugin-secrets-github",
      pluginType: "secret",
      builtin: false,
      status: "orphaned",
      mountedPaths: ["factory-lab/github"]
    }
  ],
  summary: {
    totalMounts: 2,
    authMounts: 0,
    secretMounts: 2,
    catalogEntries: 0,
    builtinPlugins: 0,
    customPlugins: 1,
    mountedCustomPlugins: 1,
    registeredOnlyCustomPlugins: 0,
    unregisteredMountedPlugins: 1
  },
  warnings: []
};

describe("managed Vault plugin mount guard", () => {
  it("accepts an orphaned external custom plugin mount", () => {
    const resolved = resolveManagedPluginMount(inventory, {
      pluginName: "vault-plugin-secrets-github",
      pluginType: "secret",
      mountPath: "/factory-lab/github/"
    });

    expect(resolved.mountPath).toBe("factory-lab/github");
    expect(resolved.plugin.status).toBe("orphaned");
  });

  it("rejects built-in mounts", () => {
    expect(() => resolveManagedPluginMount(inventory, {
      pluginName: "system",
      pluginType: "secret",
      mountPath: "sys"
    })).toThrow("is not an external custom plugin mount");
  });

  it("rejects a stale plugin identity", () => {
    expect(() => resolveManagedPluginMount(inventory, {
      pluginName: "vault-plugin-secrets-kafka",
      pluginType: "secret",
      mountPath: "factory-lab/github"
    })).toThrow("no longer matches plugin vault-plugin-secrets-kafka");
  });
});

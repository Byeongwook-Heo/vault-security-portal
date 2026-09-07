import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemSummary } from "@security-portal/shared";
import type { AppConfig } from "../src/config";
import { createVaultClient } from "../src/vault/vault-client";

const config: AppConfig = {
  port: 4000,
  frontendOrigin: "http://localhost:3000",
  sessionCookieName: "sp_user",
  vaultMode: "real",
  vaultAuthMode: "token",
  vaultAddr: "http://vault.service:8200",
  vaultToken: "test-token",
  vaultAppRoleAuthMount: "approle",
  vaultSkipVerify: false,
  vaultUseSystemNamespace: false,
  vaultRequestTimeoutMs: 10000
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Vault live inventory", () => {
  it("classifies live mounts and custom catalog entries from Vault APIs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/mounts")) {
        return new Response(JSON.stringify({
          data: {
            "factory-lab/github/": {
              type: "vault-plugin-secrets-github",
              description: "GitHub plugin",
              running_plugin_version: "v0.1.0"
            },
            "factory-lab/orphan/": {
              type: "vault-plugin-secrets-orphan",
              description: "Orphaned plugin mount",
              running_plugin_version: "v0.3.0"
            },
            "kv/": { type: "kv", description: "Built-in KV" }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/auth")) {
        return new Response(JSON.stringify({
          data: { "approle/": { type: "approle", description: "AppRole" } }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/auth") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: { keys: ["approle"], key_info: { approle: { builtin: true, version: "v1.0.0" } } }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/secret") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: {
            keys: ["kv", "vault-plugin-secrets-github"],
            key_info: {
              kv: { builtin: true },
              "vault-plugin-secrets-github": { builtin: false }
            }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/database") && init?.method === "LIST") {
        return new Response(JSON.stringify({
          data: {
            keys: ["vault-plugin-database-redis"],
            key_info: { "vault-plugin-database-redis": { builtin: false } }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/secret/vault-plugin-secrets-github")) {
        return new Response(JSON.stringify({
          data: {
            builtin: false,
            command: "vault-plugin-secrets-github",
            sha256: "a".repeat(64),
            version: "v0.1.0"
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/plugins/catalog/database/vault-plugin-database-redis")) {
        return new Response(JSON.stringify({
          data: {
            builtin: false,
            command: "vault-plugin-database-redis",
            sha256: "b".repeat(64),
            version: "v0.2.0"
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient(config);

    const inventory = await client.inventory(true);

    expect(inventory.summary).toEqual({
      totalMounts: 4,
      authMounts: 1,
      secretMounts: 3,
      catalogEntries: 4,
      builtinPlugins: 2,
      customPlugins: 3,
      mountedCustomPlugins: 2,
      registeredOnlyCustomPlugins: 1,
      unregisteredMountedPlugins: 1
    });
    expect(inventory.mounts).toContainEqual(expect.objectContaining({
      path: "factory-lab/github",
      source: "external",
      catalogType: "secret"
    }));
    expect(inventory.plugins).toContainEqual(expect.objectContaining({
      name: "vault-plugin-secrets-github",
      status: "mounted",
      mountedPaths: ["factory-lab/github"]
    }));
    expect(inventory.plugins).toContainEqual(expect.objectContaining({
      name: "vault-plugin-database-redis",
      status: "registered",
      mountedPaths: []
    }));
    expect(inventory.plugins).toContainEqual(expect.objectContaining({
      name: "vault-plugin-secrets-orphan",
      status: "orphaned",
      mountedPaths: ["factory-lab/orphan"]
    }));
    expect(inventory.warnings).toContain("Detected 1 mounted external plugin without a catalog entry");
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "LIST")).toHaveLength(3);

    const mappings = await client.inspectMappings([{
      id: "system-test",
      name: "Test",
      description: "Test system",
      environment: "dev",
      ownerGroup: "test",
      allowedRequestTypes: ["CUSTOM_GITLAB_TOKEN"],
      vaultNamespace: "root",
      vaultMountMappings: [
        {
          id: "github",
          mountPath: "factory-lab/github/",
          roleName: "test",
          requestType: "CUSTOM_GITLAB_TOKEN",
          displayName: "GitHub",
          enabled: true
        },
        {
          id: "approle",
          mountPath: "auth/approle/",
          roleName: "test",
          requestType: "APPROLE_SECRET_ID",
          displayName: "AppRole",
          enabled: true
        },
        {
          id: "missing",
          mountPath: "missing/",
          roleName: "test",
          requestType: "CUSTOM_KAFKA_ACCESS",
          displayName: "Missing",
          enabled: true
        }
      ]
    }]);

    expect(mappings.map((mapping) => [mapping.mountPath, mapping.reachable, mapping.status])).toEqual([
      ["factory-lab/github/", true, 200],
      ["auth/approle/", true, 200],
      ["missing/", false, 404]
    ]);
  });

  it("reconciles namespace, mount, role, and runtime capability drift independently", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/mounts")) {
        return new Response(JSON.stringify({
          data: {
            "database/": { type: "database", description: "Database secrets" },
            "kv/": { type: "kv", description: "KV v2" }
          }
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/auth")) {
        return new Response(JSON.stringify({
          data: { "approle/": { type: "approle", description: "AppRole" } }
        }), { status: 200 });
      }
      if (url.includes("/v1/sys/plugins/catalog/") && init?.method === "LIST") {
        return new Response(JSON.stringify({ data: { keys: [], key_info: {} } }), { status: 200 });
      }
      if (url.endsWith("/v1/database/roles/app")) {
        return new Response(JSON.stringify({ data: { name: "app" } }), { status: 200 });
      }
      if (url.endsWith("/v1/auth/approle/role/portal")) {
        return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
      }
      if (url.endsWith("/v1/sys/capabilities-self")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { paths?: string[] };
        const capabilities = Object.fromEntries((body.paths ?? []).map((path) => [
          path,
          path.startsWith("kv/") ? ["deny"] : path.includes("missing/") ? ["deny"] : path.includes("creds/") ? ["read"] : ["update"]
        ]));
        return new Response(JSON.stringify({ data: capabilities }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient(config);
    const systems: SystemSummary[] = [{
      id: "payments",
      name: "Payments",
      description: "Payment API",
      environment: "prod" as const,
      ownerGroup: "payments",
      allowedRequestTypes: ["DB_CREDENTIAL", "APPROLE_SECRET_ID", "KV_READ", "CUSTOM_KAFKA_ACCESS"],
      vaultNamespace: "platform/payments",
      vaultMountMappings: [
        {
          id: "db",
          mountPath: "database/",
          roleName: "app",
          requestType: "DB_CREDENTIAL" as const,
          displayName: "Database",
          enabled: true
        },
        {
          id: "approle",
          mountPath: "auth/approle/",
          roleName: "portal",
          requestType: "APPROLE_SECRET_ID" as const,
          displayName: "AppRole",
          enabled: true
        },
        {
          id: "kv",
          mountPath: "kv/",
          roleName: "payments/config",
          requestType: "KV_READ" as const,
          displayName: "KV",
          enabled: true
        },
        {
          id: "missing",
          mountPath: "missing/",
          roleName: "kafka",
          requestType: "CUSTOM_KAFKA_ACCESS" as const,
          displayName: "Kafka",
          enabled: true
        }
      ]
    }];

    const report = await client.reconcile(systems, true);

    expect(report.routing).toEqual({
      mode: "root",
      desiredNamespaces: ["platform/payments"]
    });
    expect(report.summary).toMatchObject({
      total: 4,
      drifted: 4,
      unknown: 0,
      critical: 3,
      mappingDrift: 4,
      pluginDrift: 0
    });
    const database = report.items.find((item) => item.id === "mapping:payments:db");
    expect(database?.severity).toBe("warning");
    expect(database?.checks.map((check) => [check.kind, check.status])).toEqual([
      ["mount", "pass"],
      ["namespace", "fail"],
      ["role", "pass"],
      ["capability", "pass"]
    ]);
    const approle = report.items.find((item) => item.id === "mapping:payments:approle");
    expect(approle?.checks.find((check) => check.kind === "role")?.status).toBe("fail");
    const kv = report.items.find((item) => item.id === "mapping:payments:kv");
    expect(kv?.checks.find((check) => check.kind === "role")?.status).toBe("not-applicable");
    expect(kv?.checks.find((check) => check.kind === "capability")?.status).toBe("fail");
    const missing = report.items.find((item) => item.id === "mapping:payments:missing");
    expect(missing?.checks.find((check) => check.kind === "mount")?.status).toBe("fail");
  });

  it("repairs a missing plugin catalog entry without mutating the live mount", async () => {
    let registered = false;
    let registerBody: Record<string, unknown> | undefined;
    const mountMutations: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/plugins/catalog/secret/vault-plugin-secrets-github")) {
        if (init?.method === "POST") {
          registered = true;
          registerBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({}), { status: 200 });
        }
        return registered
          ? new Response(JSON.stringify({
              data: {
                command: "vault-plugin-secrets-github",
                sha256: "a".repeat(64),
                version: "v0.1.0"
              }
            }), { status: 200 })
          : new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
      }
      if (url.includes("/v1/sys/mounts") || url.includes("/v1/sys/auth")) {
        if (init?.method === "POST" || init?.method === "DELETE") mountMutations.push(`${init.method} ${url}`);
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient(config);

    const result = await client.repairPluginCatalog({
      pluginName: "vault-plugin-secrets-github",
      pluginType: "secret",
      version: "v0.1.0",
      command: "vault-plugin-secrets-github",
      artifactSha256: "a".repeat(64)
    });

    expect(result).toMatchObject({ repaired: true, pluginName: "vault-plugin-secrets-github" });
    expect(registerBody).toEqual({
      sha256: "a".repeat(64),
      command: "vault-plugin-secrets-github",
      version: "v0.1.0"
    });
    expect(mountMutations).toEqual([]);
  });

  it("refuses to overwrite a plugin catalog entry that differs from the approved artifact", async () => {
    let postCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/plugins/catalog/secret/vault-plugin-secrets-github")) {
        if (init?.method === "POST") postCalls += 1;
        return new Response(JSON.stringify({
          data: {
            command: "different-command",
            sha256: "b".repeat(64),
            version: "v0.1.0"
          }
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient(config);

    await expect(client.repairPluginCatalog({
      pluginName: "vault-plugin-secrets-github",
      pluginType: "secret",
      version: "v0.1.0",
      command: "vault-plugin-secrets-github",
      artifactSha256: "a".repeat(64)
    })).rejects.toThrow("does not match the approved artifact");
    expect(postCalls).toBe(0);
  });

  it("requires the inspected fingerprint before disabling a plugin mount", async () => {
    let mounted = true;
    let deleteCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/v1/sys/mounts") && init?.method === "GET") {
        return new Response(JSON.stringify({
          data: mounted
            ? {
                "factory-lab/github/": {
                  type: "vault-plugin-secrets-github",
                  description: "GitHub plugin",
                  running_plugin_version: "v0.1.0"
                }
              }
            : {}
        }), { status: 200 });
      }
      if (url.endsWith("/v1/sys/mounts/factory-lab/github") && init?.method === "DELETE") {
        deleteCalls += 1;
        mounted = false;
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ errors: ["not found"] }), { status: 404 });
    });
    const client = createVaultClient({ ...config, vaultPluginAllowedMountPrefix: "factory-lab" });
    const inspected = await client.inspectPluginMount({
      pluginType: "secret",
      mountPath: "factory-lab/github"
    });

    expect(inspected.exists).toBe(true);
    expect(inspected.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(client.removePluginMount({
      pluginType: "secret",
      mountPath: "factory-lab/github",
      expectedFingerprint: "0".repeat(64)
    })).rejects.toThrow("changed after inspection");
    expect(deleteCalls).toBe(0);

    const removed = await client.removePluginMount({
      pluginType: "secret",
      mountPath: "factory-lab/github",
      expectedFingerprint: inspected.fingerprint ?? ""
    });

    expect(removed).toMatchObject({ removed: true, mountPath: "factory-lab/github" });
    expect(deleteCalls).toBe(1);
    const deleteRequest = fetchMock.mock.calls.find((call) => call[1]?.method === "DELETE");
    expect(deleteRequest?.[1]?.body).toBeUndefined();
  });
});

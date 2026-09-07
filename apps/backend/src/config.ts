import "dotenv/config";

export interface AppConfig {
  port: number;
  databaseUrl?: string;
  frontendOrigin: string;
  sessionCookieName: string;
  vaultMode: "mock" | "real";
  vaultAddr?: string;
  vaultNamespace?: string;
  vaultAuthMode: "mock" | "token" | "approle" | "aws-iam" | "oidc-pass-through";
  vaultToken?: string;
  vaultRoleId?: string;
  vaultSecretId?: string;
  vaultPluginRoleId?: string;
  vaultPluginSecretId?: string;
  vaultPluginAllowedMountPrefix?: string;
  vaultPluginDistributionMode?: "mock" | "ssm";
  vaultPluginNodeIds?: string[];
  vaultPluginDirectory?: string;
  vaultAppRoleAuthMount: string;
  vaultSkipVerify: boolean;
  vaultUseSystemNamespace: boolean;
  vaultRequestTimeoutMs: number;
  llmMode: "rules" | "ollama";
  ollamaBaseUrl?: string;
  ollamaModel: string;
  ollamaApiKey?: string;
  ollamaRequestTimeoutMs: number;
  factoryBuildMode?: "static" | "codebuild";
  factoryBuildProject?: string;
  factoryBuildBucket?: string;
  factoryBuildPrefix?: string;
  factoryBuildMaxAttempts?: number;
  factoryBuildPollIntervalMs?: number;
  factoryBuildTimeoutMs?: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? "4000"),
    databaseUrl: process.env.DATABASE_URL,
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "sp_user",
    vaultMode: process.env.VAULT_MODE === "real" ? "real" : "mock",
    vaultAddr: process.env.VAULT_ADDR,
    vaultNamespace: process.env.VAULT_NAMESPACE,
    vaultAuthMode: parseVaultAuthMode(process.env.VAULT_AUTH_MODE),
    vaultToken: process.env.VAULT_TOKEN,
    vaultRoleId: process.env.VAULT_ROLE_ID,
    vaultSecretId: process.env.VAULT_SECRET_ID,
    vaultPluginRoleId: process.env.VAULT_PLUGIN_ROLE_ID,
    vaultPluginSecretId: process.env.VAULT_PLUGIN_SECRET_ID,
    vaultPluginAllowedMountPrefix: process.env.VAULT_PLUGIN_ALLOWED_MOUNT_PREFIX,
    vaultPluginDistributionMode: process.env.VAULT_PLUGIN_DISTRIBUTION_MODE === "ssm" ? "ssm" : "mock",
    vaultPluginNodeIds: csv(process.env.VAULT_PLUGIN_NODE_IDS),
    vaultPluginDirectory: process.env.VAULT_PLUGIN_DIRECTORY ?? "/opt/vault/plugins",
    vaultAppRoleAuthMount: process.env.VAULT_APPROLE_AUTH_MOUNT ?? "approle",
    vaultSkipVerify: process.env.VAULT_SKIP_VERIFY === "true",
    vaultUseSystemNamespace: process.env.VAULT_USE_SYSTEM_NAMESPACE === "true",
    vaultRequestTimeoutMs: Number(process.env.VAULT_REQUEST_TIMEOUT_MS ?? "10000"),
    llmMode: process.env.LLM_MODE === "ollama" ? "ollama" : "rules",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    ollamaModel: process.env.OLLAMA_MODEL ?? "qwen3:8b",
    ollamaApiKey: process.env.OLLAMA_API_KEY,
    ollamaRequestTimeoutMs: Number(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? "90000"),
    factoryBuildMode: process.env.FACTORY_BUILD_MODE === "codebuild" ? "codebuild" : "static",
    factoryBuildProject: process.env.FACTORY_BUILD_PROJECT,
    factoryBuildBucket: process.env.FACTORY_BUILD_BUCKET,
    factoryBuildPrefix: process.env.FACTORY_BUILD_PREFIX ?? "factory-builds",
    factoryBuildMaxAttempts: boundedInteger(process.env.FACTORY_BUILD_MAX_ATTEMPTS, 3, 1, 4),
    factoryBuildPollIntervalMs: boundedInteger(process.env.FACTORY_BUILD_POLL_INTERVAL_MS, 3000, 1000, 15000),
    factoryBuildTimeoutMs: boundedInteger(process.env.FACTORY_BUILD_TIMEOUT_MS, 600000, 60000, 900000)
  };
}

function parseVaultAuthMode(value: string | undefined): AppConfig["vaultAuthMode"] {
  switch (value) {
    case "token":
    case "approle":
    case "aws-iam":
    case "oidc-pass-through":
      return value;
    default:
      return "mock";
  }
}

function csv(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

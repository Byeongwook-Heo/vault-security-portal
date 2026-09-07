import crypto from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { z } from "zod";
import {
  userRoles,
  userStatuses,
  type AccessRequest,
  type IssuedCredential,
  type PortalUser,
  type VaultPluginAutoRepairResult,
  type VaultInventory,
  type VaultPluginCatalogRepairInspection,
  type VaultPluginFactoryJob,
  type VaultPluginFactoryJobEvent,
  type VaultPluginMountTarget,
  type VaultPluginRequirementsInterview
} from "@security-portal/shared";
import { loadConfig } from "./config";
import { clearSessionCookie, readCookie, setSessionCookie } from "./auth/cookies";
import { MemoryStore } from "./store/memory-store";
import { PostgresStore } from "./store/postgres-store";
import type { PortalStore } from "./store/types";
import { generateVaultPluginScaffold, vaultPluginTemplates } from "./plugin-factory/catalog";
import { FactoryAssistant } from "./plugin-factory/factory-assistant";
import {
  factoryArtifactEvidence,
  factoryArtifactFingerprint,
  hasVerifiedFactoryArtifact
} from "./plugin-factory/factory-artifact";
import { FactoryBuildService } from "./plugin-factory/factory-build-service";
import {
  recoverStalledFactoryBuildJobs,
  restoreCompletedFactoryBuildSnapshots
} from "./plugin-factory/factory-job-recovery";
import { FactoryRequirementsInterviewer } from "./plugin-factory/factory-requirements";
import { VaultPluginDistributor } from "./plugin-factory/plugin-distributor";
import {
  buildPortalAssistantSnapshot,
  PortalAssistant,
  portalAssistantViews
} from "./portal-assistant";
import { redact } from "./utils/redact";
import { normalizeManagedMountPath, resolveManagedPluginMount } from "./vault/plugin-mount-guard";
import { createVaultClient } from "./vault/vault-client";
import { createVaultUiProxy } from "./vault/vault-ui-proxy";
import { WorkflowService } from "./workflow/workflow-service";

const requestSchema = z.object({
  systemId: z.string().min(1),
  requestType: z.enum([
    "KV_READ",
    "KV_WRITE",
    "DB_CREDENTIAL",
    "PKI_CERTIFICATE",
    "SSH_CERTIFICATE",
    "APPROLE_SECRET_ID",
    "CUSTOM_GITLAB_TOKEN",
    "CUSTOM_JENKINS_TOKEN",
    "CUSTOM_ARTIFACTORY_TOKEN",
    "CUSTOM_KAFKA_ACCESS",
    "CUSTOM_LEGACY_API_TOKEN",
    "NETWORK_DEVICE_ROTATION"
  ]),
  reason: z.string().min(3),
  ttl: z.string().regex(/^\d+[smhd]$/),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  payload: z.record(z.unknown()).default({})
});

const bulkRequestSchema = z.object({
  requests: z.array(requestSchema).min(1).max(50)
});

const bulkCredentialActionSchema = z.object({
  credentialIds: z.array(z.string().uuid()).min(1).max(50)
});

const userAccessSchema = z
  .object({
    roles: z.array(z.enum(userRoles)).min(1).optional(),
    groups: z.array(z.string().min(1)).optional(),
    status: z.enum(userStatuses).optional(),
    mfaEnabled: z.boolean().optional(),
    passwordResetRequired: z.boolean().optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one user access field is required"
  });

const pluginRequirementsDraftSchema = z.object({
  targetSystem: z.string().trim().max(200),
  authMethod: z.string().trim().max(300),
  apiBasePath: z.string().trim().max(300),
  ttl: z.string().trim().max(80),
  rotationStrategy: z.string().trim().max(500),
  revokeStrategy: z.string().trim().max(500),
  mountPath: z.string().trim().max(120),
  environment: z.enum(["dev", "staging", "prod"]),
  confirmed: z.boolean(),
  confirmedAt: z.string().datetime().optional()
});

const pluginRequirementsSchema = pluginRequirementsDraftSchema.extend({
  targetSystem: z.string().trim().min(1).max(200),
  authMethod: z.string().trim().min(1).max(300),
  apiBasePath: z.string().trim().min(1).max(300),
  ttl: z.string().trim().min(1).max(80),
  rotationStrategy: z.string().trim().min(1).max(500),
  revokeStrategy: z.string().trim().min(1).max(500),
  mountPath: z.string().trim().min(1).max(120)
});

const pluginRequirementsInterviewSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().min(1).max(120),
  requestedApply: z.boolean(),
  spec: pluginRequirementsDraftSchema,
  missingFields: z.array(
    z.enum(["targetSystem", "authMethod", "apiBasePath", "ttl", "rotationStrategy", "revokeStrategy", "mountPath"])
  ),
  readyToConfirm: z.boolean(),
  provider: z.enum(["ollama", "rules"]),
  model: z.string().max(120).optional(),
  reply: z.string().max(2000),
  updatedAt: z.string().datetime()
});

const pluginGenerateSchema = z.object({
  interviewId: z.string().uuid(),
  templateId: z.string().min(1),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  version: z.string().regex(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  command: z.string().min(1).max(120),
  description: z.string().max(300).optional(),
  requirements: pluginRequirementsSchema.refine((value) => value.confirmed, "Confirmed requirements are required")
});

const pluginApplySchema = z.object({
  jobId: z.string().uuid(),
  pluginType: z.enum(["auth", "secret", "database"]),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  version: z.string().regex(/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
  command: z.string().min(1).max(120),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  description: z.string().max(300).optional(),
  artifactBucket: z.string().max(255).optional(),
  artifactKey: z.string().max(1024).optional()
});

const pluginRollbackSchema = z.object({
  jobId: z.string().uuid(),
  pluginType: z.enum(["auth", "secret", "database"]),
  pluginName: z.string().min(1).max(80),
  mountPath: z.string().min(1).max(120),
  removeCatalog: z.boolean().default(false)
});

const pluginMountRemovalSchema = z.object({
  confirmation: z.string().min(1).max(120),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/i)
});

const managedPluginMountTargetSchema = z.object({
  pluginName: z.string().trim().min(1).max(120),
  pluginType: z.enum(["auth", "secret", "database"]),
  mountPath: z.string().trim().min(1).max(120)
});

const managedPluginMountRemovalSchema = managedPluginMountTargetSchema.extend({
  confirmation: z.string().min(1).max(120),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/i)
});

const pluginCatalogRepairTargetSchema = z.object({
  pluginName: z.string().trim().min(1).max(120),
  pluginType: z.enum(["auth", "secret", "database"])
});

const pluginCatalogRepairSchema = pluginCatalogRepairTargetSchema.extend({
  jobId: z.string().uuid(),
  artifactFingerprint: z.string().regex(/^[a-f0-9]{64}$/i)
});

const pluginChatSchema = z.object({
  locale: z.enum(["ko", "en"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .min(1)
    .max(20),
  selectedTemplateId: z.string().max(120).optional(),
  generatedPluginName: z.string().max(120).optional()
});

const portalAssistantChatSchema = z.object({
  locale: z.enum(["ko", "en"]),
  view: z.enum(portalAssistantViews),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000)
      })
    )
    .min(1)
    .max(20)
});

const factoryJobStatusSchema = z.enum([
  "draft",
  "running",
  "cancelled",
  "waiting-approval",
  "approved",
  "rejected",
  "scheduled",
  "complete",
  "failed",
  "rolled-back"
]);

const factoryJobStageSchema = z.enum([
  "design",
  "generate",
  "test",
  "security-review",
  "approval",
  "deploy",
  "complete"
]);

const factoryJobEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(160),
  detail: z.string().max(1000),
  status: z.enum(["pending", "running", "success", "warning", "failed"]),
  createdAt: z.string().datetime()
});

const factoryJobCreateSchema = z.object({
  templateId: z.string().max(120).optional(),
  pluginName: z.string().min(1).max(120),
  historyTitle: z.string().trim().min(1).max(120).optional(),
  historyNote: z.string().trim().max(500).optional(),
  status: factoryJobStatusSchema.optional(),
  stage: factoryJobStageSchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  snapshot: z.record(z.unknown()).optional(),
  events: z.array(factoryJobEventSchema).max(100).optional(),
  deployment: z
    .object({
      mode: z.enum(["full", "canary"]).optional(),
      environment: z.enum(["dev", "staging", "prod"]).optional(),
      scheduledFor: z.string().datetime().optional(),
      rollbackReady: z.boolean().optional()
    })
    .optional()
});

const factoryJobUpdateSchema = z
  .object({
    templateId: z.string().max(120).optional(),
    pluginName: z.string().min(1).max(120).optional(),
    historyTitle: z.string().trim().min(1).max(120).optional(),
    historyNote: z.string().trim().max(500).optional(),
    status: factoryJobStatusSchema.optional(),
    stage: factoryJobStageSchema.optional(),
    progress: z.number().int().min(0).max(100).optional(),
    snapshot: z.record(z.unknown()).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
    events: z.array(factoryJobEventSchema).max(100).optional(),
    deployment: z
      .object({
        mode: z.enum(["full", "canary"]),
        environment: z.enum(["dev", "staging", "prod"]),
        scheduledFor: z.string().datetime().optional(),
        rollbackReady: z.boolean()
      })
      .optional()
  })
  .refine((value) => Object.entries(value).some(([key, field]) => key !== "expectedUpdatedAt" && field !== undefined), {
    message: "At least one Factory job field is required"
  })
  .refine((value) => !value.snapshot || Boolean(value.expectedUpdatedAt), {
    message: "expectedUpdatedAt is required when saving a Factory snapshot"
  });

const protectedFactoryJobDeleteStatuses = new Set<VaultPluginFactoryJob["status"]>([
  "running",
  "waiting-approval",
  "approved",
  "scheduled"
]);

const factoryJobActionSchema = z.object({
  action: z.enum(["request-approval", "approve", "reject", "schedule", "canary", "full", "retry", "rollback", "cancel"]),
  note: z.string().trim().max(500).optional(),
  scheduledFor: z.string().datetime().optional()
});

const pluginRebuildSchema = z.object({
  jobId: z.string().uuid(),
  pluginName: z.string().min(1).max(80),
  command: z.string().min(1).max(120),
  requirements: pluginRequirementsSchema.refine((value) => value.confirmed, "Confirmed requirements are required"),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(240).refine((value) => !value.includes("..") && !value.startsWith("/"), "Invalid file path"),
        language: z.enum(["go", "hcl", "markdown", "makefile", "dockerfile", "json", "text"]),
        content: z.string().max(120_000)
      })
    )
    .min(1)
    .max(40)
});

const requirementsStartSchema = z.object({
  locale: z.enum(["ko", "en"]),
  templateId: z.string().min(1).max(120),
  requestedApply: z.boolean().default(false)
});

const requirementsAnswerSchema = z.object({
  locale: z.enum(["ko", "en"]),
  interview: pluginRequirementsInterviewSchema,
  message: z.string().trim().min(1).max(2000)
});

const requirementsConfirmSchema = z.object({
  locale: z.enum(["ko", "en"]),
  interview: pluginRequirementsInterviewSchema
});

const approvalActionSchema = z.object({
  ttl: z.string().regex(/^\d+[smhd]$/).optional(),
  note: z.string().max(500).optional()
});

const rejectionActionSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

type FactoryBuildRunRecord = {
  ownerId: string;
  jobId: string;
  result: VaultPluginAutoRepairResult;
  controller: AbortController;
  cancelled: boolean;
  persisted: boolean;
};

type FactoryRequirementsRecord = {
  ownerId: string;
  interview: VaultPluginRequirementsInterview;
  expiresAt: number;
};

async function main(): Promise<void> {
  const config = loadConfig();
  const store: PortalStore = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore();
  await store.initialize();
  const vault = createVaultClient(config);
  const workflow = new WorkflowService(store, vault);
  const factoryAssistant = new FactoryAssistant(
    {
      mode: config.llmMode,
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaModel,
      apiKey: config.ollamaApiKey,
      timeoutMs: config.ollamaRequestTimeoutMs
    },
    vaultPluginTemplates
  );
  const portalAssistant = new PortalAssistant({
    mode: config.llmMode,
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    apiKey: config.ollamaApiKey,
    timeoutMs: config.ollamaRequestTimeoutMs
  });
  const requirementsInterviewer = new FactoryRequirementsInterviewer(
    {
      mode: config.llmMode,
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaModel,
      apiKey: config.ollamaApiKey,
      timeoutMs: config.ollamaRequestTimeoutMs
    },
    vaultPluginTemplates
  );
  const factoryBuildService = new FactoryBuildService(
    {
      mode: config.factoryBuildMode ?? "static",
      projectName: config.factoryBuildProject,
      bucket: config.factoryBuildBucket,
      prefix: config.factoryBuildPrefix ?? "factory-builds",
      maxAttempts: config.factoryBuildMaxAttempts ?? 3,
      pollIntervalMs: config.factoryBuildPollIntervalMs ?? 3000,
      timeoutMs: config.factoryBuildTimeoutMs ?? 600000
    },
    (input) => factoryAssistant.repairGeneratedFiles(input)
  );
  const pluginDistributor = new VaultPluginDistributor({
    mode: config.vaultPluginDistributionMode ?? "mock",
    instanceIds: config.vaultPluginNodeIds ?? [],
    pluginDirectory: config.vaultPluginDirectory ?? "/opt/vault/plugins",
    timeoutMs: 180000,
    pollIntervalMs: 3000
  });
  const factoryBuildRuns = new Map<string, FactoryBuildRunRecord>();
  const factoryRequirementsInterviews = new Map<string, FactoryRequirementsRecord>();
  await restoreCompletedFactoryBuildSnapshots(store);
  await recoverStalledFactoryBuildJobs(store, config.factoryBuildTimeoutMs ?? 600000);
  const vaultSystemActor: PortalUser = {
    id: "system",
    email: "system",
    displayName: "System",
    groups: [],
    roles: ["vault-admin"]
  };

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    if (req.url === "/api") {
      req.url = "/";
    } else if (req.url.startsWith("/api/")) {
      req.url = req.url.slice(4);
    }
    next();
  });
  app.all(
    ["/ui", "/ui/*", "/v1", "/v1/*"],
    requireUser(store, config.sessionCookieName),
    createVaultUiProxy({ vaultMode: config.vaultMode, vaultAddr: config.vaultAddr })
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "security-portal-backend" });
  });

  app.get("/health/vault", async (_req, res, next) => {
    try {
      res.json(await vault.health());
    } catch (error) {
      next(error);
    }
  });

  app.get("/health/llm", async (_req, res) => {
    const health = await factoryAssistant.health();
    res.status(health.ok ? 200 : 503).json(health);
  });

  app.get("/health/vault/mappings", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const systems = await store.listSystems(vaultSystemActor);
      res.json({ mappings: await vault.inspectMappings(systems) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/vault/status", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const canViewInventory = req.user.roles.some((role) => role === "vault-admin" || role === "auditor");
      const forceRefresh = canViewInventory && req.query.refresh === "true";
      const systems = await store.listSystems(vaultSystemActor);
      const reconciliation = canViewInventory ? await vault.reconcile(systems, forceRefresh) : undefined;
      const inventory = canViewInventory ? await vault.inventory(false) : undefined;
      const [health, mappings] = await Promise.all([vault.health(), vault.inspectMappings(systems)]);
      res.set("Cache-Control", "no-store");
      res.json({
        health,
        mappings,
        ...(inventory ? { inventory } : {}),
        ...(reconciliation ? { reconciliation } : {}),
        syncedAt: inventory?.syncedAt ?? new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/assistant/chat", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = portalAssistantChatSchema.parse(req.body);
      const [systems, allRequests, allCredentials, allAuditEvents, vaultHealth] = await Promise.all([
        store.listSystems(req.user),
        store.listRequests(),
        store.listCredentials(),
        store.listAuditEvents(),
        vault.health()
      ]);
      const requests = visibleRequests(req.user, allRequests);
      const credentials = visibleCredentials(req.user, allCredentials, requests);
      const visibleTargetIds = new Set([
        ...requests.map((request) => request.id),
        ...credentials.map((credential) => credential.id)
      ]);
      const auditEvents = canViewAllWorkflows(req.user)
        ? allAuditEvents
        : allAuditEvents.filter((event) => event.actorId === req.user.id || visibleTargetIds.has(event.targetId));
      const canInspectVault = req.user.roles.some((role) => role === "vault-admin" || role === "auditor");
      const [mappingHealth, inventory, reconciliation] = await Promise.all([
        vault.inspectMappings(systems),
        canInspectVault ? vault.inventory(false) : Promise.resolve(undefined),
        canInspectVault ? vault.reconcile(systems, false) : Promise.resolve(undefined)
      ]);
      const snapshot = buildPortalAssistantSnapshot({
        view: body.view,
        user: req.user,
        systems,
        requests,
        credentials,
        auditEvents,
        vaultHealth,
        mappingHealth,
        inventory,
        reconciliation,
        syncedAt: inventory?.syncedAt ?? reconciliation?.syncedAt ?? new Date().toISOString()
      });
      const result = await portalAssistant.chat({
        locale: body.locale,
        messages: body.messages,
        snapshot
      });
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "portal_assistant.chat",
        targetType: "portal_view",
        targetId: body.view,
        result: "success",
        metadata: {
          provider: result.provider,
          model: result.model,
          action: result.action.type,
          action_view: result.action.view,
          fallback_reason: result.fallbackReason,
          latency_ms: result.latencyMs
        }
      });
      res.set("Cache-Control", "no-store");
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/vault/plugin-mounts/inspect",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = managedPluginMountTargetSchema.parse(req.body);
        const target = resolveManagedPluginMount(await vault.inventory(true), body);
        const result = await vault.inspectPluginMount(target);
        if (!result.exists || !result.fingerprint) {
          throw new Error(`Vault mount ${target.mountPath} was not found after inventory refresh`);
        }
        res.set("Cache-Control", "no-store");
        res.json({ result });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/vault/plugin-mounts/remove",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      let attemptedTarget: z.infer<typeof managedPluginMountTargetSchema> | undefined;
      try {
        const body = managedPluginMountRemovalSchema.parse(req.body);
        attemptedTarget = body;
        const target = resolveManagedPluginMount(await vault.inventory(true), body);
        if (normalizeManagedMountPath(body.confirmation) !== target.mountPath) {
          throw new Error(`Type ${target.mountPath} exactly to confirm Vault mount removal`);
        }

        const result = await vault.removePluginMount({
          pluginType: target.pluginType,
          mountPath: target.mountPath,
          expectedFingerprint: body.expectedFingerprint
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.mount_removed",
          targetType: "vault_plugin_mount",
          targetId: target.mountPath,
          result: result.removed ? "success" : "failure",
          metadata: redact({
            plugin_name: target.pluginName,
            plugin_type: target.pluginType,
            mount_path: target.mountPath,
            catalog_retained: true,
            steps: result.steps,
            detail: result.detail
          })
        });
        res.set("Cache-Control", "no-store");
        res.json({ result });
      } catch (error) {
        if (attemptedTarget) {
          try {
            await store.createAuditEvent({
              actorId: req.user.id,
              actorEmail: req.user.email,
              action: "vault_plugin.mount_remove_failed",
              targetType: "vault_plugin_mount",
              targetId: normalizeManagedMountPath(attemptedTarget.mountPath),
              result: "failure",
              metadata: redact({
                plugin_name: attemptedTarget.pluginName,
                plugin_type: attemptedTarget.pluginType,
                error: error instanceof Error ? error.message : String(error)
              })
            });
          } catch (auditError) {
            console.error(
              "failed to audit managed Vault mount removal",
              redact({ message: auditError instanceof Error ? auditError.message : String(auditError) })
            );
          }
        }
        next(error);
      }
    }
  );

  app.post(
    "/vault/reconciliation/plugin-catalog/inspect",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const target = pluginCatalogRepairTargetSchema.parse(req.body);
        const context = await inspectPluginCatalogRepair(
          store,
          await vault.inventory(true),
          target,
          config.vaultMode === "real"
        );
        res.set("Cache-Control", "no-store");
        res.json({ inspection: context.inspection });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/vault/reconciliation/plugin-catalog/repair",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      let attemptedTarget: z.infer<typeof pluginCatalogRepairTargetSchema> | undefined;
      try {
        const body = pluginCatalogRepairSchema.parse(req.body);
        attemptedTarget = body;
        const context = await inspectPluginCatalogRepair(
          store,
          await vault.inventory(true),
          body,
          config.vaultMode === "real"
        );
        if (context.inspection.status !== "repairable" || !context.job || !context.evidence) {
          res.status(409).json({
            error: context.inspection.status === "resolved"
              ? "The live Plugin Catalog is already aligned"
              : "A matching approved Factory artifact is required for Catalog repair"
          });
          return;
        }
        if (
          context.job.id !== body.jobId ||
          context.inspection.candidate?.artifactFingerprint !== body.artifactFingerprint
        ) {
          res.status(409).json({ error: "The Catalog repair plan changed; inspect it again" });
          return;
        }

        const evidence = context.evidence;
        if (!evidence.version || !evidence.command || !evidence.artifactSha256) {
          throw new Error("The approved Factory artifact is missing Catalog registration metadata");
        }
        let distribution: Awaited<ReturnType<typeof pluginDistributor.distribute>> | undefined;
        if (config.vaultMode === "real") {
          if (!evidence.artifactBucket || !evidence.artifactKey) {
            throw new Error("A stored build artifact is required for real Vault Catalog repair");
          }
          distribution = await pluginDistributor.distribute({
            bucket: evidence.artifactBucket,
            key: evidence.artifactKey,
            sha256: evidence.artifactSha256,
            architecture: "arm64",
            command: evidence.command,
            builtAt: new Date().toISOString()
          });
        }

        const result = await vault.repairPluginCatalog({
          pluginName: body.pluginName,
          pluginType: body.pluginType,
          version: evidence.version,
          command: evidence.command,
          artifactSha256: evidence.artifactSha256
        });
        if (distribution) result.detail = { ...result.detail, distribution };
        const latest = (await store.getFactoryJob(context.job.id)) ?? context.job;
        await store.updateFactoryJob(latest.id, {
          status: "complete",
          stage: "complete",
          progress: 100,
          deployment: { ...latest.deployment, rollbackReady: true },
          events: [
            ...latest.events,
            {
              id: crypto.randomUUID(),
              label: "catalog-repaired",
              detail: `${body.pluginName} (${result.mode})`,
              status: "success" as const,
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.catalog_repaired",
          targetType: "vault_plugin",
          targetId: body.pluginName,
          result: "success",
          metadata: redact({
            plugin_type: body.pluginType,
            mounted_paths: context.inspection.mountedPaths,
            factory_job_id: context.job.id,
            artifact_sha256: evidence.artifactSha256,
            repaired: result.repaired,
            steps: result.steps,
            detail: result.detail
          })
        });
        res.set("Cache-Control", "no-store");
        res.json({ result, jobId: context.job.id });
      } catch (error) {
        if (attemptedTarget) {
          try {
            await store.createAuditEvent({
              actorId: req.user.id,
              actorEmail: req.user.email,
              action: "vault_plugin.catalog_repair_failed",
              targetType: "vault_plugin",
              targetId: attemptedTarget.pluginName,
              result: "failure",
              metadata: redact({
                plugin_type: attemptedTarget.pluginType,
                error: error instanceof Error ? error.message : String(error)
              })
            });
          } catch (auditError) {
            console.error(
              "failed to audit Vault Catalog repair",
              redact({ message: auditError instanceof Error ? auditError.message : String(auditError) })
            );
          }
        }
        next(error);
      }
    }
  );

  app.post("/auth/mock-login", async (req, res, next) => {
    try {
      const email = z.object({ email: z.string().email() }).parse(req.body).email;
      const user = await store.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: "Unknown mock user" });
        return;
      }
      if ("status" in user && user.status !== "active") {
        res.status(403).json({ error: `User is ${user.status}` });
        return;
      }
      await store.recordUserLogin(user.id);
      setSessionCookie(res, config.sessionCookieName, user.id);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.get("/auth/me", requireUser(store, config.sessionCookieName), (req, res) => {
    res.json({ user: req.user });
  });

  app.post("/auth/logout", (_req, res) => {
    clearSessionCookie(res, config.sessionCookieName);
    res.json({ ok: true });
  });

  app.get("/systems", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ systems: await store.listSystems(req.user) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/systems/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const system = (await store.listSystems(req.user)).find((item) => item.id === requiredParam(req, "id"));
      if (!system) {
        res.status(404).json({ error: "System not found" });
        return;
      }
      res.json({ system });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = requestSchema.parse(req.body);
      const request = await workflow.createRequest({
        actor: req.user,
        ...body
      });
      res.status(201).json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/bulk", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = bulkRequestSchema.parse(req.body);
      res.status(201).json({ result: await workflow.createRequests(req.user, body.requests) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/requests", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const requests = await store.listRequests();
      res.json({ requests: visibleRequests(_req.user, requests) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/requests/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const request = await store.getRequest(requiredParam(req, "id"));
      if (!request) {
        res.status(404).json({ error: "Request not found" });
        return;
      }
      if (!canViewRequest(req.user, request)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json({ request });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/approve", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = approvalActionSchema.parse(req.body ?? {});
      res.json({ request: await workflow.approveRequest(req.user, requiredParam(req, "id"), body) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/reject", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = rejectionActionSchema.parse(req.body ?? {});
      res.json({ request: await workflow.rejectRequest(req.user, requiredParam(req, "id"), body.reason) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/requests/:id/execute", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ credential: await workflow.executeRequest(req.user, requiredParam(req, "id")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/credentials", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const [credentials, requests] = await Promise.all([store.listCredentials(), store.listRequests()]);
      res.json({ credentials: visibleCredentials(_req.user, credentials, requests) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/credentials/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const credential = await store.getCredential(requiredParam(req, "id"));
      if (!credential) {
        res.status(404).json({ error: "Credential not found" });
        return;
      }
      const request = await store.getRequest(credential.requestId);
      if (!request || !canViewRequest(req.user, request)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      res.json({ credential });
    } catch (error) {
      next(error);
    }
  });

  app.post("/credentials/:id/revoke", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({ credential: await workflow.revokeCredential(req.user, requiredParam(req, "id")) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/credentials/bulk-revoke", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = bulkCredentialActionSchema.parse(req.body);
      res.json({ result: await workflow.revokeCredentials(req.user, body.credentialIds) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/audit-events", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const events = await store.listAuditEvents();
      if (canViewAllWorkflows(req.user)) {
        res.json({ auditEvents: events });
        return;
      }
      const requests = visibleRequests(req.user, await store.listRequests());
      const credentials = visibleCredentials(req.user, await store.listCredentials(), requests);
      const visibleTargets = new Set([...requests.map((item) => item.id), ...credentials.map((item) => item.id)]);
      res.json({
        auditEvents: events.filter((event) => event.actorId === req.user.id || visibleTargets.has(event.targetId))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/admin/plugin-catalog",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin", "auditor"]),
    async (req, res, next) => {
      try {
        const inventory = await vault.inventory(req.query.refresh === "true");
        res.set("Cache-Control", "no-store");
        res.json({
          inventory,
          plugins: inventory.plugins.filter((plugin) => !plugin.builtin)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/plugin-factory/templates", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.json({
      templates: vaultPluginTemplates,
      runtime: {
        vaultMode: config.vaultMode,
        buildMode: config.factoryBuildMode ?? "static",
        requiredMountPrefix: config.vaultPluginAllowedMountPrefix ?? ""
      },
      counts: {
        total: vaultPluginTemplates.length,
        auth: vaultPluginTemplates.filter((template) => template.pluginType === "auth").length,
        secret: vaultPluginTemplates.filter((template) => template.pluginType === "secret").length,
        database: vaultPluginTemplates.filter((template) => template.pluginType === "database").length,
        partner: vaultPluginTemplates.filter((template) => template.source === "partner").length,
        community: vaultPluginTemplates.filter((template) => template.source === "community").length,
        learning: vaultPluginTemplates.filter((template) => template.source === "learning").length,
        communityTop5: vaultPluginTemplates.filter((template) => template.popularity?.rank).length
      }
    });
  });

  app.post(
    "/plugin-factory/requirements/start",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = requirementsStartSchema.parse(req.body);
        const interview = requirementsInterviewer.start({
          ...body,
          mountPrefix: config.vaultMode === "real" ? config.vaultPluginAllowedMountPrefix : undefined
        });
        factoryRequirementsInterviews.set(interview.id, {
          ownerId: req.user.id,
          interview,
          expiresAt: Date.now() + 60 * 60 * 1000
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.requirements.started",
          targetType: "vault_plugin_template",
          targetId: body.templateId,
          result: "success",
          metadata: { interview_id: interview.id, requested_apply: interview.requestedApply }
        });
        res.status(201).json({ interview });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/requirements/answer",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = requirementsAnswerSchema.parse(req.body);
        const record = requireFactoryRequirementsInterview(
          factoryRequirementsInterviews,
          body.interview.id,
          req.user.id
        );
        assertInterviewIdentity(record.interview, body.interview);
        const interview = await requirementsInterviewer.answer({
          locale: body.locale,
          interview: body.interview,
          message: body.message
        });
        assertFactoryMountPrefix(interview.spec.mountPath, config);
        factoryRequirementsInterviews.set(interview.id, {
          ...record,
          interview,
          expiresAt: Date.now() + 60 * 60 * 1000
        });
        res.json({ interview });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/requirements/confirm",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = requirementsConfirmSchema.parse(req.body);
        const record = requireFactoryRequirementsInterview(
          factoryRequirementsInterviews,
          body.interview.id,
          req.user.id
        );
        assertInterviewIdentity(record.interview, body.interview);
        assertFactoryMountPrefix(body.interview.spec.mountPath, config);
        const interview = requirementsInterviewer.confirm(body.interview, body.locale);
        factoryRequirementsInterviews.set(interview.id, {
          ...record,
          interview,
          expiresAt: Date.now() + 60 * 60 * 1000
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.requirements.confirmed",
          targetType: "vault_plugin_template",
          targetId: interview.templateId,
          result: "success",
          metadata: {
            interview_id: interview.id,
            target_system: interview.spec.targetSystem,
            mount_path: interview.spec.mountPath,
            environment: interview.spec.environment
          }
        });
        res.json({ interview });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/plugin-factory/jobs", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const canReviewAll = req.user.roles.some((role) => role === "vault-admin" || role === "security-approver" || role === "auditor");
      res.json({ jobs: await store.listFactoryJobs(canReviewAll ? undefined : req.user.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/plugin-factory/jobs",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = factoryJobCreateSchema.parse(req.body);
        const job = await store.createFactoryJob({ ...body, owner: req.user });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.job.created",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: "success",
          metadata: { template_id: job.templateId, plugin_name: job.pluginName, stage: job.stage }
        });
        res.status(201).json({ job });
      } catch (error) {
        next(error);
      }
    }
  );

  app.patch("/plugin-factory/jobs/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
      const body = factoryJobUpdateSchema.parse(req.body);
      const { expectedUpdatedAt, ...bodyPatch } = body;
      const isOwner = job.ownerId === req.user.id;
      const isAdmin = req.user.roles.includes("vault-admin");
      const isApprover = req.user.roles.includes("security-approver");
      if (!isOwner && !isAdmin && !isApprover) throw new Error("Forbidden");

      let update: Parameters<PortalStore["updateFactoryJob"]>[1] = bodyPatch;
      if (!isOwner && !isAdmin) {
        if (!bodyPatch.deployment || Object.keys(bodyPatch).some((field) => field !== "deployment")) throw new Error("Forbidden");
        update = { deployment: { ...job.deployment, environment: bodyPatch.deployment.environment } };
      }
      if (job.approval.status === "approved" && (bodyPatch.snapshot || bodyPatch.pluginName || bodyPatch.templateId)) {
        const candidate: VaultPluginFactoryJob = {
          ...job,
          templateId: bodyPatch.templateId ?? job.templateId,
          pluginName: bodyPatch.pluginName ?? job.pluginName,
          snapshot: bodyPatch.snapshot ?? job.snapshot
        };
        const candidateFingerprint = await factoryArtifactFingerprint(candidate);
        if (!job.approval.artifactFingerprint || candidateFingerprint !== job.approval.artifactFingerprint) {
          update = {
            ...update,
            status: "running",
            stage: "security-review",
            approval: { status: "not-requested" },
            events: [
              ...job.events,
              {
                id: crypto.randomUUID(),
                label: "approval-invalidated",
                detail: "Artifact evidence changed after approval",
                status: "warning" as const,
                createdAt: new Date().toISOString()
              }
            ].slice(-100)
          };
        }
      }
      const updated = await store.updateFactoryJob(job.id, update, {
        expectedUpdatedAt: bodyPatch.snapshot ? expectedUpdatedAt : undefined
      });
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "vault_plugin.job.updated",
        targetType: "vault_plugin_job",
        targetId: job.id,
        result: "success",
        metadata: { fields: Object.keys(update), owner_id: job.ownerId }
      });
      res.json({ job: updated });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/plugin-factory/jobs/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
      const canDelete = job.ownerId === req.user.id || req.user.roles.includes("vault-admin");
      if (!canDelete) throw new Error("Forbidden");
      if (protectedFactoryJobDeleteStatuses.has(job.status)) {
        throw new Error("Active, approved, or scheduled Factory jobs cannot be deleted");
      }

      const deleted = await store.deleteFactoryJob(job.id);
      for (const [runId, run] of factoryBuildRuns.entries()) {
        if (run.jobId === job.id) factoryBuildRuns.delete(runId);
      }
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "vault_plugin.job.deleted",
        targetType: "vault_plugin_job",
        targetId: job.id,
        result: "success",
        metadata: {
          owner_id: job.ownerId,
          plugin_name: job.pluginName,
          history_title: job.historyTitle,
          status: job.status
        }
      });
      res.json({ job: deleted });
    } catch (error) {
      next(error);
    }
  });

  app.post("/plugin-factory/jobs/:id/actions", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
      const body = factoryJobActionSchema.parse(req.body);
      const now = new Date().toISOString();
      const isOwner = job.ownerId === req.user.id;
      const isAdmin = req.user.roles.includes("vault-admin");
      const isApprover = req.user.roles.includes("security-approver");
      const canManageDeployment = isOwner || isAdmin || isApprover;
      const event: VaultPluginFactoryJobEvent = {
        id: crypto.randomUUID(),
        label: body.action,
        detail: body.note ?? "",
        status: body.action === "reject" || body.action === "cancel" ? "warning" : "success",
        createdAt: now
      };
      let update: Parameters<PortalStore["updateFactoryJob"]>[1];

      if (body.action === "request-approval") {
        if (job.ownerId !== req.user.id && !req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        if (!hasVerifiedFactoryArtifact(job, config.vaultMode === "real")) {
          throw new Error("A verified build artifact is required before approval");
        }
        update = {
          status: "waiting-approval",
          stage: "approval",
          progress: Math.max(job.progress, 70),
          approval: { status: "requested", requestedAt: now, requestedBy: req.user.email, note: body.note },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "approve" || body.action === "reject") {
        if (!isApprover && !isAdmin) throw new Error("Forbidden");
        if (isOwner && !isAdmin) throw new Error("Separation of duties requires a different approver");
        update = {
          status: body.action === "approve" ? "approved" : "rejected",
          stage: "approval",
          progress: body.action === "approve" ? Math.max(job.progress, 80) : job.progress,
          approval: {
            ...job.approval,
            status: body.action === "approve" ? "approved" : "rejected",
            artifactFingerprint: body.action === "approve" ? await factoryArtifactFingerprint(job) : undefined,
            decidedAt: now,
            decidedBy: req.user.email,
            note: body.note ?? job.approval.note
          },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "schedule") {
        if (!canManageDeployment) throw new Error("Forbidden");
        if (job.approval.status !== "approved") throw new Error("Factory job approval required");
        if (!body.scheduledFor) throw new Error("scheduledFor is required");
        update = {
          status: "scheduled",
          stage: "deploy",
          deployment: { ...job.deployment, scheduledFor: body.scheduledFor },
          events: [...job.events, { ...event, detail: body.scheduledFor }].slice(-100)
        };
      } else if (body.action === "canary" || body.action === "full") {
        if (!canManageDeployment) throw new Error("Forbidden");
        update = {
          deployment: { ...job.deployment, mode: body.action === "canary" ? "canary" : "full" },
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "rollback") {
        if (!req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        update = {
          status: "rolled-back",
          stage: "complete",
          progress: 100,
          events: [...job.events, event].slice(-100)
        };
      } else if (body.action === "cancel") {
        if (!isOwner && !isAdmin) throw new Error("Forbidden");
        if (!(new Set<VaultPluginFactoryJob["status"]>(["running", "waiting-approval", "approved", "scheduled"])).has(job.status)) {
          throw new Error("Only active, approval, or scheduled Factory jobs can be cancelled");
        }
        let cancelledBuildResult: VaultPluginAutoRepairResult | undefined;
        for (const [runId, run] of factoryBuildRuns.entries()) {
          if (run.jobId !== job.id || run.result.status !== "running") continue;
          const cancelledResult: VaultPluginAutoRepairResult = {
            ...run.result,
            status: "cancelled",
            phase: "cancelled",
            completedAt: now,
            summary: "The isolated build was cancelled before Vault apply."
          };
          cancelledBuildResult = cancelledResult;
          factoryBuildRuns.set(runId, { ...run, result: cancelledResult, cancelled: true, persisted: true });
          run.controller.abort();
        }
        update = {
          status: "cancelled",
          stage: job.stage,
          progress: job.progress,
          snapshot: cancelledBuildResult
            ? { ...job.snapshot, autoRepair: cancelledBuildResult }
            : job.snapshot,
          approval:
            job.approval.status === "not-requested"
              ? job.approval
              : {
                  ...job.approval,
                  status: "rejected",
                  artifactFingerprint: undefined,
                  decidedAt: now,
                  decidedBy: req.user.email,
                  note: body.note ?? "Factory job cancelled before Vault apply"
                },
          deployment: { ...job.deployment, scheduledFor: undefined },
          events: [
            ...job.events,
            {
              ...event,
              detail: body.note ?? "Cancelled before Vault apply"
            }
          ].slice(-100)
        };
      } else {
        if (!isOwner && !isAdmin) throw new Error("Forbidden");
        update = {
          status: "running",
          stage: "generate",
          progress: 10,
          events: [...job.events, event].slice(-100)
        };
      }

      const updated = await store.updateFactoryJob(job.id, update);
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: `vault_plugin.job.${body.action}`,
        targetType: "vault_plugin_job",
        targetId: job.id,
        result: "success",
        metadata: { plugin_name: job.pluginName, status: updated.status, note: body.note }
      });
      res.json({ job: updated });
    } catch (error) {
      next(error);
    }
  });

  app.post("/plugin-factory/chat", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const body = pluginChatSchema.parse(req.body);
      const result = await factoryAssistant.chat(body);
      await store.createAuditEvent({
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: "vault_plugin.chat",
        targetType: "vault_plugin_factory",
        targetId: result.action.templateId ?? result.action.type,
        result: "success",
        metadata: {
          provider: result.provider,
          model: result.model,
          action: result.action.type,
          filter: result.action.filter,
          fallback_reason: result.fallbackReason,
          latency_ms: result.latencyMs
        }
      });
      res.json({ result });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/plugin-factory/generate",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginGenerateSchema.parse(req.body);
        const record = requireFactoryRequirementsInterview(
          factoryRequirementsInterviews,
          body.interviewId,
          req.user.id
        );
        if (!record.interview.spec.confirmed || !record.interview.spec.confirmedAt) {
          throw new Error("The requirements specification must be confirmed before generation");
        }
        if (record.interview.templateId !== body.templateId) {
          throw new Error("The confirmed requirements do not match the selected template");
        }
        assertFactoryMountPrefix(record.interview.spec.mountPath, config);
        const generated = generateVaultPluginScaffold({
          ...body,
          mountPath: record.interview.spec.mountPath,
          requirements: record.interview.spec
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.generated",
          targetType: "vault_plugin",
          targetId: generated.pluginName,
          result: "success",
          metadata: {
            template_id: generated.template.id,
            plugin_type: generated.template.pluginType,
            mount_path: generated.mountPath,
            version: generated.version,
            scaffold_sha256: generated.scaffoldSha256
          }
        });
        res.status(201).json({ generated });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/rebuild",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["developer", "app-owner", "vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginRebuildSchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, body.jobId, req.user);
        if (job.ownerId !== req.user.id && !req.user.roles.includes("vault-admin")) throw new Error("Forbidden");
        const runId = crypto.randomUUID();
        const controller = new AbortController();
        const startedAt = new Date().toISOString();
        const initialResult: VaultPluginAutoRepairResult = {
          id: runId,
          status: "running",
          phase: "queued",
          activeAttempt: 1,
          maxAttempts: config.factoryBuildMaxAttempts ?? 3,
          attempts: [],
          files: body.files,
          scaffoldSha256: hashFactoryFiles(body.files),
          buildTest: { status: "warn", steps: [] },
          securityReview: { score: 100, posture: "ready", findings: [] },
          startedAt,
          summary: "The isolated build is queued."
        };
        factoryBuildRuns.set(runId, {
          ownerId: req.user.id,
          jobId: job.id,
          result: initialResult,
          controller,
          cancelled: false,
          persisted: true
        });
        await store.updateFactoryJob(job.id, {
          status: "running",
          stage: "test",
          progress: 45,
          approval: { status: "not-requested" },
          deployment: { ...job.deployment, rollbackReady: false },
          snapshot: {
            ...job.snapshot,
            artifactSha256: "",
            autoRepair: initialResult
          }
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.build.started",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: "success",
          metadata: { run_id: runId, file_count: body.files.length, max_attempts: initialResult.maxAttempts }
        });
        res.status(202).json({ run: initialResult });

        void factoryBuildService
          .run(
            {
              runId,
              pluginName: body.pluginName,
              command: body.command,
              files: body.files,
              requirements: body.requirements
            },
            async (result) => {
              const activeRun = factoryBuildRuns.get(runId);
              if (activeRun?.cancelled) return;
              const final = result.status !== "running";
              factoryBuildRuns.set(runId, {
                ownerId: req.user.id,
                jobId: job.id,
                result,
                controller,
                cancelled: false,
                persisted: !final
              });
              const latest = (await store.getFactoryJob(job.id)) ?? job;
              if (factoryBuildRuns.get(runId)?.cancelled) return;
              const generated = asRecord(latest.snapshot.generated) ?? {};
              const nextGenerated = {
                ...generated,
                files: result.files,
                scaffoldSha256: result.scaffoldSha256,
                generatedAt: new Date().toISOString(),
                buildTest: result.buildTest,
                securityReview: result.securityReview,
                requirements: body.requirements,
                buildArtifact: result.artifact
              };
              const attempt = result.attempts.at(-1);
              const buildEvents = latest.events.filter((event) => !event.label.startsWith("build-attempt-"));
              await store.updateFactoryJob(job.id, {
                status: result.status === "failed" ? "failed" : result.status === "cancelled" ? "cancelled" : "running",
                stage: result.status === "pass" ? "security-review" : "test",
                progress: factoryBuildProgress(result),
                snapshot: {
                  ...latest.snapshot,
                  generated: nextGenerated,
                  draftFiles: result.files,
                  artifactSha256: result.artifact?.sha256 ?? "",
                  autoRepair: result
                },
                deployment: { ...latest.deployment, rollbackReady: false },
                events: [
                  ...buildEvents,
                  ...(attempt
                    ? [
                        {
                          id: `${runId}-${attempt.attempt}`,
                          label: `build-attempt-${attempt.attempt}`,
                          detail: attempt.summary,
                          status:
                            result.status === "running"
                              ? ("running" as const)
                              : attempt.status === "pass"
                                ? ("success" as const)
                                : ("failed" as const),
                          createdAt: new Date().toISOString()
                        }
                      ]
                    : [])
                ].slice(-100)
              });
              const persistedRun = factoryBuildRuns.get(runId);
              if (!persistedRun || persistedRun.cancelled) return;
              factoryBuildRuns.set(runId, { ...persistedRun, result, persisted: true });
              if (final) {
                await store.createAuditEvent({
                  actorId: req.user.id,
                  actorEmail: req.user.email,
                  action: "vault_plugin.build.completed",
                  targetType: "vault_plugin_job",
                  targetId: job.id,
                  result: result.status === "pass" ? "success" : "failure",
                  metadata: {
                    run_id: runId,
                    attempts: result.attempts.length,
                    scaffold_sha256: result.scaffoldSha256,
                    binary_sha256: result.artifact?.sha256,
                    repaired_files: result.attempts.flatMap((item) => item.repairedFiles)
                  }
                });
              }
            },
            controller.signal
          )
          .catch(async (error) => {
            const activeRun = factoryBuildRuns.get(runId);
            if (activeRun?.cancelled) return;
            const failed: VaultPluginAutoRepairResult = {
              ...initialResult,
              status: "failed",
              phase: "complete",
              completedAt: new Date().toISOString(),
              buildTest: {
                status: "fail",
                steps: [
                  {
                    label: "Isolated build runner",
                    command: "factory build",
                    status: "fail",
                    durationMs: 0,
                    detail: error instanceof Error ? error.message : String(error)
                  }
                ]
              },
              summary: error instanceof Error ? error.message : String(error)
            };
            factoryBuildRuns.set(runId, {
              ownerId: req.user.id,
              jobId: job.id,
              result: failed,
              controller,
              cancelled: false,
              persisted: false
            });
            const latest = (await store.getFactoryJob(job.id)) ?? job;
            if (factoryBuildRuns.get(runId)?.cancelled) return;
            await store.updateFactoryJob(job.id, {
              status: "failed",
              stage: "test",
              progress: 45,
              snapshot: { ...latest.snapshot, autoRepair: failed, artifactSha256: "" }
            });
            const persistedRun = factoryBuildRuns.get(runId);
            if (!persistedRun || persistedRun.cancelled) return;
            factoryBuildRuns.set(runId, { ...persistedRun, result: failed, persisted: true });
          });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/plugin-factory/rebuild/:id", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      const run = factoryBuildRuns.get(z.string().uuid().parse(req.params.id));
      if (!run) {
        res.status(404).json({ error: "Factory build run not found" });
        return;
      }
      const canReview = req.user.roles.some((role) => role === "vault-admin" || role === "security-approver" || role === "auditor");
      if (run.ownerId !== req.user.id && !canReview) throw new Error("Forbidden");
      const result = !run.persisted && run.result.status !== "running"
        ? {
            ...run.result,
            status: "running" as const,
            phase: "verifying" as const,
            completedAt: undefined,
            summary: "Saving the verified build artifact to the Factory job."
          }
        : run.result;
      res.json({ run: result });
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/plugin-factory/jobs/:id/existing-mount",
    requireUser(store, config.sessionCookieName),
    async (req, res, next) => {
      try {
        const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
        const target = factoryPluginMountTarget(job);
        const result = await vault.inspectPluginMount(target);
        res.json({ result });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/jobs/:id/existing-mount/remove",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      let removalJob: VaultPluginFactoryJob | undefined;
      try {
        const body = pluginMountRemovalSchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, requiredParam(req, "id"), req.user);
        removalJob = job;
        const target = factoryPluginMountTarget(job);
        if (job.approval.status !== "approved") {
          throw new Error("Factory job approval required before removing an existing Vault mount");
        }
        const fingerprint = await factoryArtifactFingerprint(job);
        if (!job.approval.artifactFingerprint || fingerprint !== job.approval.artifactFingerprint) {
          throw new Error("Factory artifact changed after approval; request approval again");
        }
        if (normalizeFactoryMount(body.confirmation) !== target.mountPath) {
          throw new Error(`Type ${target.mountPath} exactly to confirm Vault mount removal`);
        }

        const result = await vault.removePluginMount({
          ...target,
          expectedFingerprint: body.expectedFingerprint
        });
        const latest = (await store.getFactoryJob(job.id)) ?? job;
        const updated = await store.updateFactoryJob(job.id, {
          status: "approved",
          stage: "deploy",
          progress: Math.max(80, latest.progress),
          deployment: { ...latest.deployment, rollbackReady: false },
          events: [
            ...latest.events,
            {
              id: crypto.randomUUID(),
              label: "mount-removed",
              detail: `${result.mountPath} (${result.mode})`,
              status: "success" as const,
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.mount_removed",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: result.removed ? "success" : "failure",
          metadata: redact({
            mode: result.mode,
            plugin_type: result.pluginType,
            mount_path: result.mountPath,
            steps: result.steps,
            detail: result.detail
          })
        });
        res.json({ result, job: updated });
      } catch (error) {
        if (removalJob) {
          try {
            await store.createAuditEvent({
              actorId: req.user.id,
              actorEmail: req.user.email,
              action: "vault_plugin.mount_remove_failed",
              targetType: "vault_plugin_job",
              targetId: removalJob.id,
              result: "failure",
              metadata: redact({ error: error instanceof Error ? error.message : String(error) })
            });
          } catch (auditError) {
            console.error("failed to audit Vault mount removal", redact({ message: auditError instanceof Error ? auditError.message : String(auditError) }));
          }
        }
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/apply",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      let applyJobId: string | undefined;
      try {
        const body = pluginApplySchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, body.jobId, req.user);
        if (job.approval.status !== "approved") {
          throw new Error("Factory job approval required");
        }
        const fingerprint = await factoryArtifactFingerprint(job);
        if (!job.approval.artifactFingerprint || fingerprint !== job.approval.artifactFingerprint) {
          throw new Error("Factory artifact changed after approval; request approval again");
        }
        const evidence = factoryArtifactEvidence(job);
        const matchesApprovedArtifact =
          evidence.pluginType === body.pluginType &&
          evidence.pluginName === body.pluginName &&
          evidence.mountPath === body.mountPath &&
          evidence.version === body.version &&
          evidence.command === body.command &&
          evidence.artifactSha256?.toLowerCase() === body.artifactSha256.toLowerCase() &&
          (config.vaultMode !== "real" ||
            (evidence.artifactBucket === body.artifactBucket && evidence.artifactKey === body.artifactKey));
        if (!matchesApprovedArtifact) throw new Error("Apply request does not match the approved Factory artifact");
        if (job.deployment.scheduledFor && new Date(job.deployment.scheduledFor).getTime() > Date.now()) {
          throw new Error("Factory job is scheduled for a future time");
        }
        await store.updateFactoryJob(job.id, {
          status: "running",
          stage: "deploy",
          progress: 90,
          deployment: { ...job.deployment, rollbackReady: false },
          events: [
            ...job.events,
            {
              id: crypto.randomUUID(),
              label: "apply",
              detail: `${body.mountPath} (${job.deployment.mode})`,
              status: "running" as const,
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        applyJobId = job.id;
        let distribution: Awaited<ReturnType<typeof pluginDistributor.distribute>> | undefined;
        if (config.vaultMode === "real") {
          if (!body.artifactBucket || !body.artifactKey) {
            throw new Error("A verified build artifact is required for real Vault apply");
          }
          distribution = await pluginDistributor.distribute({
            bucket: body.artifactBucket,
            key: body.artifactKey,
            sha256: body.artifactSha256,
            architecture: "arm64",
            command: body.command,
            builtAt: new Date().toISOString()
          });
        }
        const result = await vault.applyPlugin(body);
        if (distribution) result.detail = { ...result.detail, distribution };
        const latest = await store.getFactoryJob(job.id);
        await store.updateFactoryJob(job.id, {
          status: result.applied ? "complete" : "failed",
          stage: "complete",
          progress: result.applied ? 100 : 90,
          deployment: { ...job.deployment, rollbackReady: result.applied },
          events: [
            ...(latest?.events ?? job.events),
            {
              id: crypto.randomUUID(),
              label: "apply-complete",
              detail: `${result.mountPath} (${result.mode})`,
              status: result.applied ? ("success" as const) : ("failed" as const),
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.applied",
          targetType: "vault_plugin",
          targetId: result.pluginName,
          result: result.applied ? "success" : "failure",
          metadata: redact({
            mode: result.mode,
            plugin_type: result.pluginType,
            mount_path: result.mountPath,
            version: result.version,
            steps: result.steps,
            detail: result.detail
          })
        });
        res.json({ result });
      } catch (error) {
        if (applyJobId) {
          const failedJob = await store.getFactoryJob(applyJobId);
          if (failedJob) {
            const message = error instanceof Error ? error.message : String(error);
            const rollbackRequired = message.includes("cleanup failed");
            await store.updateFactoryJob(failedJob.id, {
              status: "failed",
              stage: "complete",
              progress: 90,
              deployment: { ...failedJob.deployment, rollbackReady: rollbackRequired },
              events: [
                ...failedJob.events,
                {
                  id: crypto.randomUUID(),
                  label: "apply-failed",
                  detail: message,
                  status: "failed" as const,
                  createdAt: new Date().toISOString()
                }
              ].slice(-100)
            });
            await store.createAuditEvent({
              actorId: req.user.id,
              actorEmail: req.user.email,
              action: "vault_plugin.apply_failed",
              targetType: "vault_plugin_job",
              targetId: failedJob.id,
              result: "failure",
              metadata: redact({ error: message, rollback_required: rollbackRequired })
            });
          }
        }
        next(error);
      }
    }
  );

  app.post(
    "/plugin-factory/rollback",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = pluginRollbackSchema.parse(req.body);
        const job = await requireFactoryJobAccess(store, body.jobId, req.user);
        if (!job.deployment.rollbackReady && job.status !== "complete") throw new Error("Factory rollback is not ready");
        const result = await vault.rollbackPlugin(body);
        await store.updateFactoryJob(job.id, {
          status: result.rolledBack ? "rolled-back" : "failed",
          stage: "complete",
          progress: 100,
          deployment: { ...job.deployment, rollbackReady: false },
          events: [
            ...job.events,
            {
              id: crypto.randomUUID(),
              label: "rollback",
              detail: `${result.mountPath} (${result.mode})`,
              status: result.rolledBack ? ("success" as const) : ("failed" as const),
              createdAt: new Date().toISOString()
            }
          ].slice(-100)
        });
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "vault_plugin.rolled_back",
          targetType: "vault_plugin_job",
          targetId: job.id,
          result: result.rolledBack ? "success" : "failure",
          metadata: { plugin_name: result.pluginName, mount_path: result.mountPath, mode: result.mode, remove_catalog: body.removeCatalog }
        });
        res.json({ result });
      } catch (error) {
        next(error);
      }
    }
  );

  app.get("/admin/vault-mappings", requireUser(store, config.sessionCookieName), async (_req, res, next) => {
    try {
      const systems = await store.listSystems({
        id: "system",
        email: "system",
        displayName: "System",
        groups: [],
        roles: ["vault-admin"]
      });
      res.json({
        mappings: systems.flatMap((system) =>
          system.vaultMountMappings.map((mapping) => ({
            ...mapping,
            systemId: system.id,
            systemName: system.name,
            vaultNamespace: system.vaultNamespace
          }))
        )
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/admin/vault-mappings", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.status(501).json({ error: "MVP exposes mappings as seeded configuration only" });
  });

  app.get("/admin/role-templates", requireUser(store, config.sessionCookieName), (_req, res) => {
    res.json({
      templates: [
        { id: "gitlab-project-maintainer", requestType: "CUSTOM_GITLAB_TOKEN", ttl: "1h" },
        { id: "db-readonly", requestType: "DB_CREDENTIAL", ttl: "30m" },
        { id: "legacy-readonly", requestType: "CUSTOM_LEGACY_API_TOKEN", ttl: "2h" }
      ]
    });
  });

  app.get("/admin/users", requireUser(store, config.sessionCookieName), async (req, res, next) => {
    try {
      res.json({
        users: await store.listUsers(),
        capabilities: {
          canManageUsers: req.user.roles.includes("vault-admin"),
          passwordMode: "mock-one-time-temporary-password"
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    "/admin/users/:id/access",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const body = userAccessSchema.parse(req.body);
        const user = await store.updateUserAccess(requiredParam(req, "id"), body);
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "user.access.updated",
          targetType: "user",
          targetId: user.id,
          result: "success",
          metadata: {
            email: user.email,
            roles: user.roles,
            groups: user.groups,
            status: user.status,
            mfa_enabled: user.mfaEnabled,
            password_reset_required: user.passwordResetRequired
          }
        });
        res.json({ user });
      } catch (error) {
        next(error);
      }
    }
  );

  app.post(
    "/admin/users/:id/password-reset",
    requireUser(store, config.sessionCookieName),
    requireAnyRole(["vault-admin"]),
    async (req, res, next) => {
      try {
        const user = await store.markUserPasswordReset(requiredParam(req, "id"));
        const temporaryPassword = createTemporaryPassword();
        await store.createAuditEvent({
          actorId: req.user.id,
          actorEmail: req.user.email,
          action: "user.password.reset_issued",
          targetType: "user",
          targetId: user.id,
          result: "success",
          metadata: {
            email: user.email,
            delivery: "one-time-display",
            password_stored: false,
            expires_in: "15m"
          }
        });
        res.json({
          user,
          temporaryPassword,
          expiresIn: "15m",
          revealPolicy: "display-once-not-stored"
        });
      } catch (error) {
        next(error);
      }
    }
  );

  app.use(errorHandler);

  app.listen(config.port, () => {
    console.log(`security-portal-backend listening on ${config.port}`);
  });
}

function factoryBuildProgress(result: VaultPluginAutoRepairResult): number {
  if (result.status === "pass") return 75;
  if (result.status === "failed" || result.status === "cancelled") return 55;
  switch (result.phase) {
    case "preparing":
      return 50;
    case "building":
      return 58;
    case "verifying":
      return 68;
    case "repairing":
      return 62;
    default:
      return 45;
  }
}

function hashFactoryFiles(files: Array<{ path: string; content: string }>): string {
  const encoded = new TextEncoder().encode(
    [...files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => `${file.path}\0${file.content}\0`)
      .join("")
  );
  return crypto.createHash("sha256").update(encoded).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireFactoryRequirementsInterview(
  interviews: Map<string, FactoryRequirementsRecord>,
  id: string,
  ownerId: string
): FactoryRequirementsRecord {
  const record = interviews.get(id);
  if (!record || record.expiresAt <= Date.now()) {
    interviews.delete(id);
    throw new Error("Requirements interview not found or expired");
  }
  if (record.ownerId !== ownerId) throw new Error("Forbidden");
  return record;
}

function assertInterviewIdentity(
  stored: VaultPluginRequirementsInterview,
  candidate: VaultPluginRequirementsInterview
): void {
  if (
    stored.id !== candidate.id ||
    stored.templateId !== candidate.templateId ||
    stored.requestedApply !== candidate.requestedApply
  ) {
    throw new Error("Requirements interview identity does not match the server session");
  }
}

function assertFactoryMountPrefix(mountPath: string, config: ReturnType<typeof loadConfig>): void {
  if (config.vaultMode !== "real") return;
  const prefix = config.vaultPluginAllowedMountPrefix?.replace(/^\/+|\/+$/g, "");
  const normalized = mountPath.replace(/^\/+|\/+$/g, "");
  if (prefix && normalized !== prefix && !normalized.startsWith(`${prefix}/`)) {
    throw new Error(`Real Vault plugin mounts must stay under ${prefix}/`);
  }
}

function normalizeFactoryMount(mountPath: string): string {
  return mountPath.replace(/^\/+|\/+$/g, "");
}

function factoryPluginMountTarget(job: VaultPluginFactoryJob): VaultPluginMountTarget {
  const evidence = factoryArtifactEvidence(job);
  const pluginType = z.enum(["auth", "secret", "database"]).parse(evidence.pluginType);
  const mountPath = normalizeFactoryMount(z.string().min(1).max(120).parse(evidence.mountPath));
  return { pluginType, mountPath };
}

type PluginCatalogRepairContext = {
  inspection: VaultPluginCatalogRepairInspection;
  job?: VaultPluginFactoryJob;
  evidence?: ReturnType<typeof factoryArtifactEvidence>;
};

async function inspectPluginCatalogRepair(
  store: PortalStore,
  inventory: VaultInventory,
  target: z.infer<typeof pluginCatalogRepairTargetSchema>,
  requireStoredArtifact: boolean
): Promise<PluginCatalogRepairContext> {
  const pluginName = normalizeFactoryMount(target.pluginName);
  const plugin = inventory.plugins.find(
    (entry) => entry.name === pluginName && entry.pluginType === target.pluginType
  );
  if (!plugin || plugin.status !== "orphaned") {
    return {
      inspection: {
        mode: inventory.mode,
        status: "resolved",
        pluginName,
        pluginType: target.pluginType,
        mountedPaths: plugin?.mountedPaths ?? [],
        version: plugin?.version,
        detail: "The live Plugin Catalog is already aligned."
      }
    };
  }

  const mountedPaths = plugin.mountedPaths.map(normalizeFactoryMount);
  const jobs = await store.listFactoryJobs();
  const candidates = (
    await Promise.all(
      jobs.map(async (job) => {
        const evidence = factoryArtifactEvidence(job);
        if (
          evidence.pluginName !== pluginName ||
          evidence.pluginType !== target.pluginType ||
          !evidence.mountPath ||
          !mountedPaths.includes(normalizeFactoryMount(evidence.mountPath)) ||
          !evidence.version ||
          (plugin.version && plugin.version !== evidence.version) ||
          !evidence.command ||
          !evidence.artifactSha256 ||
          !hasVerifiedFactoryArtifact(job, requireStoredArtifact) ||
          job.approval.status !== "approved" ||
          !job.approval.artifactFingerprint
        ) {
          return undefined;
        }
        const artifactFingerprint = await factoryArtifactFingerprint(job);
        if (artifactFingerprint !== job.approval.artifactFingerprint) return undefined;
        return { job, evidence, artifactFingerprint };
      })
    )
  )
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => Date.parse(right.job.updatedAt) - Date.parse(left.job.updatedAt));
  const candidate = candidates[0];
  if (!candidate) {
    return {
      inspection: {
        mode: inventory.mode,
        status: "artifact-required",
        pluginName,
        pluginType: target.pluginType,
        mountedPaths,
        version: plugin.version,
        detail: "No matching approved Factory artifact was found for the live Mount."
      }
    };
  }

  return {
    job: candidate.job,
    evidence: candidate.evidence,
    inspection: {
      mode: inventory.mode,
      status: "repairable",
      pluginName,
      pluginType: target.pluginType,
      mountedPaths,
      version: plugin.version,
      candidate: {
        jobId: candidate.job.id,
        version: candidate.evidence.version ?? "",
        command: candidate.evidence.command ?? "",
        artifactSha256: candidate.evidence.artifactSha256 ?? "",
        artifactFingerprint: candidate.artifactFingerprint,
        mountPath: candidate.evidence.mountPath ?? "",
        updatedAt: candidate.job.updatedAt
      },
      detail: "A matching approved Factory artifact is ready for Catalog registration."
    }
  };
}

function requireUser(store: PortalStore, cookieName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = readCookie(req, cookieName);
      if (!userId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const user = await store.getUserById(userId);
      if (!user) {
        res.status(401).json({ error: "Invalid session" });
        return;
      }
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requiredParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
}

async function requireFactoryJobAccess(
  store: PortalStore,
  id: string,
  user: PortalUser
): Promise<VaultPluginFactoryJob> {
  const job = await store.getFactoryJob(id);
  if (!job) throw new Error("Factory job not found");
  const canReview = user.roles.some((role) => role === "vault-admin" || role === "security-approver" || role === "auditor");
  if (job.ownerId !== user.id && !canReview) throw new Error("Forbidden");
  return job;
}

function requireAnyRole(roles: Array<(typeof userRoles)[number]>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.some((role) => req.user.roles.includes(role))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

function canViewAllWorkflows(user: PortalUser): boolean {
  return user.roles.some((role) =>
    (["security-approver", "vault-admin", "app-owner", "auditor"] as PortalUser["roles"]).includes(role)
  );
}

function canViewRequest(user: PortalUser, request: AccessRequest): boolean {
  return canViewAllWorkflows(user) || request.requesterId === user.id;
}

function visibleRequests(user: PortalUser, requests: AccessRequest[]): AccessRequest[] {
  return canViewAllWorkflows(user) ? requests : requests.filter((request) => request.requesterId === user.id);
}

function visibleCredentials(
  user: PortalUser,
  credentials: IssuedCredential[],
  requests: AccessRequest[]
): IssuedCredential[] {
  if (canViewAllWorkflows(user)) {
    return credentials;
  }
  const visibleRequestIds = new Set(requests.filter((request) => request.requesterId === user.id).map((request) => request.id));
  return credentials.filter((credential) => visibleRequestIds.has(credential.requestId));
}

function createTemporaryPassword(): string {
  return `Temp-${crypto.randomUUID().slice(0, 8)}!${Math.floor(1000 + Math.random() * 9000)}`;
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const status = message === "Forbidden"
    ? 403
    : message === "Factory job changed while saving"
      ? 409
      : message.includes("not found")
        ? 404
        : 400;
  console.error("request failed", redact({ message }));
  res.status(status).json({ error: message });
}

main().catch((error) => {
  console.error("failed to start backend", redact({ message: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});

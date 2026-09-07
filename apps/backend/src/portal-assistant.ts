import type {
  AccessRequest,
  AuditEvent,
  IssuedCredential,
  PortalUser,
  SystemSummary,
  UserRole,
  VaultHealthStatus,
  VaultInventory,
  VaultMappingHealth,
  VaultReconciliationReport
} from "@security-portal/shared";
import { z } from "zod";

export const portalAssistantViews = [
  "dashboard",
  "secrets",
  "systems",
  "requests",
  "approvals",
  "credentials",
  "audit",
  "health",
  "plugins",
  "users",
  "admin"
] as const;

export type PortalAssistantView = (typeof portalAssistantViews)[number];
export type PortalAssistantLocale = "ko" | "en";

export interface PortalAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PortalAssistantSnapshot {
  view: PortalAssistantView;
  allowedViews: PortalAssistantView[];
  roles: UserRole[];
  metrics: {
    systems: number;
    secretSurfaces: number;
    pendingRequests: number;
    highRiskPending: number;
    activeCredentials: number;
    expiringSoon: number;
    revokeFailures: number;
    failedAuditEvents: number;
  };
  vault: {
    mode: "mock" | "real";
    healthy: boolean;
    version?: string;
    mappingIssues: number;
    syncedAt: string;
    totalMounts?: number;
    customPlugins?: number;
    mountedCustomPlugins?: number;
    drifted?: number;
    critical?: number;
  };
  pageItems: string[];
}

export interface PortalAssistantSnapshotInput {
  view: PortalAssistantView;
  user: PortalUser;
  systems: SystemSummary[];
  requests: AccessRequest[];
  credentials: IssuedCredential[];
  auditEvents: AuditEvent[];
  vaultHealth: VaultHealthStatus;
  mappingHealth: VaultMappingHealth[];
  inventory?: VaultInventory;
  reconciliation?: VaultReconciliationReport;
  syncedAt: string;
}

export interface PortalAssistantContext {
  locale: PortalAssistantLocale;
  messages: PortalAssistantMessage[];
  snapshot: PortalAssistantSnapshot;
}

export interface PortalAssistantResult {
  reply: string;
  action: { type: "none" | "navigate"; view?: PortalAssistantView };
  provider: "ollama" | "rules";
  model?: string;
  fallbackReason?: "disabled" | "misconfigured" | "unavailable" | "invalid-response";
  latencyMs: number;
}

interface PortalAssistantConfig {
  mode: "rules" | "ollama";
  baseUrl?: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
}

type FetchImplementation = typeof fetch;

const modelReplySchema = z.object({
  reply: z.string().trim().min(1).max(3000),
  action: z.object({
    type: z.enum(["none", "navigate"]),
    view: z.enum(portalAssistantViews).nullable().optional()
  })
});

const ollamaReplyFormat = {
  type: "object",
  properties: {
    reply: { type: "string" },
    action: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["none", "navigate"] },
        view: { type: ["string", "null"], enum: [...portalAssistantViews, null] }
      },
      required: ["type", "view"],
      additionalProperties: false
    }
  },
  required: ["reply", "action"],
  additionalProperties: false
} as const;

const viewRoleRequirements: Partial<Record<PortalAssistantView, UserRole[]>> = {
  requests: ["developer", "app-owner", "vault-admin"],
  approvals: ["security-approver", "app-owner", "vault-admin"],
  credentials: ["developer", "app-owner", "vault-admin"],
  audit: ["auditor", "vault-admin"],
  health: ["auditor", "vault-admin"],
  users: ["vault-admin"],
  admin: ["vault-admin"]
};

export function portalAssistantAllowedViews(roles: UserRole[]): PortalAssistantView[] {
  return portalAssistantViews.filter((view) => {
    const required = viewRoleRequirements[view];
    return !required || required.some((role) => roles.includes(role));
  });
}

export function buildPortalAssistantSnapshot(input: PortalAssistantSnapshotInput): PortalAssistantSnapshot {
  const now = Date.now();
  const pendingRequests = input.requests.filter((request) => request.status === "pending");
  const activeCredentials = input.credentials.filter((credential) => credential.status === "active");
  const pageItems = portalPageItems(input).slice(0, 8);
  const version = typeof input.vaultHealth.detail.version === "string" ? input.vaultHealth.detail.version : undefined;

  return {
    view: input.view,
    allowedViews: portalAssistantAllowedViews(input.user.roles),
    roles: input.user.roles,
    metrics: {
      systems: input.systems.length,
      secretSurfaces: input.systems.reduce((count, system) => count + system.vaultMountMappings.length, 0),
      pendingRequests: pendingRequests.length,
      highRiskPending: pendingRequests.filter((request) => request.riskLevel === "high").length,
      activeCredentials: activeCredentials.length,
      expiringSoon: activeCredentials.filter((credential) => {
        const expiresAt = new Date(credential.expiresAt).getTime();
        return expiresAt > now && expiresAt - now <= 24 * 60 * 60 * 1000;
      }).length,
      revokeFailures: input.credentials.filter((credential) => credential.status === "revoke_failed").length,
      failedAuditEvents: input.auditEvents.filter((event) => event.result === "failure").length
    },
    vault: {
      mode: input.vaultHealth.mode,
      healthy: input.vaultHealth.healthy,
      version,
      mappingIssues: input.mappingHealth.filter((mapping) => !mapping.reachable).length,
      syncedAt: input.syncedAt,
      totalMounts: input.inventory?.summary.totalMounts,
      customPlugins: input.inventory?.summary.customPlugins,
      mountedCustomPlugins: input.inventory?.summary.mountedCustomPlugins,
      drifted: input.reconciliation?.summary.drifted,
      critical: input.reconciliation?.summary.critical
    },
    pageItems
  };
}

export class PortalAssistant {
  private readonly baseUrl?: string;

  constructor(
    private readonly config: PortalAssistantConfig,
    private readonly fetchImpl: FetchImplementation = fetch
  ) {
    this.baseUrl = config.baseUrl?.replace(/\/+$/, "");
  }

  async chat(context: PortalAssistantContext): Promise<PortalAssistantResult> {
    const startedAt = Date.now();
    if (requiresVerifiedFacts(latestUserMessage(context))) {
      return this.rulesReply(context, startedAt, this.config.mode === "rules" ? "disabled" : undefined);
    }
    if (this.config.mode !== "ollama") return this.rulesReply(context, startedAt, "disabled");
    if (!this.baseUrl || !this.config.apiKey) return this.rulesReply(context, startedAt, "misconfigured");

    let parsed: z.infer<typeof modelReplySchema> | undefined;
    try {
      parsed = await this.requestModel(context, false);
    } catch {
      return this.rulesReply(context, startedAt, "unavailable");
    }
    if (!parsed) {
      try {
        parsed = await this.requestModel(context, true);
      } catch {
        return this.rulesReply(context, startedAt, "invalid-response");
      }
    }
    if (!parsed) return this.rulesReply(context, startedAt, "invalid-response");

    const forcedView = deterministicNavigation(latestUserMessage(context), context.snapshot.allowedViews);
    const requestedView = parsed.action.type === "navigate" && parsed.action.view
      ? parsed.action.view
      : undefined;
    const navigationView = forcedView ?? (requestedView && context.snapshot.allowedViews.includes(requestedView) ? requestedView : undefined);
    return {
      reply: parsed.reply,
      action: navigationView ? { type: "navigate", view: navigationView } : { type: "none" },
      provider: "ollama",
      model: this.config.model,
      latencyMs: Date.now() - startedAt
    };
  }

  private rulesReply(
    context: PortalAssistantContext,
    startedAt: number,
    fallbackReason: PortalAssistantResult["fallbackReason"]
  ): PortalAssistantResult {
    const prompt = latestUserMessage(context);
    const normalized = prompt.toLowerCase();
    const snapshot = context.snapshot;
    const locale = context.locale;
    const requestedView = deterministicNavigation(prompt, snapshot.allowedViews);
    let reply: string;

    if (mentionsPluginCreation(normalized)) {
      reply = localized(
        locale,
        "Plugin creation continues in Vault Plugin Factory, where requirements, build evidence, approval, and Vault apply are kept in one workspace.",
        "Plugin 생성은 요구사항, Build 검증, 승인, Vault 적용을 한 작업으로 관리하는 Vault Plugin Factory에서 이어갈 수 있습니다."
      );
    } else if (/urgent|priority|attention|긴급|우선|먼저|조치/.test(normalized)) {
      reply = localized(
        locale,
        `There are ${snapshot.metrics.highRiskPending} high-risk pending requests, ${snapshot.metrics.revokeFailures} revoke failures, and ${snapshot.vault.critical ?? 0} critical Vault drifts. Review failures first, then approval backlog.`,
        `현재 High Risk 승인 대기 ${snapshot.metrics.highRiskPending}건, Revoke 실패 ${snapshot.metrics.revokeFailures}건, Vault Critical Drift ${snapshot.vault.critical ?? 0}건입니다. 실패 항목을 먼저 확인한 뒤 승인 대기 건을 검토하는 순서가 좋습니다.`
      );
    } else if (/vault|볼트|health|status|상태|연결/.test(normalized)) {
      reply = localized(
        locale,
        `Vault is ${snapshot.vault.healthy ? "healthy" : "not healthy"} in ${snapshot.vault.mode} mode. ${snapshot.vault.mappingIssues} mapped targets are unreachable and ${snapshot.vault.drifted ?? 0} reconciliation items are drifted.`,
        `Vault는 ${snapshot.vault.mode} 모드이며 현재 ${snapshot.vault.healthy ? "정상" : "확인 필요"} 상태입니다. 연결되지 않은 Mapping은 ${snapshot.vault.mappingIssues}건이고 Drift는 ${snapshot.vault.drifted ?? 0}건입니다.`
      );
    } else if (/approval|approve|승인/.test(normalized)) {
      reply = localized(
        locale,
        `${snapshot.metrics.pendingRequests} requests are pending approval, including ${snapshot.metrics.highRiskPending} high-risk requests. Open Approval Inbox to review the request evidence and conditions.`,
        `현재 승인 대기 요청은 ${snapshot.metrics.pendingRequests}건이며, 이 중 High Risk는 ${snapshot.metrics.highRiskPending}건입니다. 승인함에서 요청 근거와 조건을 확인할 수 있습니다.`
      );
    } else if (/credential|lease|만료|폐기|revoke/.test(normalized)) {
      reply = localized(
        locale,
        `${snapshot.metrics.activeCredentials} credentials are active, ${snapshot.metrics.expiringSoon} expire within 24 hours, and ${snapshot.metrics.revokeFailures} require a revoke retry.`,
        `활성 Credential은 ${snapshot.metrics.activeCredentials}개이며, 24시간 이내 만료 예정은 ${snapshot.metrics.expiringSoon}개, Revoke 재시도가 필요한 항목은 ${snapshot.metrics.revokeFailures}개입니다.`
      );
    } else {
      reply = pageSummary(snapshot, locale);
    }

    return {
      reply,
      action: requestedView ? { type: "navigate", view: requestedView } : { type: "none" },
      provider: "rules",
      fallbackReason,
      latencyMs: Date.now() - startedAt
    };
  }

  private async requestModel(
    context: PortalAssistantContext,
    recovery: boolean
  ): Promise<z.infer<typeof modelReplySchema> | undefined> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: "system",
            content: [
              "You are the read-only contextual assistant inside a HashiCorp Vault security portal.",
              `Always answer in ${context.locale === "ko" ? "Korean" : "English"}.`,
              "Ground every operational claim in the supplied portal snapshot. If evidence is absent, say that it is not available.",
              "Never request, reveal, infer, or repeat tokens, credentials, secret values, lease IDs, API keys, or authentication material.",
              "Never claim that you approved, revoked, deleted, mounted, applied, or changed anything. You only explain and guide navigation.",
              "For a plugin creation request, guide the user to the plugins view. The Factory performs requirements, build, approval, and apply.",
              "Keep replies conversational and concise: 2-5 sentences and at most 140 words.",
              `The only allowed navigation views are: ${context.snapshot.allowedViews.join(", ")}.`,
              "Return JSON only: {\"reply\":string,\"action\":{\"type\":\"none\"|\"navigate\",\"view\":string|null}}.",
              recovery ? "The previous response was invalid. Return complete JSON with no markdown." : "",
              `Portal snapshot: ${JSON.stringify(context.snapshot)}`
            ].filter(Boolean).join("\n")
          },
          ...context.messages.slice(-10)
        ],
        stream: false,
        format: ollamaReplyFormat,
        think: false,
        keep_alive: "30m",
        options: { temperature: 0.2, num_ctx: 6144, num_predict: recovery ? 260 : 420 }
      })
    });
    if (!response.ok) throw new Error(`ollama-http-${response.status}`);
    const payload = (await response.json()) as OllamaChatResponse;
    return parseModelReply(payload.message?.content ?? "");
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function portalPageItems(input: PortalAssistantSnapshotInput): string[] {
  switch (input.view) {
    case "systems":
      return input.systems.map((system) => `${system.name} | ${system.environment} | mappings ${system.vaultMountMappings.length}`);
    case "requests":
    case "approvals":
      return input.requests.map((request) => `${request.systemName} | ${request.requestType} | ${request.status} | ${request.riskLevel}`);
    case "secrets":
    case "credentials":
      return input.credentials.map((credential) => `${credential.systemName} | ${credential.requestType} | ${credential.status} | expires ${credential.expiresAt}`);
    case "audit":
      return input.auditEvents.map((event) => `${event.action} | ${event.result} | ${event.createdAt}`);
    case "health":
    case "admin":
      return (input.reconciliation?.items ?? []).map((item) => `${item.title} | ${item.status} | ${item.severity}`);
    default:
      return [];
  }
}

function latestUserMessage(context: PortalAssistantContext): string {
  return [...context.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

function mentionsPluginCreation(prompt: string): boolean {
  return /(plugin|플러그인)/.test(prompt) && /(create|make|build|generate|만들|생성|제작)/.test(prompt);
}

function requiresVerifiedFacts(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return mentionsPluginCreation(normalized)
    || /urgent|priority|attention|긴급|우선|먼저|조치/.test(normalized)
    || /vault|볼트|health|status|상태|연결/.test(normalized)
    || /approval|approve|승인/.test(normalized)
    || /credential|lease|만료|폐기|revoke/.test(normalized);
}

function deterministicNavigation(prompt: string, allowedViews: PortalAssistantView[]): PortalAssistantView | undefined {
  const normalized = prompt.toLowerCase();
  const candidates: Array<[PortalAssistantView, RegExp]> = [
    ["plugins", /(plugin|플러그인)/],
    ["approvals", /(approval inbox|approvals|승인함|승인 대기)/],
    ["credentials", /(active credential|credential|lease|활성 credential|크레덴셜)/],
    ["health", /(platform health|vault health|플랫폼 상태|vault 상태)/],
    ["audit", /(audit|감사)/],
    ["requests", /(secret request|requests|secret 요청|요청 목록)/],
    ["systems", /(my systems|systems|내 시스템|시스템 목록)/],
    ["secrets", /(secret inventory|secret 전체|secret 현황)/],
    ["users", /(user management|users|사용자 관리)/],
    ["admin", /(admin|관리 화면|관리 탭)/],
    ["dashboard", /(dashboard|대시보드)/]
  ];
  const match = candidates.find(([view, pattern]) => allowedViews.includes(view) && pattern.test(normalized));
  return match?.[0];
}

function pageSummary(snapshot: PortalAssistantSnapshot, locale: PortalAssistantLocale): string {
  const metrics = snapshot.metrics;
  const summaries: Record<PortalAssistantView, [string, string]> = {
    dashboard: [
      `This overview has ${metrics.systems} systems, ${metrics.pendingRequests} pending requests, and ${metrics.activeCredentials} active credentials. Vault is ${snapshot.vault.healthy ? "healthy" : "not healthy"}.`,
      `현재 ${metrics.systems}개 시스템, 승인 대기 ${metrics.pendingRequests}건, 활성 Credential ${metrics.activeCredentials}개를 요약하고 있습니다. Vault 상태는 ${snapshot.vault.healthy ? "정상" : "확인 필요"}입니다.`
    ],
    secrets: [
      `${metrics.secretSurfaces} secret surfaces are mapped. ${metrics.expiringSoon} credentials expire within 24 hours and ${metrics.revokeFailures} have revoke failures.`,
      `${metrics.secretSurfaces}개의 Secret Surface가 연결되어 있습니다. 24시간 이내 만료 예정은 ${metrics.expiringSoon}개이고 Revoke 실패는 ${metrics.revokeFailures}개입니다.`
    ],
    systems: [
      `${metrics.systems} assigned systems expose ${metrics.secretSurfaces} Vault-backed secret surfaces.`,
      `할당된 시스템 ${metrics.systems}개에 Vault 기반 Secret Surface ${metrics.secretSurfaces}개가 연결되어 있습니다.`
    ],
    requests: [
      `${metrics.pendingRequests} visible requests are pending, including ${metrics.highRiskPending} high-risk requests.`,
      `현재 확인 가능한 요청 중 ${metrics.pendingRequests}건이 대기 중이며 High Risk는 ${metrics.highRiskPending}건입니다.`
    ],
    approvals: [
      `${metrics.pendingRequests} requests are waiting for review, including ${metrics.highRiskPending} high-risk requests.`,
      `검토 대기 요청은 ${metrics.pendingRequests}건이며, 이 중 High Risk는 ${metrics.highRiskPending}건입니다.`
    ],
    credentials: [
      `${metrics.activeCredentials} credentials are active, ${metrics.expiringSoon} expire soon, and ${metrics.revokeFailures} need revoke retry.`,
      `활성 Credential은 ${metrics.activeCredentials}개, 만료 임박은 ${metrics.expiringSoon}개이며 Revoke 재시도는 ${metrics.revokeFailures}개입니다.`
    ],
    audit: [
      `${metrics.failedAuditEvents} visible audit events are marked as failures.`,
      `현재 확인 가능한 Audit Event 중 실패로 기록된 항목은 ${metrics.failedAuditEvents}건입니다.`
    ],
    health: [
      `Vault is ${snapshot.vault.healthy ? "healthy" : "not healthy"}; ${snapshot.vault.mappingIssues} mappings are unreachable and ${snapshot.vault.drifted ?? 0} items are drifted.`,
      `Vault는 ${snapshot.vault.healthy ? "정상" : "확인 필요"} 상태이며 연결되지 않은 Mapping은 ${snapshot.vault.mappingIssues}건, Drift는 ${snapshot.vault.drifted ?? 0}건입니다.`
    ],
    plugins: [
      "Vault Plugin Factory uses its central AI workspace for requirements, generation, build, approval, and apply.",
      "Vault Plugin Factory에서는 중앙 AI 작업 공간에서 요구사항, 생성, Build, 승인, 적용을 이어서 진행합니다."
    ],
    users: [
      "User Management is available to Vault administrators. Ask about access governance or move to a workflow view for operational counts.",
      "사용자 관리는 Vault Admin 권한으로 접근합니다. 접근 권한 정책을 질문하거나 업무 화면으로 이동해 운영 현황을 확인할 수 있습니다."
    ],
    admin: [
      `${snapshot.vault.customPlugins ?? 0} custom plugins are registered, ${snapshot.vault.mountedCustomPlugins ?? 0} are mounted, and ${snapshot.vault.drifted ?? 0} reconciliation items are drifted.`,
      `Custom Plugin ${snapshot.vault.customPlugins ?? 0}개가 등록되어 있고 ${snapshot.vault.mountedCustomPlugins ?? 0}개가 Mount되어 있으며 Drift는 ${snapshot.vault.drifted ?? 0}건입니다.`
    ]
  };
  const [en, ko] = summaries[snapshot.view];
  return localized(locale, en, ko);
}

function localized(locale: PortalAssistantLocale, en: string, ko: string): string {
  return locale === "ko" ? ko : en;
}

function parseModelReply(content: string): z.infer<typeof modelReplySchema> | undefined {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const value = start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const parsed = modelReplySchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

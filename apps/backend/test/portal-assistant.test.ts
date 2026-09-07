import { describe, expect, it, vi } from "vitest";
import {
  buildPortalAssistantSnapshot,
  PortalAssistant,
  type PortalAssistantSnapshot
} from "../src/portal-assistant";

const rulesConfig = {
  mode: "rules" as const,
  model: "qwen3:8b",
  timeoutMs: 1000
};

const ollamaConfig = {
  mode: "ollama" as const,
  baseUrl: "http://ollama.internal:11434",
  model: "qwen3:8b",
  apiKey: "test-token",
  timeoutMs: 1000
};

const snapshot: PortalAssistantSnapshot = {
  view: "dashboard",
  allowedViews: ["dashboard", "secrets", "systems", "requests", "credentials", "plugins"],
  roles: ["developer"],
  metrics: {
    systems: 2,
    secretSurfaces: 4,
    pendingRequests: 3,
    highRiskPending: 1,
    activeCredentials: 5,
    expiringSoon: 2,
    revokeFailures: 1,
    failedAuditEvents: 1
  },
  vault: {
    mode: "real",
    healthy: true,
    version: "1.18.3",
    mappingIssues: 1,
    syncedAt: "2026-07-16T00:00:00.000Z",
    drifted: 0,
    critical: 0
  },
  pageItems: []
};

describe("PortalAssistant", () => {
  it("answers Vault status questions from the role-filtered snapshot", async () => {
    const assistant = new PortalAssistant(rulesConfig);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "현재 Vault 상태 알려줘" }],
      snapshot
    });

    expect(result.provider).toBe("rules");
    expect(result.reply).toContain("정상");
    expect(result.reply).toContain("Mapping은 1건");
    expect(result.action).toEqual({ type: "none" });
  });

  it("routes plugin creation requests to the existing Factory workspace", async () => {
    const assistant = new PortalAssistant(rulesConfig);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "GitHub PAT Rotation Plugin 만들어줘" }],
      snapshot
    });

    expect(result.reply).toContain("Vault Plugin Factory");
    expect(result.action).toEqual({ type: "navigate", view: "plugins" });
  });

  it("uses verified snapshot facts for operational questions even when Ollama is enabled", async () => {
    const fetchMock = vi.fn();
    const assistant = new PortalAssistant(ollamaConfig, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "현재 Vault 상태와 연결 문제 알려줘" }],
      snapshot
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.provider).toBe("rules");
    expect(result.fallbackReason).toBeUndefined();
    expect(result.reply).toContain("Mapping은 1건");
  });

  it("drops model navigation to a view the user cannot access", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "사용자 관리 화면을 확인하세요.",
              action: { type: "navigate", view: "users" }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new PortalAssistant(ollamaConfig, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "도움이 필요해" }],
      snapshot
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
  });

  it("keeps request payloads and credential material out of the model snapshot", () => {
    const built = buildPortalAssistantSnapshot({
      view: "credentials",
      user: {
        id: "user-1",
        email: "developer@example.com",
        displayName: "Developer",
        groups: ["team-a"],
        roles: ["developer"]
      },
      systems: [],
      requests: [
        {
          id: "request-1",
          requesterId: "user-1",
          requesterEmail: "developer@example.com",
          systemId: "system-1",
          systemName: "Payments",
          requestType: "KV_READ",
          status: "pending",
          reason: "contains-private-reason",
          riskLevel: "high",
          ttl: "1h",
          payload: { token: "must-not-leak" },
          approvalRequired: true,
          createdAt: "2026-07-16T00:00:00.000Z"
        }
      ],
      credentials: [
        {
          id: "credential-1",
          requestId: "request-1",
          systemId: "system-1",
          systemName: "Payments",
          requestType: "KV_READ",
          vaultMount: "kv/",
          vaultRole: "reader",
          vaultLeaseId: "secret-lease-id",
          ttl: "1h",
          expiresAt: "2099-07-16T01:00:00.000Z",
          status: "active",
          maskedDisplayValue: "masked-secret",
          metadata: { token: "must-not-leak" },
          createdAt: "2026-07-16T00:00:00.000Z"
        }
      ],
      auditEvents: [],
      vaultHealth: { mode: "real", healthy: true, detail: {} },
      mappingHealth: [],
      syncedAt: "2026-07-16T00:00:00.000Z"
    });
    const serialized = JSON.stringify(built);

    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("secret-lease-id");
    expect(serialized).not.toContain("masked-secret");
    expect(serialized).not.toContain("contains-private-reason");
  });
});

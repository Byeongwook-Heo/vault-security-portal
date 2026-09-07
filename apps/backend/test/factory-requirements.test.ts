import { describe, expect, it, vi } from "vitest";
import { vaultPluginTemplates } from "../src/plugin-factory/catalog";
import { FactoryRequirementsInterviewer } from "../src/plugin-factory/factory-requirements";

const rulesConfig = {
  mode: "rules" as const,
  model: "qwen3:8b",
  timeoutMs: 1000
};

describe("FactoryRequirementsInterviewer", () => {
  it("starts with inferred safe defaults and asks before generation", () => {
    const interviewer = new FactoryRequirementsInterviewer(rulesConfig, vaultPluginTemplates);
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    expect(template).toBeDefined();

    const interview = interviewer.start({
      locale: "ko",
      templateId: template?.id ?? "",
      requestedApply: true,
      mountPrefix: "factory-lab"
    });

    expect(interview.spec.targetSystem).toBe("openai");
    expect(interview.spec.mountPath).toBe("factory-lab/openai");
    expect(interview.spec.confirmed).toBe(false);
    expect(interview.missingFields).toEqual(["authMethod", "apiBasePath", "rotationStrategy", "revokeStrategy"]);
    expect(interview.reply).toContain("코드를 만들기 전에");
    expect(interview.reply).toContain("인증 방식, API 경로");
    expect(interview.reply).toContain("남은 2개 항목");
  });

  it("extracts labeled Korean answers and confirms a complete specification", async () => {
    const interviewer = new FactoryRequirementsInterviewer(rulesConfig, vaultPluginTemplates);
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const started = interviewer.start({
      locale: "ko",
      templateId: template?.id ?? "",
      requestedApply: false
    });

    const answered = await interviewer.answer({
      locale: "ko",
      interview: started,
      message:
        "인증 방식은 Seal-wrap 설정의 API Key, API 경로는 https://api.openai.com/v1, Rotation은 30일 주기, Revoke는 상위 키 즉시 폐기"
    });
    expect(answered.readyToConfirm).toBe(true);
    expect(answered.spec.authMethod).toContain("API Key");
    expect(answered.spec.apiBasePath).toBe("https://api.openai.com/v1");

    const confirmed = interviewer.confirm(answered, "ko");
    expect(confirmed.spec.confirmed).toBe(true);
    expect(confirmed.spec.confirmedAt).toBeDefined();
    expect(confirmed.reply).toContain("생성 명세를 확정");
  });

  it("rejects secret material from the interview", async () => {
    const interviewer = new FactoryRequirementsInterviewer(rulesConfig, vaultPluginTemplates);
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const started = interviewer.start({ locale: "ko", templateId: template?.id ?? "", requestedApply: false });

    await expect(
      interviewer.answer({ locale: "ko", interview: started, message: "인증은 hvs.this-is-a-real-looking-token-value" })
    ).rejects.toThrow("실제 토큰");
  });

  it("rejects labeled API key values without blocking an authentication-method description", async () => {
    const interviewer = new FactoryRequirementsInterviewer(rulesConfig, vaultPluginTemplates);
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const started = interviewer.start({ locale: "en", templateId: template?.id ?? "", requestedApply: false });

    await expect(
      interviewer.answer({ locale: "en", interview: started, message: "api_key=sk-this-looks-like-a-secret-value" })
    ).rejects.toThrow("Do not enter real tokens");
    await expect(
      interviewer.answer({ locale: "en", interview: started, message: "authentication method: API Key from sealed configuration" })
    ).resolves.toMatchObject({ spec: { authMethod: "API Key from sealed configuration" } });
  });

  it("uses Ollama extraction while preserving backend completeness checks", async () => {
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              patch: {
                targetSystem: null,
                authMethod: "API key from sealed configuration",
                apiBasePath: "https://api.openai.com/v1",
                ttl: null,
                rotationStrategy: "rotate every 30 days",
                revokeStrategy: "disable upstream key immediately",
                mountPath: null
              },
              reply: "요구사항을 반영했습니다."
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const interviewer = new FactoryRequirementsInterviewer(
      { mode: "ollama", baseUrl: "http://ollama.internal", model: "qwen3:8b", apiKey: "test", timeoutMs: 1000 },
      vaultPluginTemplates,
      fetchMock
    );
    const started = interviewer.start({ locale: "ko", templateId: template?.id ?? "", requestedApply: false });
    const answered = await interviewer.answer({
      locale: "ko",
      interview: started,
      message: "인증 방식은 API Key, API 경로는 https://api.openai.com/v1, Rotation은 30일, Revoke는 즉시 폐기"
    });

    expect(answered.provider).toBe("ollama");
    expect(answered.readyToConfirm).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not let a rotation duration overwrite TTL without an explicit TTL cue", async () => {
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              patch: {
                targetSystem: null,
                authMethod: null,
                apiBasePath: null,
                ttl: "24h",
                rotationStrategy: "rotate every 24 hours",
                revokeStrategy: null,
                mountPath: null
              },
              reply: "Rotation 요구사항을 반영했습니다."
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const interviewer = new FactoryRequirementsInterviewer(
      { mode: "ollama", baseUrl: "http://ollama.internal", model: "qwen3:8b", apiKey: "test", timeoutMs: 1000 },
      vaultPluginTemplates,
      fetchMock
    );
    const started = interviewer.start({ locale: "ko", templateId: template?.id ?? "", requestedApply: false });
    const answered = await interviewer.answer({
      locale: "ko",
      interview: started,
      message: "Rotation은 24시간마다 상위 키를 교체합니다"
    });

    expect(answered.spec.ttl).toBe(started.spec.ttl);
    expect(answered.spec.rotationStrategy).toContain("24시간");
  });
});

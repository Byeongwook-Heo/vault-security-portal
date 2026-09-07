import { describe, expect, it, vi } from "vitest";
import { vaultPluginTemplates } from "../src/plugin-factory/catalog";
import { FactoryAssistant } from "../src/plugin-factory/factory-assistant";

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

describe("FactoryAssistant", () => {
  it("returns the complete deterministic catalog for an all-plugins question", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "만들 수 있는 플러그인 전부 알려줘" }]
    });

    expect(result.provider).toBe("rules");
    expect(result.action).toEqual({ type: "list", filter: "all" });
    expect(result.reply).toContain(`전체 플러그인 템플릿은 ${vaultPluginTemplates.length}개`);
    for (const template of vaultPluginTemplates) expect(result.reply).toContain(template.displayName);
  });

  it("narrows a follow-up catalog question to database templates", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const result = await assistant.chat({
      locale: "ko",
      messages: [
        { role: "user", content: "만들 수 있는 플러그인 전부 알려줘" },
        { role: "assistant", content: "전체 목록을 알려드렸습니다." },
        { role: "user", content: "그중 데이터베이스만 알려줘" }
      ]
    });

    expect(result.action).toEqual({ type: "list", filter: "database" });
    expect(result.reply).toContain("템플릿은 9개");
    expect(result.reply).toContain("ClickHouse Database");
    expect(result.reply).not.toContain("Sectigo SCM PKI");
  });

  it("accepts a valid Ollama action and preserves the conversational reply", async () => {
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "sectigo-pki");
    expect(template).toBeDefined();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "좋아요. Sectigo 요구사항을 확인한 뒤 스캐폴드를 생성하겠습니다.",
              action: { type: "generate", templateId: template?.id, filter: null }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "섹티고 플러그인을 만들어줘" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "generate", templateId: template?.id });
    expect(result.reply).toContain("요구사항을 확인");
    expect(result.reply).toContain("명세가 확정되면");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("treats a Korean create-then-apply request as one plugin workflow", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const openAiTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const kafkaTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "kafka");
    expect(openAiTemplate).toBeDefined();
    expect(kafkaTemplate).toBeDefined();

    const result = await assistant.chat({
      locale: "ko",
      selectedTemplateId: kafkaTemplate?.id,
      generatedPluginName: kafkaTemplate?.name,
      messages: [{ role: "user", content: "OpenAI 플러그인 만들고 Vault에 적용해줘" }]
    });

    expect(result.action).toEqual({ type: "generate-and-apply", templateId: openAiTemplate?.id });
    expect(result.reply).toContain("OpenAI Project Secrets");
    expect(result.reply).not.toContain("Kafka");
  });

  it("selects GitHub PAT Rotation instead of the GitHub App template", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const patTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "github-pat");
    expect(patTemplate).toBeDefined();

    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "깃허브 PAT 로테이션 플러그인 만들어줘" }]
    });

    expect(result.action).toEqual({ type: "generate", templateId: patTemplate?.id });
    expect(result.reply).toContain("GitHub PAT Rotation");
    expect(result.reply).not.toContain("GitHub App Secrets");
  });

  it("asks the user to disambiguate when a create request names two templates", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Sectigo 또는 DigiCert 플러그인을 만들어줘" }]
    });

    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("Sectigo SCM PKI");
    expect(result.reply).toContain("DigiCert TLM PKI");
    expect(result.reply).toContain("하나를 지정");
  });

  it("overrides an Ollama apply misclassification when the user names a new plugin", async () => {
    const openAiTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const kafkaTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "kafka");
    expect(openAiTemplate).toBeDefined();
    expect(kafkaTemplate).toBeDefined();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "기존 생성 결과를 적용하겠습니다.",
              action: { type: "apply", templateId: null, filter: null }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);

    const result = await assistant.chat({
      locale: "ko",
      selectedTemplateId: kafkaTemplate?.id,
      generatedPluginName: kafkaTemplate?.name,
      messages: [{ role: "user", content: "OpenAI 플러그인 만들고 Vault에 적용해줘" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "generate-and-apply", templateId: openAiTemplate?.id });
    expect(result.reply).toContain("OpenAI Project Secrets");
    expect(result.reply).not.toContain("Kafka");
  });

  it("carries a single plugin target into a short Korean follow-up", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const openAiTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const kafkaTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "kafka");
    expect(openAiTemplate).toBeDefined();
    expect(kafkaTemplate).toBeDefined();

    const result = await assistant.chat({
      locale: "ko",
      selectedTemplateId: kafkaTemplate?.id,
      generatedPluginName: kafkaTemplate?.name,
      messages: [
        { role: "user", content: "OpenAI Project Secrets" },
        { role: "assistant", content: "OpenAI 프로젝트용 시크릿 플러그인입니다." },
        { role: "user", content: "만들어줘" }
      ]
    });

    expect(result.action).toEqual({ type: "generate", templateId: openAiTemplate?.id });
    expect(result.reply).toContain("OpenAI Project Secrets");
    expect(result.reply).not.toContain("Kafka");
  });

  it("overrides an Ollama template guess with the previous single user target", async () => {
    const openAiTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "openai");
    const kafkaTemplate = vaultPluginTemplates.find((item) => item.integrationTarget === "kafka");
    expect(openAiTemplate).toBeDefined();
    expect(kafkaTemplate).toBeDefined();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "Kafka 템플릿을 생성하겠습니다.",
              action: { type: "generate", templateId: kafkaTemplate?.id, filter: null }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);

    const result = await assistant.chat({
      locale: "ko",
      selectedTemplateId: kafkaTemplate?.id,
      generatedPluginName: kafkaTemplate?.name,
      messages: [
        { role: "user", content: "OpenAI Project Secrets" },
        { role: "assistant", content: "OpenAI 프로젝트용 시크릿 플러그인입니다." },
        { role: "user", content: "만들어줘" }
      ]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "generate", templateId: openAiTemplate?.id });
    expect(result.reply).toContain("OpenAI Project Secrets");
    expect(result.reply).not.toContain("Kafka");
  });

  it("keeps comparison questions conversational when Ollama misclassifies them as a list", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "Sectigo는 SCM 중심 수명주기에, DigiCert는 TLM 중심 운영에 적합합니다.",
              action: { type: "list", templateId: null, filter: "partner" }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Sectigo와 DigiCert의 차이와 적합한 상황을 알려줘" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("수명주기");
    expect(result.reply).not.toContain("전체 목록");
  });

  it("does not select a template for a general plugin-type design question", async () => {
    const template = vaultPluginTemplates.find((item) => item.integrationTarget === "clickhouse");
    expect(template).toBeDefined();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "인증, Secret engine, Database 유형은 발급하려는 자격 증명과 수명주기에 따라 선택합니다.",
              action: { type: "select", templateId: template?.id, filter: null }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [
        {
          role: "user",
          content: "인증 방식, Secret engine, Database plugin 중 어떤 유형을 선택해야 하는지 설명해줘"
        }
      ]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("수명주기");
  });

  it("keeps a general help question conversational instead of listing the catalog", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "플러그인 탐색, 비교, 생성과 적용 흐름을 도와드릴 수 있습니다.",
              action: { type: "list", templateId: null, filter: "all" }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "안녕, 지금 어떤 도움을 줄 수 있어?" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("도와드릴 수 있습니다");
    expect(result.reply).not.toContain("전체 플러그인 템플릿");
  });

  it("does not turn an explanation into a catalog list in fallback mode", async () => {
    const assistant = new FactoryAssistant(rulesConfig, vaultPluginTemplates);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Kafka 플러그인이 어떤 역할을 하는지 알려줘" }]
    });

    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("Apache Kafka client credential");
    expect(result.reply).toContain("위험도");
    expect(result.reply).not.toContain("전체 플러그인 템플릿");
  });

  it("blocks an apply action when no generated plugin exists", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({ reply: "적용하겠습니다.", action: { type: "apply" } })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Vault에 적용해줘" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("먼저 플러그인을 생성");
  });

  it("does not let the model announce apply success before the backend runs it", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              reply: "플러그인이 Vault에 성공적으로 등록되었습니다.",
              action: { type: "apply" }
            })
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      generatedPluginName: "sectigo-vault-pki",
      messages: [{ role: "user", content: "Vault에 적용해줘" }]
    });

    expect(result.action).toEqual({ type: "apply" });
    expect(result.reply).toContain("적용 절차를 시작");
    expect(result.reply).not.toContain("성공");
  });

  it("retries a truncated model response with a concise JSON request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: { content: '{"reply":"잘린 답변' } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                reply: "Kafka 플러그인은 클라이언트 자격 증명과 ACL을 관리합니다.",
                action: { type: "none", templateId: null, filter: null }
              })
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Kafka 플러그인을 설명해줘" }]
    });

    expect(result.provider).toBe("ollama");
    expect(result.action).toEqual({ type: "none" });
    expect(result.reply).toContain("ACL");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.format.type).toBe("object");
    expect(firstBody.options.num_predict).toBe(480);
    expect(retryBody.options.num_predict).toBe(260);
    expect(retryBody.messages[0].content).toContain("previous response was invalid or truncated");
  });

  it("reports an invalid response without claiming the AI connection is down", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: '{"reply":"still truncated' } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const assistant = new FactoryAssistant(ollamaConfig, vaultPluginTemplates, fetchMock);
    const result = await assistant.chat({
      locale: "ko",
      messages: [{ role: "user", content: "Kafka 플러그인을 자세히 설명해줘" }]
    });

    expect(result.provider).toBe("rules");
    expect(result.fallbackReason).toBe("invalid-response");
    expect(result.reply).toContain("AI 연결은 정상");
    expect(result.reply).not.toContain("연결할 수 없");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back safely when Ollama is unavailable", async () => {
    const assistant = new FactoryAssistant(
      ollamaConfig,
      vaultPluginTemplates,
      vi.fn(async () => {
        throw new Error("connection refused");
      })
    );
    const result = await assistant.chat({
      locale: "en",
      messages: [{ role: "user", content: "What plugins can you make?" }]
    });

    expect(result.provider).toBe("rules");
    expect(result.fallbackReason).toBe("unavailable");
    expect(result.action).toEqual({ type: "list", filter: "all" });
    expect(result.reply).toContain("complete list");
  });
});

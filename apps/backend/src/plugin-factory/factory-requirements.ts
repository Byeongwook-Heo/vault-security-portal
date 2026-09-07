import crypto from "node:crypto";
import type {
  VaultPluginRequirementField,
  VaultPluginRequirements,
  VaultPluginRequirementsInterview,
  VaultPluginTemplate
} from "@security-portal/shared";
import { z } from "zod";

export type FactoryRequirementsLocale = "ko" | "en";

interface FactoryRequirementsConfig {
  mode: "rules" | "ollama";
  baseUrl?: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

interface StartInterviewInput {
  locale: FactoryRequirementsLocale;
  templateId: string;
  requestedApply: boolean;
  mountPrefix?: string;
}

interface AnswerInterviewInput {
  locale: FactoryRequirementsLocale;
  interview: VaultPluginRequirementsInterview;
  message: string;
}

const requirementFields: VaultPluginRequirementField[] = [
  "targetSystem",
  "authMethod",
  "apiBasePath",
  "ttl",
  "rotationStrategy",
  "revokeStrategy",
  "mountPath"
];

const requirementPatterns: Array<[VaultPluginRequirementField, RegExp]> = [
  ["targetSystem", /(?:대상\s*시스템|target\s*system)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["authMethod", /(?:인증\s*방식|인증|auth(?:entication)?(?:\s*method)?)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["apiBasePath", /(?:api\s*(?:경로|주소|url|path|base)|엔드포인트|endpoint)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["ttl", /(?:ttl|유효\s*시간|수명)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["rotationStrategy", /(?:rotation|로테이션|교체\s*전략)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["revokeStrategy", /(?:revoke|폐기|철회\s*전략)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i],
  ["mountPath", /(?:mount\s*(?:경로|path)?|마운트\s*경로)\s*(?:은|는|:|=)?\s*([^,;\n]+)/i]
];

const explicitFieldCues: Record<VaultPluginRequirementField, RegExp> = {
  targetSystem: /대상\s*시스템|target\s*system/i,
  authMethod: /인증|auth(?:entication)?|api\s*key|oauth|jwt|service\s*account|mTLS/i,
  apiBasePath: /api\s*(?:경로|주소|url|path|base)|엔드포인트|endpoint|https?:\/\//i,
  ttl: /\bttl\b|유효\s*시간|수명/i,
  rotationStrategy: /rotation|로테이션|교체\s*전략/i,
  revokeStrategy: /revoke|폐기|철회\s*전략/i,
  mountPath: /mount\s*(?:경로|path)?|마운트\s*경로/i
};

const requirementPatchSchema = z.object({
  targetSystem: z.string().trim().max(200).nullable().optional(),
  authMethod: z.string().trim().max(300).nullable().optional(),
  apiBasePath: z.string().trim().max(300).nullable().optional(),
  ttl: z.string().trim().max(80).nullable().optional(),
  rotationStrategy: z.string().trim().max(500).nullable().optional(),
  revokeStrategy: z.string().trim().max(500).nullable().optional(),
  mountPath: z.string().trim().max(120).nullable().optional()
});

const modelResponseSchema = z.object({
  patch: requirementPatchSchema,
  reply: z.string().trim().min(1).max(1500)
});

const modelFormat = {
  type: "object",
  properties: {
    patch: {
      type: "object",
      properties: Object.fromEntries(
        requirementFields.map((field) => [field, { type: ["string", "null"] }])
      ),
      required: requirementFields,
      additionalProperties: false
    },
    reply: { type: "string" }
  },
  required: ["patch", "reply"],
  additionalProperties: false
} as const;

export class FactoryRequirementsInterviewer {
  private readonly baseUrl?: string;

  constructor(
    private readonly config: FactoryRequirementsConfig,
    private readonly templates: VaultPluginTemplate[],
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.baseUrl = config.baseUrl?.replace(/\/+$/, "");
  }

  start(input: StartInterviewInput): VaultPluginRequirementsInterview {
    const template = this.requireTemplate(input.templateId);
    const mountPrefix = normalizeMountPrefix(input.mountPrefix);
    const mountPath = `${mountPrefix}${template.defaultMountPath}`.replace(/\/+$/g, "");
    const spec: VaultPluginRequirements = {
      targetSystem: template.integrationTarget,
      authMethod: "",
      apiBasePath: "",
      ttl: template.pluginType === "auth" ? "1h" : template.pluginType === "database" ? "30m" : "15m",
      rotationStrategy: "",
      revokeStrategy: "",
      mountPath,
      environment: "dev",
      confirmed: false
    };
    return this.toInterview({
      id: crypto.randomUUID(),
      templateId: template.id,
      requestedApply: input.requestedApply,
      spec,
      provider: this.config.mode === "ollama" ? "ollama" : "rules",
      locale: input.locale
    });
  }

  async answer(input: AnswerInterviewInput): Promise<VaultPluginRequirementsInterview> {
    const template = this.requireTemplate(input.interview.templateId);
    const message = input.message.trim();
    if (!message) return input.interview;
    assertNoSecretMaterial(message, input.locale);

    let patch: z.infer<typeof requirementPatchSchema> = {};
    let provider: VaultPluginRequirementsInterview["provider"] = "rules";
    const rulePatch = parseRulePatch(message, input.interview.missingFields);
    if (this.config.mode === "ollama" && this.baseUrl && this.config.apiKey) {
      try {
        const modelPatch = (await this.extractWithModel(template, input.interview.spec, message, input.locale)).patch;
        patch = constrainModelPatch(modelPatch, rulePatch, message, input.interview.missingFields);
        provider = "ollama";
      } catch {
        patch = rulePatch;
      }
    } else {
      patch = rulePatch;
    }

    const spec = mergeRequirementPatch(input.interview.spec, patch);
    return this.toInterview({
      id: input.interview.id,
      templateId: input.interview.templateId,
      requestedApply: input.interview.requestedApply,
      spec,
      provider,
      locale: input.locale
    });
  }

  confirm(
    interview: VaultPluginRequirementsInterview,
    locale: FactoryRequirementsLocale
  ): VaultPluginRequirementsInterview {
    this.requireTemplate(interview.templateId);
    const missingFields = missingRequirementFields(interview.spec);
    if (missingFields.length) {
      throw new Error(
        locale === "ko"
          ? `명세 확정 전에 ${missingFields.map((field) => requirementLabel(field, locale)).join(", ")} 항목을 입력하세요.`
          : `Complete ${missingFields.map((field) => requirementLabel(field, locale)).join(", ")} before confirmation.`
      );
    }
    return this.toInterview({
      id: interview.id,
      templateId: interview.templateId,
      requestedApply: interview.requestedApply,
      spec: { ...interview.spec, confirmed: true, confirmedAt: new Date().toISOString() },
      provider: interview.provider,
      locale
    });
  }

  private async extractWithModel(
    template: VaultPluginTemplate,
    current: VaultPluginRequirements,
    message: string,
    locale: FactoryRequirementsLocale
  ): Promise<z.infer<typeof modelResponseSchema>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
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
                "You extract a Vault plugin requirements interview into JSON.",
                `Answer in ${locale === "ko" ? "Korean" : "English"}.`,
                "Only extract values explicitly stated by the user. Use null for every field not stated.",
                "Never treat credentials, API keys, tokens, passwords, or secret values as requirements.",
                "apiBasePath is an API URL or path, not a credential.",
                "rotationStrategy and revokeStrategy must describe lifecycle behavior.",
                `Template: ${template.displayName} (${template.pluginType}, target ${template.integrationTarget}).`,
                `Current spec: ${JSON.stringify(current)}`,
                "Return JSON only."
              ].join("\n")
            },
            { role: "user", content: message }
          ],
          stream: false,
          format: modelFormat,
          think: false,
          keep_alive: "30m",
          options: { temperature: 0.1, num_ctx: 4096, num_predict: 420 }
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`ollama-http-${response.status}`);
      const payload = (await response.json()) as { message?: { content?: string } };
      return modelResponseSchema.parse(parseJson(payload.message?.content ?? ""));
    } finally {
      clearTimeout(timeout);
    }
  }

  private toInterview(input: {
    id: string;
    templateId: string;
    requestedApply: boolean;
    spec: VaultPluginRequirements;
    provider: VaultPluginRequirementsInterview["provider"];
    locale: FactoryRequirementsLocale;
  }): VaultPluginRequirementsInterview {
    const missingFields = missingRequirementFields(input.spec);
    return {
      id: input.id,
      templateId: input.templateId,
      requestedApply: input.requestedApply,
      spec: input.spec,
      missingFields,
      readyToConfirm: missingFields.length === 0,
      provider: input.provider,
      model: input.provider === "ollama" ? this.config.model : undefined,
      reply: interviewReply(input.spec, missingFields, input.locale),
      updatedAt: new Date().toISOString()
    };
  }

  private requireTemplate(templateId: string): VaultPluginTemplate {
    const template = this.templates.find((item) => item.id === templateId);
    if (!template) throw new Error(`Unknown Vault plugin template: ${templateId}`);
    return template;
  }
}

export function missingRequirementFields(spec: VaultPluginRequirements): VaultPluginRequirementField[] {
  return requirementFields.filter((field) => !spec[field].trim());
}

function mergeRequirementPatch(
  current: VaultPluginRequirements,
  patch: z.infer<typeof requirementPatchSchema>
): VaultPluginRequirements {
  const next = { ...current, confirmed: false, confirmedAt: undefined };
  for (const field of requirementFields) {
    const value = patch[field];
    if (typeof value !== "string" || !value.trim()) continue;
    next[field] = field === "mountPath" ? normalizeMountPath(value) : value.trim();
  }
  return next;
}

function parseRulePatch(
  message: string,
  missingFields: VaultPluginRequirementField[]
): z.infer<typeof requirementPatchSchema> {
  const patch: z.infer<typeof requirementPatchSchema> = {};
  for (const [field, pattern] of requirementPatterns) {
    const value = message.match(pattern)?.[1]?.trim();
    if (value) patch[field] = value;
  }
  if (!Object.keys(patch).length && missingFields.length === 1) {
    const field = missingFields[0];
    if (field) patch[field] = message.trim();
  }
  return patch;
}

function constrainModelPatch(
  modelPatch: z.infer<typeof requirementPatchSchema>,
  rulePatch: z.infer<typeof requirementPatchSchema>,
  message: string,
  missingFields: VaultPluginRequirementField[]
): z.infer<typeof requirementPatchSchema> {
  const allowed = new Set(
    requirementFields.filter((field) => explicitFieldCues[field].test(message))
  );
  if (missingFields.length === 1 && missingFields[0]) allowed.add(missingFields[0]);
  const constrained: z.infer<typeof requirementPatchSchema> = {};
  for (const field of requirementFields) {
    const value = modelPatch[field];
    if (allowed.has(field) && typeof value === "string" && value.trim()) constrained[field] = value;
  }
  return { ...constrained, ...rulePatch };
}

function interviewReply(
  spec: VaultPluginRequirements,
  missingFields: VaultPluginRequirementField[],
  locale: FactoryRequirementsLocale
): string {
  if (spec.confirmed) {
    return locale === "ko"
      ? `생성 명세를 확정했습니다. ${spec.targetSystem}, mount ${spec.mountPath}/, TTL ${spec.ttl} 기준으로 코드를 생성하겠습니다.`
      : `The generation specification is confirmed for ${spec.targetSystem}, mounted at ${spec.mountPath}/ with TTL ${spec.ttl}.`;
  }
  if (missingFields.length) {
    const nextFields = missingFields.slice(0, 2);
    const labels = nextFields.map((field) => requirementLabel(field, locale)).join(", ");
    const remainingCount = missingFields.length - nextFields.length;
    return locale === "ko"
      ? `대상 시스템 ${spec.targetSystem}, TTL ${spec.ttl}, Mount ${spec.mountPath}/까지 확인했습니다. 코드를 만들기 전에 먼저 다음 항목을 알려주세요: ${labels}.${remainingCount ? ` 답변을 반영한 뒤 남은 ${remainingCount}개 항목을 이어서 확인하겠습니다.` : ""} 실제 토큰이나 비밀번호 값은 입력하지 마세요.`
      : `I have the target ${spec.targetSystem}, TTL ${spec.ttl}, and mount ${spec.mountPath}/. Before generating code, please provide ${labels}.${remainingCount ? ` I will then ask about the remaining ${remainingCount} item${remainingCount === 1 ? "" : "s"}.` : ""} Do not enter real tokens or passwords.`;
  }
  return locale === "ko"
    ? `필수 요구사항이 모두 준비됐습니다. 대상 ${spec.targetSystem}, 인증 ${spec.authMethod}, API ${spec.apiBasePath}, TTL ${spec.ttl}, Rotation ${spec.rotationStrategy}, Revoke ${spec.revokeStrategy}, Mount ${spec.mountPath}/입니다. 내용을 검토한 뒤 명세를 확정해주세요.`
    : `All required inputs are ready. Target ${spec.targetSystem}, auth ${spec.authMethod}, API ${spec.apiBasePath}, TTL ${spec.ttl}, rotation ${spec.rotationStrategy}, revoke ${spec.revokeStrategy}, mount ${spec.mountPath}/. Review and confirm the specification.`;
}

function requirementLabel(field: VaultPluginRequirementField, locale: FactoryRequirementsLocale): string {
  const labels: Record<VaultPluginRequirementField, [string, string]> = {
    targetSystem: ["target system", "대상 시스템"],
    authMethod: ["authentication method", "인증 방식"],
    apiBasePath: ["API path", "API 경로"],
    ttl: ["TTL", "TTL"],
    rotationStrategy: ["rotation strategy", "Rotation 방식"],
    revokeStrategy: ["revoke strategy", "Revoke 방식"],
    mountPath: ["mount path", "Mount 경로"]
  };
  return locale === "ko" ? labels[field][1] : labels[field][0];
}

function normalizeMountPrefix(value?: string): string {
  if (!value?.trim()) return "";
  return `${normalizeMountPath(value)}/`;
}

function normalizeMountPath(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9/_-]/g, "-")
    .replace(/\/+/g, "/");
  if (!normalized) throw new Error("Mount path is required");
  return normalized;
}

function assertNoSecretMaterial(message: string, locale: FactoryRequirementsLocale): void {
  if (/(?:hvs\.|hvb\.|sk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|(?:password|token|api[_ -]?key|secret|비밀번호|토큰|비밀)\s*[:=]\s*\S+)/i.test(message)) {
    throw new Error(
      locale === "ko"
        ? "요구사항 인터뷰에는 실제 토큰, 비밀번호, API 키 또는 개인 키를 입력하지 마세요."
        : "Do not enter real tokens, passwords, API keys, or private keys in the requirements interview"
    );
  }
}

function parseJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed);
}

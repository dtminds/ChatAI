import { BadRequestError } from "../../shared/errors.js";
import type { InsightAnalysisOutput, InsightSessionAnalyzer } from "./insights-worker.js";
import type { AiMessageInput } from "./insights.types.js";

export type OpenAiCompatibleProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerCode: "volcengine_ark";
  protocol: "openai-compatible";
};

type ProviderEnv = {
  VOLCENGINE_ARK_API_KEY?: string;
  VOLCENGINE_ARK_BASE_URL?: string;
  VOLCENGINE_ARK_MODEL?: string;
};

export function createVolcengineArkProviderConfig(
  env: ProviderEnv = process.env,
): OpenAiCompatibleProviderConfig {
  const apiKey = env.VOLCENGINE_ARK_API_KEY?.trim();
  const baseUrl = env.VOLCENGINE_ARK_BASE_URL?.trim();
  const model = env.VOLCENGINE_ARK_MODEL?.trim();
  const missing = [
    ["VOLCENGINE_ARK_API_KEY", apiKey],
    ["VOLCENGINE_ARK_BASE_URL", baseUrl],
    ["VOLCENGINE_ARK_MODEL", model],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new BadRequestError(
      "LLM_PROVIDER_CONFIG_MISSING",
      `Missing LLM provider configuration: ${missing.join(", ")}`,
    );
  }

  if (!isHttpsUrl(baseUrl)) {
    throw new BadRequestError(
      "LLM_PROVIDER_BASE_URL_INVALID",
      "VOLCENGINE_ARK_BASE_URL must be an HTTPS URL",
    );
  }

  return {
    apiKey: requireString(apiKey),
    baseUrl,
    model: requireString(model),
    providerCode: "volcengine_ark",
    protocol: "openai-compatible",
  };
}

function requireString(value: string | undefined) {
  if (!value) {
    throw new BadRequestError(
      "LLM_PROVIDER_CONFIG_MISSING",
      "Missing LLM provider configuration",
    );
  }

  return value;
}

export function maskProviderConfigForLog(config: OpenAiCompatibleProviderConfig) {
  return {
    ...config,
    apiKey: "[redacted]",
  };
}

export class OpenAiCompatibleInsightAnalyzer implements InsightSessionAnalyzer {
  constructor(private readonly config: OpenAiCompatibleProviderConfig) {}

  async analyzeSession(input: {
    messages: AiMessageInput[];
  }): Promise<InsightAnalysisOutput> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      body: JSON.stringify({
        messages: [
          {
            content: buildSystemPrompt(),
            role: "system",
          },
          {
            content: buildUserPrompt(input.messages),
            role: "user",
          },
        ],
        model: this.config.model,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("LLM response content is empty");
    }

    return normalizeAnalysisOutput(JSON.parse(content));
  }
}

function isHttpsUrl(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function buildSystemPrompt() {
  return [
    "你是客服会话洞察分析器。",
    "只输出 JSON object，不要输出 Markdown。",
    "所有 evidenceMessageIds 必须使用输入消息中的 sourceMessageId。",
    "字段包括 summary, sentiment, tags, qaFindings, problemResolution, entities, intents, risks, actionItems, faqCandidates。",
  ].join("\n");
}

function buildUserPrompt(messages: AiMessageInput[]) {
  return JSON.stringify({
    messages: messages.map((message) => ({
      content: message.aiText,
      contentStatus: message.contentStatus,
      messageType: message.messageType,
      senderRole: message.senderRole,
      sourceMessageId: message.sourceMessageId,
      time: message.occurredAt,
    })),
  });
}

function normalizeAnalysisOutput(value: unknown): InsightAnalysisOutput {
  const record = isRecord(value) ? value : {};
  const summary = isRecord(record.summary) ? record.summary : {};
  const problem = isRecord(record.problemResolution) ? record.problemResolution : {};

  return {
    actionItems: readArray(record.actionItems).map((item) => ({
      actionType: readString(item, "actionType") || "follow_up",
      dueHint: readOptionalString(item, "dueHint"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      priority: readPriority(readString(item, "priority")),
      title: readString(item, "title") || "待跟进事项",
    })),
    entities: readArray(record.entities).map((item) => ({
      confidence: readNumber(item, "confidence"),
      entityId: readString(item, "entityId") || readString(item, "entityName") || "unknown",
      entityName: readString(item, "entityName") || "未知实体",
      entityType: readString(item, "entityType") || "custom",
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      sentiment: readOptionalString(item, "sentiment"),
    })),
    faqCandidates: readArray(record.faqCandidates).map((item) => ({
      answerHint: readString(item, "answerHint"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      question: readString(item, "question"),
      status: readString(item, "status") || "candidate",
    })),
    intents: readArray(record.intents).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      intentCode: readString(item, "intentCode") || "custom",
      intentLabel: readString(item, "intentLabel") || "其他",
    })),
    problemResolution: {
      confidence: readNumber(problem, "confidence"),
      evidenceMessageIds: readStringArray(problem, "evidenceMessageIds"),
      problemDetected: readBoolean(problem, "problemDetected"),
      problemSummary: readString(problem, "problemSummary"),
      resolutionStatus: readResolutionStatus(readString(problem, "resolutionStatus")),
      unresolvedReason: readOptionalString(problem, "unresolvedReason"),
    },
    qaFindings: readArray(record.qaFindings).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      passed: readBoolean(item, "passed"),
      reason: readString(item, "reason"),
      ruleCode: readString(item, "ruleCode") || "custom",
      severity: readSeverity(readString(item, "severity")),
    })),
    risks: readArray(record.risks).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      reason: readString(item, "reason"),
      riskLevel: readSeverity(readString(item, "riskLevel")),
      riskType: readString(item, "riskType") || "custom",
    })),
    sentiment: readArray(record.sentiment).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      polarity: readPolarity(readString(item, "polarity")),
      reason: readString(item, "reason"),
    })),
    summary: {
      confidence: readNumber(summary, "confidence"),
      customerIntent: readString(summary, "customerIntent"),
      followUp: readOptionalString(summary, "followUp"),
      processSummary: readString(summary, "processSummary"),
      resultSummary: readString(summary, "resultSummary"),
    },
    tags: readArray(record.tags).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      tagCode: readString(item, "tagCode") || "custom",
      tagName: readString(item, "tagName") || "自定义标签",
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readString(record: unknown, key: string) {
  return isRecord(record) && typeof record[key] === "string" ? record[key].trim() : "";
}

function readOptionalString(record: unknown, key: string) {
  const value = readString(record, key);

  return value || undefined;
}

function readStringArray(record: unknown, key: string) {
  return isRecord(record) && Array.isArray(record[key])
    ? record[key].map(String).filter(Boolean)
    : [];
}

function readNumber(record: unknown, key: string) {
  const value = isRecord(record) ? Number(record[key]) : 0;

  return Number.isFinite(value) ? value : 0;
}

function readBoolean(record: unknown, key: string) {
  return isRecord(record) && record[key] === true;
}

function readSeverity(value: string) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function readPriority(value: string) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "medium";
}

function readPolarity(value: string) {
  if (
    value === "positive" ||
    value === "neutral" ||
    value === "negative" ||
    value === "mixed" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function readResolutionStatus(value: string) {
  if (
    value === "resolved" ||
    value === "unresolved" ||
    value === "partially_resolved" ||
    value === "no_customer_problem" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

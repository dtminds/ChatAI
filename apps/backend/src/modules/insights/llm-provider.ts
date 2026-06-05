import { BadRequestError } from "../../shared/errors.js";
import type { InsightAnalyzerOutput, InsightAnalysisOutput, InsightSessionAnalyzer } from "./insights-worker.js";
import {
  buildInsightClassificationPromptMessages,
  buildInsightPromptMessages,
  buildInsightQaPromptMessages,
  buildInsightSummaryPromptMessages,
  type InsightPromptMessage,
} from "./insight-prompt-builder.js";

export type OpenAiCompatibleProviderConfig = {
  analysisMode?: "multi_step" | "single";
  apiKey: string;
  baseUrl: string;
  liteMaxTokens: number;
  liteModel: string;
  maxTokens: number;
  model: string;
  providerCode: "volcengine_ark";
  protocol: "openai-compatible";
  requestTimeoutMs?: number;
  responseFormat?: "json_object";
  retry?: {
    baseDelayMs: number;
    maxAttempts: number;
  };
};

type ProviderEnv = {
  VOLCENGINE_ARK_API_KEY?: string;
  VOLCENGINE_ARK_BASE_URL?: string;
  VOLCENGINE_ARK_LITE_MAX_TOKENS?: string;
  VOLCENGINE_ARK_LITE_MODEL?: string;
  VOLCENGINE_ARK_MAX_TOKENS?: string;
  VOLCENGINE_ARK_MODEL?: string;
};

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_RETRY_BASE_DELAY_MS = 1_000;
const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export function createVolcengineArkProviderConfig(
  env: ProviderEnv = process.env,
): OpenAiCompatibleProviderConfig {
  const apiKey = env.VOLCENGINE_ARK_API_KEY?.trim();
  const baseUrl = env.VOLCENGINE_ARK_BASE_URL?.trim();
  const model = env.VOLCENGINE_ARK_MODEL?.trim();
  const maxTokens = parsePositiveInteger(env.VOLCENGINE_ARK_MAX_TOKENS) ?? DEFAULT_MAX_TOKENS;
  const liteModel = env.VOLCENGINE_ARK_LITE_MODEL?.trim() || model;
  const liteMaxTokens = parsePositiveInteger(env.VOLCENGINE_ARK_LITE_MAX_TOKENS) ?? maxTokens;
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
    analysisMode: "multi_step",
    apiKey: requireString(apiKey),
    baseUrl,
    liteMaxTokens,
    liteModel: requireString(liteModel),
    maxTokens,
    model: requireString(model),
    providerCode: "volcengine_ark",
    protocol: "openai-compatible",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    responseFormat: "json_object",
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
  private responseFormatUnsupported = false;

  constructor(private readonly config: OpenAiCompatibleProviderConfig) {}

  async analyzeSession(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalysisOutput> {
    return retryLlmRequest(() => this.doAnalyzeSessionWithResponseFormatFallback(input), this.config.retry);
  }

  private async doAnalyzeSessionWithResponseFormatFallback(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalysisOutput> {
    try {
      return await this.doAnalyzeSession(input);
    } catch (error) {
      if (!this.config.responseFormat || this.responseFormatUnsupported || !isResponseFormatUnsupportedError(error)) {
        throw error;
      }

      this.responseFormatUnsupported = true;
      return this.doAnalyzeSession(input);
    }
  }

  private async doAnalyzeSession(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalysisOutput> {
    if (this.config.analysisMode !== "single") {
      return await this.doAnalyzeSessionInSteps(input);
    }

    return await this.completeAnalysisStep({
      maxTokens: this.config.maxTokens,
      messages: buildInsightPromptMessages({
        context: input.context,
        messages: input.messages,
        previousSessionContexts: input.previousSessionContexts,
      }),
      model: this.config.model,
    });
  }

  private async doAnalyzeSessionInSteps(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalyzerOutput> {
    if (input.job.analysisScope === "qaFindings") {
      const priorConclusions = buildPriorConclusions(input.previousOutput);
      return await this.completeOptionalStep("qaFindings", {
        maxTokens: this.config.maxTokens,
        messages: buildInsightQaPromptMessages({
          context: input.context,
          messages: input.messages,
          previousSessionContexts: input.previousSessionContexts,
          priorConclusions,
        }),
        model: this.config.model,
      });
    }

    if (input.job.analysisScope === "classification") {
      const priorConclusions = buildPriorConclusions(input.previousOutput);
      return await this.completeOptionalStep("classification", {
        maxTokens: this.config.liteMaxTokens,
        messages: buildInsightClassificationPromptMessages({
          context: input.context,
          messages: input.messages,
          previousSessionContexts: input.previousSessionContexts,
          priorConclusions,
        }),
        model: this.config.liteModel,
      });
    }

    const summary = await this.completeAnalysisStep({
      maxTokens: this.config.maxTokens,
      messages: buildInsightSummaryPromptMessages({
        context: input.context,
        messages: input.messages,
        previousSessionContexts: input.previousSessionContexts,
      }),
      model: this.config.model,
    });
    const priorConclusions = {
      actionItems: summary.actionItems,
      problemResolution: summary.problemResolution,
      summary: summary.summary,
    };
    const runQa = input.job?.mode !== "live";
    const [qa, classification] = await Promise.all([
      runQa
        ? this.completeOptionalStep("qaFindings", {
          maxTokens: this.config.maxTokens,
          messages: buildInsightQaPromptMessages({
            context: input.context,
            messages: input.messages,
            previousSessionContexts: input.previousSessionContexts,
            priorConclusions,
          }),
          model: this.config.model,
        })
        : Promise.resolve(emptyAnalysisOutput()),
      this.completeOptionalStep("classification", {
        maxTokens: this.config.liteMaxTokens,
        messages: buildInsightClassificationPromptMessages({
          context: input.context,
          messages: input.messages,
          previousSessionContexts: input.previousSessionContexts,
          priorConclusions,
        }),
        model: this.config.liteModel,
      }),
    ]);

    return {
      ...summary,
      analysisWarnings: [
        ...readAnalysisWarnings(qa),
        ...readAnalysisWarnings(classification),
      ],
      entities: classification.entities,
      intents: classification.intents,
      qaFindings: qa.qaFindings,
      tags: classification.tags,
    };
  }

  private async completeOptionalStep(
    stepName: string,
    input: {
      maxTokens: number;
      messages: InsightPromptMessage[];
      model: string;
    },
  ): Promise<InsightAnalyzerOutput> {
    try {
      return await retryLlmRequest(() => this.completeAnalysisStep(input), this.config.retry);
    } catch (error) {
      if (isResponseFormatUnsupportedError(error)) {
        throw error;
      }

      return {
        ...emptyAnalysisOutput(),
        analysisWarnings: [`${stepName} analysis failed: ${formatAnalysisError(error)}`],
      };
    }
  }

  private async completeAnalysisStep(input: {
    maxTokens: number;
    messages: InsightPromptMessage[];
    model: string;
  }) {
    return normalizeAnalysisOutput(await this.completeJson(input));
  }

  private async completeJson(input: {
    maxTokens: number;
    messages: InsightPromptMessage[];
    model: string;
  }) {
    const requestBody: Record<string, unknown> = {
      max_tokens: input.maxTokens,
      messages: input.messages,
      model: input.model,
      temperature: 0.2,
    };

    if (this.config.responseFormat && !this.responseFormatUnsupported) {
      requestBody.response_format = { type: this.config.responseFormat };
    }

    const response = await fetchWithTimeout(
      `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        body: JSON.stringify(requestBody),
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
      this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new LlmRequestError(response.status, await readResponseText(response));
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("LLM response content is empty");
    }

    return parseModelJsonObject(content);
  }
}

class LlmRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`LLM request failed: ${status} ${responseText}`);
  }
}

class LlmTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
  }
}

function isResponseFormatUnsupportedError(error: unknown) {
  if (!(error instanceof LlmRequestError) || error.status !== 400) {
    return false;
  }

  const message = error.responseText.toLowerCase();

  return message.includes("response_format")
    && message.includes("json_object")
    && message.includes("not supported");
}

async function retryLlmRequest<T>(
  run: () => Promise<T>,
  config: OpenAiCompatibleProviderConfig["retry"],
) {
  const maxAttempts = config?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS;
  const baseDelayMs = config?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryableLlmError(error)) {
        throw error;
      }

      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function isRetryableLlmError(error: unknown) {
  if (error instanceof LlmRequestError) {
    return [429, 500, 502, 503, 504].includes(error.status);
  }

  return error instanceof TypeError || error instanceof LlmTimeoutError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new LlmTimeoutError(timeoutMs);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

async function readResponseText(response: Response) {
  const text = await response.text();

  return text.slice(0, 1_000);
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

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeAnalysisOutput(value: unknown): InsightAnalysisOutput {
  const record = isRecord(value) ? value : {};
  const summary = isRecord(record.summary) ? record.summary : {};
  const problem = isRecord(record.problemResolution) ? record.problemResolution : {};
  const problemEvidence = readEvidenceReferences(problem, "evidence");
  const problemEvidenceMessageIds = Array.from(
    new Set([
      ...problemEvidence.map((item) => item.messageId),
      ...readStringArray(problem, "evidenceMessageIds"),
    ]),
  );

  return {
    actionItems: readArray(record.actionItems).map((item) => ({
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
      evidence: problemEvidence,
      evidenceMessageIds: problemEvidenceMessageIds,
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

function buildPriorConclusions(output: InsightAnalysisOutput | undefined) {
  const fallback = emptyAnalysisOutput();
  const base = output ?? fallback;

  return {
    actionItems: base.actionItems,
    problemResolution: base.problemResolution,
    summary: base.summary,
  };
}

function emptyAnalysisOutput(): InsightAnalysisOutput {
  return normalizeAnalysisOutput({});
}

function readAnalysisWarnings(output: InsightAnalyzerOutput) {
  return output.analysisWarnings ?? [];
}

function formatAnalysisError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseModelJsonObject(content: string) {
  const trimmed = content.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = stripMarkdownFence(trimmed);

    if (unfenced !== trimmed) {
      return JSON.parse(unfenced);
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error("LLM response is not a JSON object");
  }
}

function stripMarkdownFence(value: string) {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value);

  return match?.[1]?.trim() ?? value;
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

function readEvidenceReferences(record: unknown, key: string) {
  if (!isRecord(record) || !Array.isArray(record[key])) {
    return [];
  }

  return record[key].filter(isRecord).map((item) => ({
    evidenceRole: readEvidenceRole(readString(item, "evidenceRole") || readString(item, "role")),
    messageId: readString(item, "messageId") || readString(item, "sourceMessageId"),
    reason: readOptionalString(item, "reason"),
  })).filter((item) => item.messageId);
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

function readEvidenceRole(value: string) {
  if (
    value === "customer_problem" ||
    value === "agent_solution" ||
    value === "closure_signal" ||
    value === "unresolved_signal" ||
    value === "primary"
  ) {
    return value;
  }

  return "primary";
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

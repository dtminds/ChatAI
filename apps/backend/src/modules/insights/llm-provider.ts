import { BadRequestError } from "../../shared/errors.js";
import type {
  InsightAnalyzerOutput,
  InsightAnalysisOutput,
  InsightLiveAnalysisGateDecision,
  InsightSessionAnalyzer,
} from "./insights-worker.js";
import {
  buildInsightClassificationPromptMessages,
  buildInsightLiveGatePromptMessages,
  buildInsightPromptMessages,
  buildInsightQaPromptMessages,
  buildInsightSummaryPromptMessages,
  type InsightPromptMessage,
} from "./insight-prompt-builder.js";
import {
  getWorkerErrorCode,
  safeErrorPayload,
  type InsightsWorkerObservability,
} from "./insights-worker-observability.js";

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
const liveGateChangeTypes = new Set<InsightLiveAnalysisGateDecision["changeType"]>([
  "business_changed",
  "first_live_snapshot",
  "material_update",
  "no_material_change",
  "risk_escalated",
]);

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

  constructor(
    private readonly config: OpenAiCompatibleProviderConfig,
    private readonly observability?: InsightsWorkerObservability,
  ) {}

  async analyzeSession(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalysisOutput> {
    return retryLlmRequest(
      () => this.doAnalyzeSessionWithResponseFormatFallback(input),
      this.config.retry,
      () => this.observability?.increment("analysis", "modelRetries"),
    );
  }

  async evaluateLiveAnalysisGate(
    input: Parameters<NonNullable<InsightSessionAnalyzer["evaluateLiveAnalysisGate"]>>[0],
  ): Promise<InsightLiveAnalysisGateDecision> {
    return retryLlmRequest(async () =>
      normalizeLiveAnalysisGateDecision(
        await this.completeJsonWithResponseFormatFallback({
          maxTokens: this.config.liteMaxTokens,
          messages: buildInsightLiveGatePromptMessages(input),
          model: this.config.liteModel,
          step: "live_gate",
          uid: input.job?.uid ?? 0,
        }),
      ),
      this.config.retry,
      () => this.observability?.increment("analysis", "modelRetries"),
    );
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
      this.reportResponseFormatFallback(input.job?.uid ?? 0);
      return this.doAnalyzeSession(input);
    }
  }

  private async doAnalyzeSession(
    input: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0],
  ): Promise<InsightAnalysisOutput> {
    const includeActionItems = shouldGenerateActionItems(input.job);
    const output = this.config.analysisMode !== "single"
      ? await this.doAnalyzeSessionInSteps(input)
      : await this.completeAnalysisStep({
          maxTokens: this.config.maxTokens,
          messages: buildInsightPromptMessages({
            context: input.context,
            existingActionItems: includeActionItems ? input.existingActionItems : undefined,
            includeActionItems,
            messages: input.messages,
            previousSessionContexts: input.previousSessionContexts,
          }),
          model: this.config.model,
          step: "single",
          uid: input.job?.uid ?? 0,
        });

    return stripFaqCandidates(output);
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
        uid: input.job?.uid ?? 0,
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
        uid: input.job?.uid ?? 0,
      });
    }

    const includeActionItems = shouldGenerateActionItems(input.job);
    const summary = await this.completeAnalysisStep({
      maxTokens: this.config.maxTokens,
      messages: buildInsightSummaryPromptMessages({
        context: input.context,
        existingActionItems: includeActionItems ? input.existingActionItems : undefined,
        includeActionItems,
        messages: input.messages,
        previousSessionContexts: input.previousSessionContexts,
      }),
      model: this.config.model,
      step: "summary",
      uid: input.job?.uid ?? 0,
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
          uid: input.job?.uid ?? 0,
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
        uid: input.job?.uid ?? 0,
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
    stepName: "classification" | "qaFindings",
    input: {
      maxTokens: number;
      messages: InsightPromptMessage[];
      model: string;
      uid: number;
    },
  ): Promise<InsightAnalyzerOutput> {
    const step = stepName === "qaFindings" ? "qa" : stepName;
    try {
      const output = await retryLlmRequest(
        () => this.completeAnalysisStep({
          ...input,
          step,
        }),
        this.config.retry,
        () => this.observability?.increment("analysis", "modelRetries"),
      );
      return output;
    } catch (error) {
      if (isResponseFormatUnsupportedError(error)) {
        throw error;
      }

      this.observability?.increment("analysis", "optionalStepFailures");
      this.observability?.event({
        errorCode: getWorkerErrorCode(error),
        eventCode: "insights_worker.llm_optional_step_failed",
        level: "warn",
        message: "会话洞察 Worker 可选分析步骤失败",
        payload: {
          model: input.model,
          step,
          ...safeErrorPayload(error),
        },
        pipeline: "analysis",
        throttleKey: "provider_optional_step",
        uid: input.uid,
      });
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
    step: LlmStep;
    uid: number;
  }) {
    return normalizeAnalysisOutput(await this.completeJson(input));
  }

  private async completeJsonWithResponseFormatFallback(input: {
    maxTokens: number;
    messages: InsightPromptMessage[];
    model: string;
    step: LlmStep;
    uid: number;
  }) {
    try {
      return await this.completeJson(input);
    } catch (error) {
      if (!this.config.responseFormat || this.responseFormatUnsupported || !isResponseFormatUnsupportedError(error)) {
        throw error;
      }

      this.responseFormatUnsupported = true;
      this.reportResponseFormatFallback(input.uid);
      return this.completeJson(input);
    }
  }

  private async completeJson(input: {
    maxTokens: number;
    messages: InsightPromptMessage[];
    model: string;
    step: LlmStep;
    uid: number;
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

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchWithTimeout(
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
    } catch (error) {
      const annotatedError = annotateLlmStep(error, input.step);
      this.reportRequestCompleted(input, startedAt, undefined, annotatedError);
      throw annotatedError;
    }

    if (!response.ok) {
      const error = annotateLlmStep(
        new LlmRequestError(
          response.status,
          await readResponseText(response),
        ),
        input.step,
      );
      this.reportRequestCompleted(input, startedAt, response.status, error);
      throw error;
    }

    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      const error = annotateLlmStep(
        new Error(
          "LLM_RESPONSE_CONTENT_EMPTY: LLM response content is empty",
        ),
        input.step,
      );
      this.reportRequestCompleted(input, startedAt, response.status, error);
      throw error;
    }

    try {
      const result = parseModelJsonObject(content);
      this.reportRequestCompleted(input, startedAt, response.status);
      return result;
    } catch (error) {
      const annotatedError = annotateLlmStep(error, input.step);
      this.reportRequestCompleted(
        input,
        startedAt,
        response.status,
        annotatedError,
      );
      throw annotatedError;
    }
  }

  private reportRequestCompleted(
    input: { model: string; step: LlmStep; uid: number },
    startedAt: number,
    httpStatus?: number,
    error?: unknown,
  ) {
    this.observability?.increment("analysis", "modelRequests");
    if (error) {
      this.observability?.increment("analysis", "modelFailures");
      if (error instanceof LlmTimeoutError) {
        this.observability?.increment("analysis", "modelTimeouts");
      }
    } else {
      this.observability?.recover("provider", "analysis", input.uid);
    }
    this.observability?.event({
      errorCode: error ? getWorkerErrorCode(error) : undefined,
      eventCode: "insights_worker.llm_request_completed",
      level: "debug",
      message: "会话洞察 Worker 模型请求完成",
      payload: {
        durationMs: Math.max(0, Date.now() - startedAt),
        httpStatus,
        model: input.model,
        outcome: error ? "failed" : "succeeded",
        step: input.step,
        ...(error ? safeErrorPayload(error) : {}),
      },
      pipeline: "analysis",
      uid: input.uid,
    });
  }

  private reportResponseFormatFallback(uid: number) {
    this.observability?.increment("analysis", "responseFormatFallbacks");
    this.observability?.event({
      errorCode: "LLM_RESPONSE_FORMAT_UNSUPPORTED",
      eventCode: "insights_worker.llm_response_format_fallback",
      level: "warn",
      message: "会话洞察 Worker 模型响应格式已降级",
      pipeline: "analysis",
      throttleKey: "provider_response_format",
      uid,
    });
  }
}

type LlmStep = "classification" | "live_gate" | "qa" | "single" | "summary";

function annotateLlmStep(error: unknown, failedStep: LlmStep) {
  if (error instanceof Error) {
    Object.assign(error, { failedStep });
  }
  return error;
}

class LlmRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`LLM request failed: ${status} ${responseText}`);
    this.name = "LlmRequestError";
  }
}

class LlmTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`);
    this.name = "LlmTimeoutError";
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
  onRetry?: () => void,
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

      onRetry?.();
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
      entityCode: readString(item, "entityCode"),
      entityName: readString(item, "entityName") || "未知实体",
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
      intentCode: readOptionalString(item, "intentCode"),
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
      ruleCode: readString(item, "ruleCode"),
      ruleName: readString(item, "ruleName"),
      severity: readSeverity(readString(item, "severity")),
    })),
    sentiment: readSingleSentiment(record.sentiment),
    summary: {
      sessionTitle: readString(summary, "sessionTitle"),
      text: readString(summary, "text"),
    },
    tags: readArray(record.tags).map((item) => ({
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      tagCode: readOptionalString(item, "tagCode"),
      tagName: readString(item, "tagName") || "自定义标签",
    })),
  };
}

function normalizeLiveAnalysisGateDecision(value: unknown): InsightLiveAnalysisGateDecision {
  const record = isRecord(value) ? value : {};
  const shouldAnalyze = record.shouldAnalyze === true;
  const reason = readString(record, "reason")
    || (shouldAnalyze ? "未完结会话出现值得提前更新的变化" : "未发现足以更新过程洞察的实质变化");
  const changeType = shouldAnalyze
    ? readLiveGateChangeType(readString(record, "changeType"))
    : "no_material_change";

  return {
    changeType,
    reason,
    shouldAnalyze,
  };
}

function readLiveGateChangeType(value: string): InsightLiveAnalysisGateDecision["changeType"] {
  return liveGateChangeTypes.has(value as InsightLiveAnalysisGateDecision["changeType"])
    ? value as InsightLiveAnalysisGateDecision["changeType"]
    : "material_update";
}

function buildPriorConclusions(output: InsightAnalysisOutput | undefined) {
  const fallback = emptyAnalysisOutput();
  const base = output ?? fallback;

  return {
    problemResolution: base.problemResolution,
    summary: base.summary,
  };
}

function shouldGenerateActionItems(job: Parameters<InsightSessionAnalyzer["analyzeSession"]>[0]["job"]) {
  return job == null || (job.mode === "final" && job.analysisScope === "all");
}

function stripFaqCandidates(output: InsightAnalyzerOutput): InsightAnalyzerOutput {
  return {
    ...output,
    faqCandidates: [],
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

function readSingleSentiment(value: unknown) {
  const item = Array.isArray(value)
    ? value.find(isRecord)
    : isRecord(value)
      ? value
      : undefined;

  return item
    ? [{
      confidence: readNumber(item, "confidence"),
      evidenceMessageIds: readStringArray(item, "evidenceMessageIds"),
      polarity: readPolarity(readString(item, "polarity")),
      reason: readString(item, "reason"),
    }]
    : [];
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

function readPolarity(value: string): InsightAnalysisOutput["sentiment"][number]["polarity"] {
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

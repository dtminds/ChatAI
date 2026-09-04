import { sql, type Kysely } from "kysely";
import type {
  WorkflowInferenceMessageListRequest,
  WorkflowInferenceMessageListResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type {
  WorkflowDatabase,
  WorkflowChatCompletionPort,
  WorkflowChatCompletionRequest,
} from "@chatai/workflow-runtime";

const VOLCENGINE_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_COMPLETION_TOKENS = 4096;

type ModelRow = { endpoint: string; model: string };
type ResolvedModelTarget = { endpoint: string; model?: string };
type ModelResolver = (modelId: string) => Promise<ModelRow | undefined>;
type ProviderDiagnosticsLogger = {
  info(value: unknown, message?: string): void;
};

export class VolcengineChatCompletionAdapter implements WorkflowChatCompletionPort {
  constructor(
    private readonly database: Kysely<WorkflowDatabase>,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly modelResolver?: ModelResolver,
    private readonly logger?: ProviderDiagnosticsLogger,
    private readonly playableMediaHost = process.env.PLAYABLE_MEDIA_HOST?.trim()
      || DEFAULT_PLAYABLE_MEDIA_HOST,
  ) {
    if (!apiKey.trim()) throw new Error("VOLCENGINE_ARK_API_KEY is required");
  }

  async execute(request: WorkflowChatCompletionRequest): Promise<WorkflowInferenceMessageListResult> {
    if (request.payload.kind !== "message-list") {
      throw terminal("WORKFLOW_INFERENCE_UNSUPPORTED_REQUEST", "当前推理节点不可执行");
    }
    const model = await this.resolveModel(request.payload);
    let response: Response;
    try {
      response = await this.fetchImpl(`${VOLCENGINE_ARK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createRequestBody(
          request.payload,
          model.endpoint,
          this.playableMediaHost,
        )),
        signal: request.signal,
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      throw new WorkflowCapabilityExecutionError(
        "unknown",
        "WORKFLOW_INFERENCE_NETWORK_ERROR",
        "模型服务暂不可用",
        { diagnosticMessage: error instanceof Error ? error.message.slice(0, 1024) : "network error" },
      );
    }

    const body = await readResponseBody(response, request.signal);
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new WorkflowCapabilityExecutionError(
        retryable ? "retryable" : "terminal",
        `WORKFLOW_INFERENCE_PROVIDER_${response.status}`,
        retryable ? "模型服务暂不可用" : "模型请求未被接受",
        { diagnosticMessage: `Provider returned HTTP ${response.status}` },
      );
    }

    let envelope: unknown;
    try { envelope = JSON.parse(body); } catch {
      throw terminal("WORKFLOW_INFERENCE_RESPONSE_INVALID", "模型返回结果异常");
    }
    const completion = readAssistantCompletion(envelope);
    if (completion === null) throw terminal("WORKFLOW_INFERENCE_RESPONSE_INVALID", "模型返回结果异常");
    if (completion.content.length === 0) {
      throw terminal("WORKFLOW_INFERENCE_RESPONSE_INVALID", "模型返回结果异常");
    }
    if (request.payload.responseFormat.type !== "json") {
      this.logProviderCompletion(model, completion);
      return { content: completion.content, type: "text" };
    }

    let value: unknown;
    try { value = JSON.parse(completion.content); } catch {
      throw terminal("WORKFLOW_INFERENCE_OUTPUT_INVALID", "模型返回结果异常");
    }
    if (!isRecord(value)) throw terminal("WORKFLOW_INFERENCE_OUTPUT_INVALID", "模型返回结果异常");
    const fields = request.payload.responseFormat.fields;
    const keys = Object.keys(value);
    if (keys.length !== fields.length || fields.some(field => !keys.includes(field.name))) {
      throw terminal("WORKFLOW_INFERENCE_OUTPUT_INVALID", "模型返回结果异常");
    }
    for (const field of fields) {
      if (typeof value[field.name] !== field.type) {
        throw terminal("WORKFLOW_INFERENCE_OUTPUT_INVALID", "模型返回结果异常");
      }
    }
    this.logProviderCompletion(model, completion);
    return { type: "json", value: value as Record<string, boolean | number | string> };
  }

  private logProviderCompletion(model: ResolvedModelTarget, completion: ProviderCompletion) {
    this.logger?.info({
      event: "workflow.inference.provider.completed",
      ...(completion.finishReason ? { finishReason: completion.finishReason } : {}),
      ...(completion.requestId ? { providerRequestId: completion.requestId } : {}),
      endpoint: model.endpoint,
      ...(model.model ? { model: model.model } : {}),
      ...(completion.usage ? { usage: completion.usage } : {}),
    }, "workflow inference provider completed");
  }

  private async resolveModel(payload: WorkflowInferenceMessageListRequest) {
    if (payload.modelTarget.kind === "endpoint") {
      return { endpoint: payload.modelTarget.endpointId };
    }
    const modelId = Number(payload.modelTarget.modelId);
    if (!Number.isSafeInteger(modelId) || modelId <= 0) {
      throw terminal("WORKFLOW_INFERENCE_MODEL_INVALID", "模型配置不可用");
    }
    if (this.modelResolver) {
      const model = await this.modelResolver(String(modelId));
      if (!model?.endpoint?.trim() || !model.model?.trim()) {
        throw terminal("WORKFLOW_INFERENCE_MODEL_INVALID", "模型配置不可用");
      }
      return model;
    }
    const result = await sql<ModelRow>`
      SELECT endpoint, model FROM xy_wap_embed_ai_model
      WHERE id = ${modelId} AND uid = 0 AND status = 1 LIMIT 1
    `.execute(this.database);
    const model = result.rows[0];
    if (!model?.endpoint?.trim() || !model.model?.trim()) {
      throw terminal("WORKFLOW_INFERENCE_MODEL_INVALID", "模型配置不可用");
    }
    return model;
  }
}

export function createVolcengineChatCompletionAdapter(
  database: Kysely<WorkflowDatabase>,
  env: NodeJS.ProcessEnv = process.env,
  logger?: ProviderDiagnosticsLogger,
) {
  const apiKey = env.VOLCENGINE_ARK_API_KEY?.trim();
  if (!apiKey) throw new Error("VOLCENGINE_ARK_API_KEY is required for Workflow inference");
  return new VolcengineChatCompletionAdapter(
    database,
    apiKey,
    fetch,
    undefined,
    logger,
    env.PLAYABLE_MEDIA_HOST?.trim() || DEFAULT_PLAYABLE_MEDIA_HOST,
  );
}

function createRequestBody(
  payload: WorkflowInferenceMessageListRequest,
  endpoint: string,
  playableMediaHost: string,
) {
  const body: Record<string, unknown> = {
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    messages: payload.messageList.map(message => ({
      ...message,
      content: message.content.map(part => {
        if (part.type === "text") return part;
        if (part.type === "video") return { text: "[视频]", type: "text" };
        const url = resolveProviderMediaUrl(part.url, playableMediaHost);
        return { image_url: { url }, type: "image_url" };
      }),
    })),
    model: endpoint,
    reasoning_effort: payload.reasoningEffort,
    thinking: { type: payload.reasoningEffort === "minimal" ? "disabled" : "enabled" },
  };
  if (payload.responseFormat.type === "json") {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "workflow_output",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: Object.fromEntries(payload.responseFormat.fields.map(field => [field.name, {
            type: field.type,
            description: field.description,
          }])),
          required: payload.responseFormat.fields.map(field => field.name),
        },
      },
    };
  }
  return body;
}

function resolveProviderMediaUrl(value: string, playableMediaHost: string) {
  const url = value.trim();
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    // Platform media paths are resolved just before the Provider call.
  }
  if (parsed) {
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
    throw terminal("WORKFLOW_INFERENCE_INPUT_INVALID", "执行所需数据不可用，流程已停止");
  }
  const host = playableMediaHost.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!url || !host) {
    throw terminal("WORKFLOW_INFERENCE_INPUT_INVALID", "执行所需数据不可用，流程已停止");
  }
  return `https://${host}/${url.replace(/^\/+/, "")}`;
}

async function readResponseBody(response: Response, signal: AbortSignal) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw terminal("WORKFLOW_INFERENCE_RESPONSE_TOO_LARGE", "模型返回结果过大");
  }
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw terminal("WORKFLOW_INFERENCE_RESPONSE_TOO_LARGE", "模型返回结果过大");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("aborted");
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw terminal("WORKFLOW_INFERENCE_RESPONSE_TOO_LARGE", "模型返回结果过大");
      }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

type ProviderCompletion = {
  content: string;
  finishReason?: string;
  requestId?: string;
  usage?: Record<string, number>;
};

function readAssistantCompletion(value: unknown): ProviderCompletion | null {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) return null;
  const choice = value.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") return null;
  return {
    content: choice.message.content,
    finishReason: typeof choice.finish_reason === "string"
      ? choice.finish_reason.slice(0, 64)
      : undefined,
    requestId: typeof value.id === "string" ? value.id.slice(0, 128) : undefined,
    usage: readUsage(value.usage),
  };
}

function readUsage(value: unknown) {
  if (!isRecord(value)) return undefined;
  const usage: Record<string, number> = {};
  for (const key of [
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "cached_tokens",
    "reasoning_tokens",
  ]) {
    const tokenCount = value[key];
    if (typeof tokenCount === "number" && Number.isSafeInteger(tokenCount) && tokenCount >= 0) {
      usage[key] = tokenCount;
    }
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function terminal(code: string, message: string) {
  return new WorkflowCapabilityExecutionError("terminal", code, message);
}

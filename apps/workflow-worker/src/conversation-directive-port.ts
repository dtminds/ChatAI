import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import {
  type WorkflowConversationDirectivePort,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

const JAVA_ADD_DIRECTIVE_PATH = "/third-internal/wap-embed-agent-directive/add";
const JAVA_DISABLE_DIRECTIVE_PATH = "/third-internal/wap-embed-agent-directive/disable";

export class HttpWorkflowConversationDirectivePort implements WorkflowConversationDirectivePort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async activate(input: Parameters<WorkflowConversationDirectivePort["activate"]>[0]) {
    const data = await this.post(JAVA_ADD_DIRECTIVE_PATH, {
      bizId: input.bizId,
      bizInfo: input.bizInfo,
      conversationId: input.conversationId,
      expiresAt: formatUtc8LocalDateTime(input.expiresAt),
      limitRound: input.limitRound,
      payload: input.payload,
      priority: input.priority,
      type: input.type,
      uid: input.uid,
    }, input.signal);
    const directiveId = typeof data === "number" || typeof data === "string" ? Number(data) : NaN;
    if (!Number.isSafeInteger(directiveId) || directiveId < 0) {
      throw terminal("WORKFLOW_AI_COLLECT_DIRECTIVE_RESPONSE_INVALID", "Directive add response data is invalid");
    }
  }

  async disable(input: Parameters<WorkflowConversationDirectivePort["disable"]>[0]) {
    const data = await this.post(JAVA_DISABLE_DIRECTIVE_PATH, {
      bizId: input.bizId,
      reason: input.reason,
      type: input.type,
      uid: input.uid,
    }, input.signal);
    if (data !== true) {
      throw terminal(
        "WORKFLOW_AI_COLLECT_DIRECTIVE_RESPONSE_INVALID",
        "Directive disable response data is invalid",
      );
    }
  }

  private async post(path: string, payload: Record<string, unknown>, signal: AbortSignal) {
    let response: Response;
    try {
      response = await this.fetch(new URL(path, `${this.options.baseUrl}/`), {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        method: "POST",
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new WorkflowCapabilityExecutionError(
          "unknown",
          "WORKFLOW_AI_COLLECT_DIRECTIVE_ABORTED",
          "智能体辅助操作已中断",
        );
      }
      throw retryable(
        "WORKFLOW_AI_COLLECT_DIRECTIVE_UNAVAILABLE",
        error instanceof Error ? error.name : "Directive request failed",
      );
    }
    if (!response.ok) {
      const retryableStatus = response.status === 429 || response.status >= 500;
      throw new WorkflowCapabilityExecutionError(
        retryableStatus ? "retryable" : "terminal",
        `WORKFLOW_AI_COLLECT_DIRECTIVE_${response.status}`,
        retryableStatus ? "智能体辅助服务暂不可用" : "智能体辅助请求未被接受",
        { diagnosticMessage: `Directive endpoint returned HTTP ${response.status}` },
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw terminal(
        "WORKFLOW_AI_COLLECT_DIRECTIVE_RESPONSE_INVALID",
        "Directive endpoint returned invalid JSON",
      );
    }
    const envelope = decodeJavaInternalApiEnvelope(body);
    if (envelope.kind === "invalid") {
      throw terminal(
        "WORKFLOW_AI_COLLECT_DIRECTIVE_RESPONSE_INVALID",
        `Directive endpoint returned an invalid envelope: ${envelope.reason}`,
      );
    }
    if (envelope.kind === "rejected") {
      throw terminal(
        "WORKFLOW_AI_COLLECT_DIRECTIVE_REJECTED",
        `Directive endpoint rejected the request: ${envelope.error} ${envelope.errorMsg.trim()}`.trim(),
      );
    }
    return envelope.payload.data;
  }
}

export function formatUtc8LocalDateTime(value: Date) {
  const utc8 = new Date(value.getTime() + 8 * 3_600_000);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())} ${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`;
}

function terminal(code: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    "智能体辅助返回异常，流程已停止",
    { diagnosticMessage },
  );
}

function retryable(code: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "retryable",
    code,
    "智能体辅助服务暂不可用",
    { diagnosticMessage },
  );
}

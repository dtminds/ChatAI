import { decodeJavaInternalApiEnvelope } from "@chatai/contracts";
import {
  type WorkflowMarketingMessagePort,
  type WorkflowMarketingMessagePushInput,
  type WorkflowMarketingMessageQueryInput,
} from "@chatai/workflow-runtime";
import {
  createAbortGuard,
  isRecord,
  terminalError,
} from "./capability-port-support.js";

export const JAVA_MARKETING_MESSAGE_PUSH_PATH = "/third-internal/cdp-market-plan/push-user";
export const JAVA_MARKETING_MESSAGE_QUERY_PATH = "/third-internal/cdp-market-plan/get-push-user-result";

const throwIfAborted = createAbortGuard(
  "WORKFLOW_MARKETING_MESSAGE_ABORTED",
  "群发触达失败",
  "Workflow Marketing Message request was aborted",
);

export class HttpWorkflowMarketingMessagePort implements WorkflowMarketingMessagePort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async pushUser(input: WorkflowMarketingMessagePushInput): Promise<void> {
    requirePositiveSafeIntegers({
      bizId: input.bizId,
      externalUserId: input.externalUserId,
      planId: input.planId,
      uid: input.uid,
      workUserId: input.workUserId,
    });
    if (!input.idempotencyKey) {
      throw terminalError(
        "WORKFLOW_MARKETING_MESSAGE_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Marketing Message push request requires an idempotency key",
      );
    }
    const body = await this.post(JAVA_MARKETING_MESSAGE_PUSH_PATH, {
      bizId: input.bizId,
      externalUserId: input.externalUserId,
      planId: input.planId,
      uid: input.uid,
      workUserId: input.workUserId,
    }, input.signal, "push", input.idempotencyKey);
    requireSuccessfulEnvelope(body, "push");
  }

  async queryPushResult(
    input: WorkflowMarketingMessageQueryInput,
  ): Promise<{ pushSuccess: boolean }> {
    requirePositiveSafeIntegers({ bizId: input.bizId, planId: input.planId, uid: input.uid });
    const body = await this.post(JAVA_MARKETING_MESSAGE_QUERY_PATH, {
      bizId: input.bizId,
      planId: input.planId,
      uid: input.uid,
    }, input.signal, "query");
    const payload = requireSuccessfulEnvelope(body, "query");
    if (!isRecord(payload.data)) {
      throw invalidResponse("Marketing Message query response is missing data");
    }
    return { pushSuccess: payload.data.status === 1 };
  }

  private async post(
    path: string,
    body: Record<string, number>,
    signal: AbortSignal,
    operation: "push" | "query",
    idempotencyKey?: string,
  ) {
    throwIfAborted(signal);
    const endpoint = new URL(path, `${this.options.baseUrl}/`);
    if (idempotencyKey) endpoint.searchParams.set("idempotentKey", idempotencyKey);
    let response: Response;
    try {
      response = await this.fetch(endpoint, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        method: "POST",
        signal,
      });
    } catch (error) {
      if (signal.aborted) throwIfAborted(signal);
      throw terminalError(
        "WORKFLOW_MARKETING_MESSAGE_REQUEST_FAILED",
        "群发触达失败，流程已停止",
        `Marketing Message ${operation} request failed: ${error instanceof Error ? error.name : "unknown"}`,
      );
    }
    if (response.status !== 200) {
      throw terminalError(
        "WORKFLOW_MARKETING_MESSAGE_UNAVAILABLE",
        "群发触达失败，流程已停止",
        `Marketing Message ${operation} endpoint returned HTTP ${response.status}`,
      );
    }
    try {
      return await response.json() as unknown;
    } catch {
      throw invalidResponse(`Marketing Message ${operation} endpoint returned invalid JSON`);
    }
  }
}

function requireSuccessfulEnvelope(body: unknown, operation: "push" | "query") {
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw invalidResponse(`Marketing Message ${operation} endpoint returned an invalid envelope: ${envelope.reason}`);
  }
  if (envelope.kind === "rejected") {
    const reason = envelope.errorMsg.trim();
    throw terminalError(
      "WORKFLOW_MARKETING_MESSAGE_REJECTED",
      reason ? `群发触达失败：${reason}` : "群发触达失败，流程已停止",
      `Marketing Message ${operation} endpoint rejected the request: ${envelope.error} ${reason}`.trim(),
    );
  }
  return envelope.payload;
}

function invalidResponse(diagnosticMessage: string) {
  return terminalError(
    "WORKFLOW_MARKETING_MESSAGE_RESPONSE_INVALID",
    "返回结果异常，流程已停止",
    diagnosticMessage,
  );
}

function requirePositiveSafeIntegers(values: Record<string, number>) {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw terminalError(
        "WORKFLOW_MARKETING_MESSAGE_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        `Marketing Message request field ${name} must be a positive safe integer`,
      );
    }
  }
}

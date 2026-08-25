import {
  WorkflowPointsTransferCommandSchema,
  type WorkflowPointsTransferCommand,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const JAVA_POINTS_TRANSFER_PATH = "/third-internal/mall-order/transfer-order-point";

export class HttpWorkflowPointsTransferCapabilityPort implements WorkflowCapabilityPort {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: {
    baseUrl: string;
    fetch?: typeof fetch;
    token?: string | null;
  }) {
    this.fetch = options.fetch ?? fetch;
  }

  async execute<
    TCommandSchema extends TSchema,
    TResultSchema extends TSchema,
    TKind extends WorkflowCapabilityKind,
  >(
    definition: WorkflowCapabilityDefinition<TCommandSchema, TResultSchema, TKind>,
    request: WorkflowCapabilityRequest<Static<TCommandSchema>, TKind>,
  ): Promise<unknown> {
    if (
      definition.capabilityKey
        !== WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING.definition.capabilityKey
      || definition.contractVersion
        !== WORKFLOW_POINTS_TRANSFER_CAPABILITY_BINDING.definition.contractVersion
      || definition.kind !== "action"
    ) {
      throw terminalError(
        "WORKFLOW_CAPABILITY_UNSUPPORTED",
        "执行服务暂不可用，流程已停止",
        `Workflow Points Transfer port received unsupported capability ${definition.capabilityKey}@${definition.contractVersion}`,
      );
    }
    const mallUserId = request.identities.mallUserId;
    if (
      !Value.Check(WorkflowPointsTransferCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || mallUserId === undefined
      || !Number.isSafeInteger(mallUserId)
      || mallUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_POINTS_TRANSFER_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Points Transfer port received an invalid command, prepared identity, or idempotency key",
      );
    }

    return executeWorkflowPointsTransfer({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowPointsTransferCommand,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      mallUserId,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowPointsTransfer(input: {
  baseUrl: string;
  command: WorkflowPointsTransferCommand;
  fetch: typeof fetch;
  idempotencyKey: string;
  mallUserId: number;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}) {
  throwIfAborted(input.signal);
  const endpoint = new URL(JAVA_POINTS_TRANSFER_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        mallUserId: input.mallUserId,
        orderNumber: input.command.orderNumber,
        uid: input.uid,
      }),
      headers: {
        "content-type": "application/json",
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
      },
      method: "POST",
      signal: input.signal,
    });
  } catch (error) {
    if (input.signal.aborted) throwIfAborted(input.signal);
    throw retryableError(
      "WORKFLOW_POINTS_TRANSFER_FAILED",
      "转积分暂时失败",
      `Workflow Points Transfer Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_POINTS_TRANSFER_UNAVAILABLE",
      "转积分暂时失败",
      `Workflow Points Transfer Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_POINTS_TRANSFER_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Points Transfer Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body) || typeof body.error !== "number" || !Number.isSafeInteger(body.error)) {
    throw terminalError(
      "WORKFLOW_POINTS_TRANSFER_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Points Transfer Java endpoint returned an invalid envelope",
    );
  }
  return {
    result: body.error === 0,
  };
}

function throwIfAborted(signal: AbortSignal): never | void {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw retryableError(
    "WORKFLOW_POINTS_TRANSFER_ABORTED",
    "转积分暂时失败",
    "Workflow Points Transfer execution was aborted",
  );
}

function terminalError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    code,
    message,
    { diagnosticMessage },
  );
}

function retryableError(code: string, message: string, diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "retryable",
    code,
    message,
    { diagnosticMessage },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import {
  WorkflowOrderConversionCommandSchema,
  type WorkflowOrderConversionCommand,
} from "@chatai/contracts";
import {
  WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "@chatai/workflow-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  assertCapabilityDefinition,
  createAbortGuard,
  isRecord,
  retryableError,
  terminalError,
} from "./capability-port-support.js";

const JAVA_ORDER_CONVERSION_PATH = "/third-internal/mall-order/transfer-order-point";
const throwIfAborted = createAbortGuard(
  "WORKFLOW_ORDER_CONVERSION_ABORTED",
  "转积分暂时失败",
  "Workflow Order Conversion execution was aborted",
);

export class HttpWorkflowOrderConversionCapabilityPort implements WorkflowCapabilityPort {
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
    assertCapabilityDefinition(
      definition,
      WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING.definition,
      "Workflow Order Conversion",
    );
    const mallUserId = request.identities.mallUserId;
    if (
      !Value.Check(WorkflowOrderConversionCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || mallUserId === undefined
      || !Number.isSafeInteger(mallUserId)
      || mallUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_ORDER_CONVERSION_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Order Conversion port received an invalid command, prepared identity, or idempotency key",
      );
    }

    return executeWorkflowOrderConversion({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowOrderConversionCommand,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      mallUserId,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowOrderConversion(input: {
  baseUrl: string;
  command: WorkflowOrderConversionCommand;
  fetch: typeof fetch;
  idempotencyKey: string;
  mallUserId: number;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}) {
  throwIfAborted(input.signal);
  const endpoint = new URL(JAVA_ORDER_CONVERSION_PATH, `${input.baseUrl}/`);
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
      "WORKFLOW_ORDER_CONVERSION_FAILED",
      "转积分暂时失败",
      `Workflow Order Conversion Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_ORDER_CONVERSION_UNAVAILABLE",
      "转积分暂时失败",
      `Workflow Order Conversion Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_ORDER_CONVERSION_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Order Conversion Java endpoint returned invalid JSON",
    );
  }
  if (!isRecord(body) || typeof body.error !== "number" || !Number.isSafeInteger(body.error)) {
    throw terminalError(
      "WORKFLOW_ORDER_CONVERSION_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Order Conversion Java endpoint returned an invalid envelope",
    );
  }
  return {
    result: body.error === 0,
  };
}

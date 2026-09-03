import {
  decodeJavaInternalApiEnvelope,
  WorkflowOrderBindCommandSchema,
  type WorkflowOrderBindCommand,
} from "@chatai/contracts";
import {
  WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
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
  retryableError,
  terminalError,
} from "./capability-port-support.js";

const JAVA_ORDER_BIND_PATH = "/third-internal/one-id/order-bind";
const JAVA_ORDER_BIND_SOURCE = 28;
const throwIfAborted = createAbortGuard(
  "WORKFLOW_ORDER_BIND_ABORTED",
  "关联订单暂时失败",
  "Workflow Order Bind execution was aborted",
);

export class HttpWorkflowOrderBindCapabilityPort implements WorkflowCapabilityPort {
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
      WORKFLOW_ORDER_BIND_CAPABILITY_BINDING.definition,
      "Workflow Order Bind",
    );
    const externalUserId = request.identities.externalUserId;
    if (
      !Value.Check(WorkflowOrderBindCommandSchema, request.command)
      || !("idempotencyKey" in request)
      || typeof request.idempotencyKey !== "string"
      || !request.idempotencyKey
      || externalUserId === undefined
      || !Number.isSafeInteger(externalUserId)
      || externalUserId <= 0
    ) {
      throw terminalError(
        "WORKFLOW_ORDER_BIND_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Order Bind port received an invalid command, prepared identity, or idempotency key",
      );
    }

    return executeWorkflowOrderBind({
      baseUrl: this.options.baseUrl,
      command: structuredClone(request.command) as WorkflowOrderBindCommand,
      externalUserId,
      fetch: this.fetch,
      idempotencyKey: request.idempotencyKey,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
    });
  }
}

export async function executeWorkflowOrderBind(input: {
  baseUrl: string;
  command: WorkflowOrderBindCommand;
  externalUserId: number;
  fetch: typeof fetch;
  idempotencyKey: string;
  signal: AbortSignal;
  token: string | null;
  uid: number;
}) {
  throwIfAborted(input.signal);
  const endpoint = new URL(JAVA_ORDER_BIND_PATH, `${input.baseUrl}/`);
  endpoint.searchParams.set("idempotentKey", input.idempotencyKey);
  let response: Response;
  try {
    response = await input.fetch(endpoint, {
      body: JSON.stringify({
        existAcctSkip: true,
        externalUserId: input.externalUserId,
        orderBind: true,
        source: JAVA_ORDER_BIND_SOURCE,
        tradeNo: input.command.orderNumber,
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
      "WORKFLOW_ORDER_BIND_FAILED",
      "关联订单暂时失败",
      `Workflow Order Bind Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }

  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_ORDER_BIND_UNAVAILABLE",
      "关联订单暂时失败",
      `Workflow Order Bind Java endpoint returned HTTP ${response.status}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw terminalError(
      "WORKFLOW_ORDER_BIND_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      "Workflow Order Bind Java endpoint returned invalid JSON",
    );
  }
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw terminalError(
      "WORKFLOW_ORDER_BIND_RESPONSE_INVALID",
      "返回结果异常，流程已停止",
      `Workflow Order Bind Java endpoint returned an invalid envelope: ${envelope.reason}`,
    );
  }
  return { result: envelope.kind === "success" };
}

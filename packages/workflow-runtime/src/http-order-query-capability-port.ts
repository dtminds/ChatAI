import {
  decodeJavaInternalApiEnvelope,
  WorkflowOrderQueryCommandSchema,
  WorkflowOrderQueryResultSchema,
  type WorkflowOrderQueryCommand,
  type WorkflowOrderQueryResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  type WorkflowCapabilityDefinition,
  type WorkflowCapabilityKind,
  type WorkflowCapabilityPort,
  type WorkflowCapabilityRequest,
} from "./capability-port.js";
import { WORKFLOW_ORDER_QUERY_CAPABILITY_BINDING } from "./order-query.js";

const JAVA_ORDER_QUERY_PATH = "/third-internal/cdp-order/statistics-order";
const throwIfAborted = createAbortGuard(
  "WORKFLOW_ORDER_QUERY_ABORTED",
  "订单查询暂时失败",
  "Workflow Order Query execution was aborted",
);

export class HttpWorkflowOrderQueryCapabilityPort implements WorkflowCapabilityPort {
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
      WORKFLOW_ORDER_QUERY_CAPABILITY_BINDING.definition,
      "Workflow Order Query",
    );
    const command = request.command;
    const xyId = request.identities.xyId;
    if (!Value.Check(WorkflowOrderQueryCommandSchema, command)
      || "idempotencyKey" in request
      || (command.mode === "conditions"
        && (xyId === undefined || !Number.isSafeInteger(xyId) || xyId <= 0))) {
      throw terminalError(
        "WORKFLOW_ORDER_QUERY_REQUEST_INVALID",
        "执行所需数据不可用，流程已停止",
        "Workflow Order Query port received an invalid command or prepared identity",
      );
    }
    return executeWorkflowOrderQuery({
      baseUrl: this.options.baseUrl,
      command: structuredClone(command) as WorkflowOrderQueryCommand,
      fetch: this.fetch,
      signal: request.signal,
      token: this.options.token ?? null,
      uid: request.uid,
      xyId,
    });
  }
}

export async function executeWorkflowOrderQuery(input: {
  baseUrl: string;
  command: WorkflowOrderQueryCommand;
  fetch: typeof fetch;
  signal: AbortSignal;
  token: string | null;
  uid: number;
  xyId?: number;
}): Promise<WorkflowOrderQueryResult> {
  throwIfAborted(input.signal);
  let response: Response;
  try {
    response = await input.fetch(new URL(JAVA_ORDER_QUERY_PATH, `${input.baseUrl}/`), {
      body: JSON.stringify({
        orderType: [0, 1],
        uid: input.uid,
        ...(input.command.mode === "order-number"
          ? { orderNo: input.command.orderNumber }
          : {
              goodsName: input.command.goodsName,
              orderStatus: input.command.orderStatus,
              platform: input.command.platformId,
              ...(input.command.shopIds.length > 0
                ? { shopIdList: input.command.shopIds }
                : {}),
              // Java applies inclusive bounds before aggregating all matches. An absent
              // range is unrestricted; null leaves that side unfiltered (zero is a bound).
              ...(input.command.amount.min !== undefined || input.command.amount.max !== undefined
                ? { priceRange: [
                    input.command.amount.min === undefined ? null : String(input.command.amount.min),
                    input.command.amount.max === undefined ? null : String(input.command.amount.max),
                  ] }
                : {}),
              xyId: input.xyId,
              [getJavaTimeRangeField(input.command.timeField)]: input.command.timeRange,
            }),
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
      "WORKFLOW_ORDER_QUERY_FAILED",
      "订单查询暂时失败",
      `Workflow Order Query Java request failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  }
  if (response.status !== 200) {
    throw retryableError(
      "WORKFLOW_ORDER_QUERY_UNAVAILABLE",
      "订单查询暂时失败",
      `Workflow Order Query Java endpoint returned HTTP ${response.status}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw invalidResponse("Workflow Order Query Java endpoint returned invalid JSON");
  }
  const envelope = decodeJavaInternalApiEnvelope(body);
  if (envelope.kind === "invalid") {
    throw invalidResponse(`Workflow Order Query Java endpoint returned an invalid envelope: ${envelope.reason}`);
  }
  if (envelope.kind === "rejected") {
    throw terminalError(
      "WORKFLOW_ORDER_QUERY_REJECTED",
      "订单查询失败，流程已停止",
      `Workflow Order Query Java endpoint rejected the request: ${envelope.error} ${envelope.errorMsg.trim()}`.trim(),
    );
  }
  const data = envelope.payload.data;
  if (!isRecord(data)
    || typeof data.netTransactionAmount !== "number"
    || !Number.isFinite(data.netTransactionAmount)) {
    throw invalidResponse("Workflow Order Query Java endpoint returned invalid statistics");
  }
  const result = {
    // Java owns the net-amount calculation; only normalize negative results as agreed.
    netAmount: Math.max(0, data.netTransactionAmount),
    orderCount: data.orderCount,
    totalAmount: data.orderAmount,
  };
  if (!Value.Check(WorkflowOrderQueryResultSchema, result)) {
    throw invalidResponse("Workflow Order Query Java endpoint returned invalid statistics");
  }
  return result;
}

function getJavaTimeRangeField(
  field: Extract<WorkflowOrderQueryCommand, { mode: "conditions" }>["timeField"],
) {
  if (field === "pay-time") return "payTimes";
  if (field === "finish-time") return "finishTime";
  return "orderTimes";
}

function assertCapabilityDefinition(
  actual: { capabilityKey: string; contractVersion: number; kind: string },
  expected: { capabilityKey: string; contractVersion: number; kind: string },
  portName: string,
) {
  if (actual.capabilityKey === expected.capabilityKey
    && actual.contractVersion === expected.contractVersion
    && actual.kind === expected.kind) return;
  throw terminalError(
    "WORKFLOW_CAPABILITY_UNSUPPORTED",
    "执行服务暂不可用，流程已停止",
    `${portName} port received unsupported capability ${actual.capabilityKey}@${actual.contractVersion}`,
  );
}

function createAbortGuard(code: string, message: string, diagnosticMessage: string) {
  return (signal: AbortSignal): never | void => {
    if (!signal.aborted) return;
    if (signal.reason instanceof Error) throw signal.reason;
    throw retryableError(code, message, diagnosticMessage);
  };
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

function invalidResponse(diagnosticMessage: string) {
  return terminalError(
    "WORKFLOW_ORDER_QUERY_RESPONSE_INVALID",
    "返回结果异常，流程已停止",
    diagnosticMessage,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

import {
  decodeJavaInternalApiEnvelope,
  WORKFLOW_ORDER_QUERY_PAGE_SIZE,
  WorkflowOrderQueryCommandSchema,
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

const JAVA_ORDER_QUERY_PATH = "/third-internal/cdp-order/search-order";
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
  const aggregate = {
    matchedOrderCount: 0,
    netAmountCents: 0,
    totalAmountCents: 0,
  };
  const orders = await fetchFirstOrderPage(input);
  for (const order of orders) aggregateOrder(input.command, order, aggregate);

  return {
    netAmount: aggregate.netAmountCents / 100,
    orderCount: aggregate.matchedOrderCount,
    totalAmount: aggregate.totalAmountCents / 100,
  };
}

function aggregateOrder(
  command: WorkflowOrderQueryCommand,
  order: Record<string, unknown>,
  aggregate: {
    matchedOrderCount: number;
    netAmountCents: number;
    totalAmountCents: number;
  },
) {
  const actuPayment = readMoney(order.actuPayment, "actuPayment");
  if (command.mode === "conditions" && !matchesAmount(actuPayment, command.amount)) return;

  aggregate.matchedOrderCount += 1;
  aggregate.totalAmountCents = addSafeCents(
    aggregate.totalAmountCents,
    toCents(actuPayment),
  );
  let refundCents = 0;
  // Java may omit subOrders for orders without item/refund details. The aggregate only
  // depends on refund fields when they are present, so an omitted or malformed collection
  // must not turn an otherwise usable order response into a terminal failure.
  const subOrders = Array.isArray(order.subOrders) ? order.subOrders : [];
  for (const item of subOrders) {
    if (!isRecord(item)) continue;
    if (typeof item.subRefundFinishTime === "string" && item.subRefundFinishTime.trim()
      && typeof item.subRefundAmount === "number"
      && Number.isFinite(item.subRefundAmount) && item.subRefundAmount >= 0) {
      refundCents = addSafeCents(
        refundCents, toCents(item.subRefundAmount),
      );
    }
  }
  aggregate.netAmountCents = addSafeCents(
    aggregate.netAmountCents,
    Math.max(0, toCents(actuPayment) - refundCents),
  );
}

async function fetchFirstOrderPage(input: {
  baseUrl: string;
  command: WorkflowOrderQueryCommand;
  fetch: typeof fetch;
  signal: AbortSignal;
  token: string | null;
  uid: number;
  xyId?: number;
}) {
  throwIfAborted(input.signal);
  let response: Response;
  try {
    response = await input.fetch(new URL(JAVA_ORDER_QUERY_PATH, `${input.baseUrl}/`), {
      body: JSON.stringify({
        orderType: [0, 1],
        pageNum: 1,
        pageSize: WORKFLOW_ORDER_QUERY_PAGE_SIZE,
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
              tradeTimeAsc: true,
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
  const list = envelope.payload.list;
  // Only the first page is intentionally used by the product. Java's count/page metadata
  // is informational here; success plus a list is sufficient for this bounded calculation.
  if (!Array.isArray(list)) throw invalidResponse("Workflow Order Query Java endpoint returned an invalid list");
  return list.map((item) => {
    if (!isRecord(item)) throw invalidResponse("Workflow Order Query page contains a non-object order");
    return item;
  });
}

function getJavaTimeRangeField(
  field: Extract<WorkflowOrderQueryCommand, { mode: "conditions" }>["timeField"],
) {
  if (field === "pay-time") return "payTimes";
  if (field === "finish-time") return "finishTime";
  return "orderTimes";
}

function matchesAmount(
  value: number,
  amount: Extract<WorkflowOrderQueryCommand, { mode: "conditions" }>["amount"],
) {
  if (amount.min !== undefined && value < amount.min) return false;
  if (amount.max !== undefined && value > amount.max) return false;
  return true;
}

function readMoney(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidResponse(`Order Query result has invalid ${field}`);
  }
  return value;
}

function toCents(value: number) {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw invalidResponse("Order Query money exceeds safe range");
  return cents;
}

function addSafeCents(left: number, right: number) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw invalidResponse("Order Query aggregate exceeds safe range");
  return result;
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

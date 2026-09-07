import { describe, expect, it, vi } from "vitest";
import { executeWorkflowOrderQuery } from "../src/order-query-capability-port.js";

describe("Workflow Order Query Java port", () => {
  it("requests all matching statistics once and maps authoritative amounts", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => javaResponse({
      data: { netTransactionAmount: 9876.54, orderAmount: 12345.67, orderCount: 250 },
      success: true,
    }));
    await expect(executeWorkflowOrderQuery({
      ...orderNumberInput(fetchMock),
      command: {
        amount: { max: 110.99, min: 10.01 }, goodsName: "T恤", mode: "conditions",
        orderStatus: 0, platformId: 2, shopIds: [11], timeField: "pay-time",
        timeRange: ["2026-08-28 00:00:00", "2026-09-04 23:59:59"],
      },
      token: "token", xyId: 303,
    })).resolves.toEqual({ netAmount: 9876.54, orderCount: 250, totalAmount: 12345.67 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://java.example.com/third-internal/cdp-order/statistics-order");
    expect(init).toMatchObject({ method: "POST", headers: { authorization: "Bearer token" } });
    expect(JSON.parse(String(init?.body))).toEqual({
      goodsName: "T恤", orderStatus: 0, orderType: [0, 1],
      payTimes: ["2026-08-28 00:00:00", "2026-09-04 23:59:59"],
      platform: 2, priceRange: ["10.01", "110.99"], shopIdList: [11], uid: 9, xyId: 303,
    });
  });

  it.each([
    { amount: {}, priceRange: undefined },
    { amount: { min: 12.34 }, priceRange: ["12.34", null] },
    { amount: { max: 56.78 }, priceRange: [null, "56.78"] },
    { amount: { min: 0 }, priceRange: ["0", null] },
    { amount: { max: 0 }, priceRange: [null, "0"] },
  ])("encodes optional inclusive price bounds: $amount", async ({ amount, priceRange }) => {
    const fetchMock = vi.fn<typeof fetch>(async () => javaResponse(zeroStatistics()));
    await executeWorkflowOrderQuery({
      ...orderNumberInput(fetchMock),
      command: {
        amount, mode: "conditions", shopIds: [], timeField: "finish-time",
        timeRange: ["2026-09-01 00:00:00", "2026-09-04 23:59:59"],
      },
      xyId: 303,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      orderType: [0, 1], finishTime: ["2026-09-01 00:00:00", "2026-09-04 23:59:59"],
      ...(priceRange ? { priceRange } : {}), uid: 9, xyId: 303,
    });
  });

  it("returns zeros for an unmatched order number without customer filters", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => javaResponse(zeroStatistics()));
    await expect(executeWorkflowOrderQuery(orderNumberInput(fetchMock)))
      .resolves.toEqual({ netAmount: 0, orderCount: 0, totalAmount: 0 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      orderNo: "SO-1001", orderType: [0, 1], uid: 9,
    });
  });

  it("normalizes only negative net amounts to zero", async () => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(async () => javaResponse({
      data: { netTransactionAmount: -12.34, orderAmount: 10.01, orderCount: 1 },
      success: true, error: "ignored on success",
    })))).resolves.toEqual({ netAmount: 0, orderCount: 1, totalAmount: 10.01 });
  });

  it.each([
    null, {},
    { netTransactionAmount: null, orderAmount: 0, orderCount: 0 },
    { netTransactionAmount: "10", orderAmount: 10, orderCount: 1 },
    { netTransactionAmount: 0, orderAmount: -1, orderCount: 1 },
    { netTransactionAmount: 0, orderAmount: 0, orderCount: 1.5 },
    { netTransactionAmount: 0, orderAmount: 0, orderCount: -1 },
  ])("rejects invalid statistics instead of guessing zeros: %j", async data => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(async () => javaResponse({ data, success: true }))))
      .rejects.toMatchObject({ code: "WORKFLOW_ORDER_QUERY_RESPONSE_INVALID", failureKind: "terminal" });
  });

  it.each([
    { code: "WORKFLOW_ORDER_QUERY_FAILED", fetch: async () => { throw new Error("network"); } },
    { code: "WORKFLOW_ORDER_QUERY_UNAVAILABLE", fetch: async () => new Response(null, { status: 503 }) },
  ])("classifies transport or HTTP failure as $code", async ({ code, fetch }) => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(fetch))).rejects.toMatchObject({ code, failureKind: "retryable" });
  });

  it("preserves terminal Java rejection diagnostics", async () => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(async () => javaResponse({
      error: 40001, errorMsg: "订单查询参数无效", success: false,
    })))).rejects.toMatchObject({
      code: "WORKFLOW_ORDER_QUERY_REJECTED",
      diagnosticMessage: "Workflow Order Query Java endpoint rejected the request: 40001 订单查询参数无效",
      failureKind: "terminal",
    });
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);
    await expect(executeWorkflowOrderQuery(orderNumberInput(fetchMock, controller.signal))).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function orderNumberInput(fetch: typeof fetch, signal = new AbortController().signal) {
  return {
    baseUrl: "https://java.example.com/internal",
    command: { mode: "order-number" as const, orderNumber: "SO-1001" },
    fetch, signal, token: null, uid: 9,
  };
}

function zeroStatistics() {
  return { data: { netTransactionAmount: 0, orderAmount: 0, orderCount: 0 }, success: true };
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

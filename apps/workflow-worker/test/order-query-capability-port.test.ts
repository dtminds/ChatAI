import { describe, expect, it, vi } from "vitest";
import { executeWorkflowOrderQuery } from "../src/order-query-capability-port.js";

describe("Workflow Order Query Java port", () => {
  it("uses only the first 100 customer orders, applies inclusive actuPayment bounds, and deducts completed refunds", async () => {
    const unmatchedOrders = Array.from({ length: 99 }, () => ({
      actuPayment: 50,
      goodsAmount: 40,
      subOrders: [],
    }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      count: 101,
      list: [
        {
          actuPayment: 110,
          goodsAmount: 10,
          subOrders: [{
            goodsId: "g1",
            goodsName: "T恤",
            num: 2,
            skuName: "黑色",
            subRefundAmount: 20,
            subRefundFinishTime: "2026-09-03 12:00:00",
          }],
        },
        ...unmatchedOrders,
      ],
      page: 1,
      pageSize: 100,
      success: true,
    }), { status: 200 }));
    const result = await executeWorkflowOrderQuery({
      baseUrl: "https://java.example.com/internal",
      command: {
        amount: { max: 110, min: 110 },
        goodsName: "T恤",
        mode: "conditions",
        platformId: 2,
        shopIds: [11],
        timeField: "pay-time",
        timeRange: ["2026-08-28 00:00:00", "2026-09-04 23:59:00"],
      },
      fetch: fetchMock as typeof fetch,
      signal: new AbortController().signal,
      token: "token",
      uid: 9,
      xyId: 303,
    });
    expect(result).toEqual({
      netAmount: 90,
      orderCount: 1,
      totalAmount: 110,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      goodsName: "T恤",
      orderType: [0, 1],
      pageNum: 1,
      pageSize: 100,
      payTimes: ["2026-08-28 00:00:00", "2026-09-04 23:59:00"],
      platform: 2,
      shopIdList: [11],
      tradeTimeAsc: true,
      uid: 9,
      xyId: 303,
    });
  });

  it("uses the returned list without requiring pagination metadata", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      count: 101,
      list: [],
      success: true,
    }), { status: 200 }));

    await expect(executeWorkflowOrderQuery({
      baseUrl: "https://java.example.com/internal",
      command: { mode: "order-number", orderNumber: "SO-1001" },
      fetch: fetchMock as typeof fetch,
      signal: new AbortController().signal,
      token: null,
      uid: 9,
    })).resolves.toEqual({ netAmount: 0, orderCount: 0, totalAmount: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not require product fields when calculating order totals", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      count: 1,
      list: [{
        actuPayment: 25,
        subOrders: [{
          subRefundAmount: 0,
        }],
      }],
      page: 1,
      pageSize: 100,
      success: true,
    }), { status: 200 }));

    await expect(executeWorkflowOrderQuery({
      baseUrl: "https://java.example.com/internal",
      command: { mode: "order-number", orderNumber: "SO-1001" },
      fetch: fetchMock as typeof fetch,
      signal: new AbortController().signal,
      token: null,
      uid: 9,
    })).resolves.toMatchObject({
      netAmount: 25,
      orderCount: 1,
      totalAmount: 25,
    });
  });

  it("treats omitted or malformed subOrders as having no refundable items", async () => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(vi.fn(async () => javaResponse({
      count: 1,
      list: [{ actuPayment: 25 }, { actuPayment: 10, subOrders: [null, { subRefundAmount: "invalid" }] }],
      success: true,
    }))))).resolves.toEqual({ netAmount: 35, orderCount: 2, totalAmount: 35 });
  });

  it.each([
    {
      code: "WORKFLOW_ORDER_QUERY_FAILED",
      fetch: vi.fn(async () => { throw new Error("network"); }),
    },
    {
      code: "WORKFLOW_ORDER_QUERY_UNAVAILABLE",
      fetch: vi.fn(async () => new Response(null, { status: 503 })),
    },
  ])("classifies transport or HTTP failure as $code", async ({ code, fetch }) => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(fetch))).rejects.toMatchObject({
      code,
      failureKind: "retryable",
    });
  });

  it("classifies a Java business rejection as terminal with upstream diagnostics", async () => {
    await expect(executeWorkflowOrderQuery(orderNumberInput(vi.fn(async () => javaResponse({
      error: 40001,
      errorMsg: "订单查询参数无效",
      success: false,
    }))))).rejects.toMatchObject({
      code: "WORKFLOW_ORDER_QUERY_REJECTED",
      diagnosticMessage:
        "Workflow Order Query Java endpoint rejected the request: 40001 订单查询参数无效",
      failureKind: "terminal",
    });
  });

  it("propagates cancellation before issuing the Java request", async () => {
    const fetchMock = vi.fn();
    const controller = new AbortController();
    const reason = new Error("cancelled");
    controller.abort(reason);

    await expect(executeWorkflowOrderQuery(orderNumberInput(
      fetchMock,
      controller.signal,
    ))).rejects.toBe(reason);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits platform from customer queries that target all platforms", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      count: 0,
      list: [],
      page: 1,
      pageSize: 100,
      success: true,
    }), { status: 200 }));

    await executeWorkflowOrderQuery({
      baseUrl: "https://java.example.com/internal",
      command: {
        amount: {},
        mode: "conditions",
        shopIds: [],
        timeField: "order-time",
        timeRange: ["2026-09-01 00:00:00", "2026-09-04 23:59:59"],
      },
      fetch: fetchMock as typeof fetch,
      signal: new AbortController().signal,
      token: null,
      uid: 9,
      xyId: 303,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty("platform");
  });
});

function orderNumberInput(fetch: typeof fetch, signal = new AbortController().signal) {
  return {
    baseUrl: "https://java.example.com/internal",
    command: { mode: "order-number" as const, orderNumber: "SO-1001" },
    fetch,
    signal,
    token: null,
    uid: 9,
  };
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

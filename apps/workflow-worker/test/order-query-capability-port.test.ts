import { describe, expect, it, vi } from "vitest";
import { executeWorkflowOrderQuery } from "../src/order-query-capability-port.js";

describe("Workflow Order Query Java port", () => {
  it("paginates customer orders, applies inclusive actuPayment bounds, and deducts completed refunds", async () => {
    const unmatchedOrders = Array.from({ length: 99 }, () => ({
      actuPayment: 50,
      goodsAmount: 40,
      subOrders: [],
    }));
    const pages = [
      {
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
      },
      {
        count: 101,
        list: [{
          actuPayment: 50,
          goodsAmount: 40,
          subOrders: [],
        }],
        page: 2,
        pageSize: 100,
        success: true,
      },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(pages.shift()), { status: 200 }));
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("rejects a page whose list does not match count/page/pageSize", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      count: 101,
      list: [],
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
    })).rejects.toMatchObject({ code: "WORKFLOW_ORDER_QUERY_RESPONSE_INVALID" });
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

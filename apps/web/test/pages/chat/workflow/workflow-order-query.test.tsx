import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { OrderQueryConfig } from "@/pages/chat/workflow/nodes/order-query/panel";
import { orderQueryNodeUi } from "@/pages/chat/workflow/nodes/order-query/ui";
import { NodeConfigPanel } from "@/pages/chat/workflow/panels";
import {
  createDefaultOrderQueryConditions,
  validateOrderQueryConditions,
} from "@/pages/chat/workflow/nodes/order-query/config";
import { getWorkflowNodeOutputDefinitions } from "@/pages/chat/workflow/workflow-node-outputs";
import { http } from "@/lib/request";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";
import type { WorkflowOrderResource } from "@/pages/chat/workflow/workflow-order-resource";
import {
  listWorkflowOrderShops,
  listWorkflowOrderStatuses,
} from "@/pages/chat/workflow/workflow-order-resource";

const orderQueryTestServiceMock = vi.hoisted(() => ({
  runWorkflowOrderQueryTest: vi.fn(),
}));

vi.mock(
  "@/pages/chat/workflow/nodes/order-query/test-service",
  () => orderQueryTestServiceMock,
);

describe("workflow Order Query node", () => {
  it("shows the query mode and order number variable on the node", () => {
    const data = {
      ...createOrderQueryNode({
        mode: "order-number",
        orderNumberSelector: ["node", "collect-order", "orderNo"],
      }).data,
      availableVariables: [{
        key: "orderNo",
        label: "订单号",
        scope: "node" as const,
        selector: ["node", "collect-order", "orderNo"],
        sourceNodeId: "collect-order",
        sourceNodeKind: "ai-collect" as const,
        sourceNodeTitle: "收集订单号",
        type: "string" as const,
        usages: ["variable" as const],
        valueType: { kind: "string" as const },
      }],
    };

    expect(orderQueryNodeUi.body.kind === "fields"
      ? orderQueryNodeUi.body.getFields(data)
      : []).toEqual([
      {
        id: "query-mode",
        label: "查询方式",
        value: { kind: "text", text: "订单号" },
      },
      {
        id: "order-number",
        label: "订单号",
        value: {
          items: [
            { kind: "source", text: "收集订单号" },
            { kind: "text", text: ".", tone: "muted" },
            { kind: "variable", text: "订单号" },
          ],
          kind: "segments",
        },
      },
    ]);
  });

  it("shows the query mode, platform, and order time on the node", () => {
    const data = createOrderQueryNode({
      conditions: {
        amount: {},
        platformId: 2,
        shopIds: [],
        timeField: "order-time",
        timeRange: {
          end: { amount: 0, time: "23:59", unit: "day" },
          mode: "relative",
          start: { amount: 30, time: "00:00", unit: "day" },
        },
      },
      mode: "conditions",
    }).data;

    expect(orderQueryNodeUi.body.kind === "fields"
      ? orderQueryNodeUi.body.getFields(data)
      : []).toEqual([
      {
        id: "query-mode",
        label: "查询方式",
        value: { kind: "text", text: "条件查询" },
      },
      {
        id: "platform",
        label: "下单平台",
        value: { kind: "text", text: "指定平台" },
      },
      {
        id: "order-time",
        label: "下单时间",
        value: {
          kind: "text",
          text: "过去 30 天 00:00 至 过去 0 天 23:59",
        },
      },
    ]);
  });

  it("runs a saved condition query synchronously and renders all outputs", async () => {
    const user = userEvent.setup();
    const node = createOrderQueryNode({
      conditions: {
        amount: {},
        shopIds: [],
        timeField: "order-time",
        timeRange: {
          end: { amount: 0, time: "23:59", unit: "day" },
          mode: "relative",
          start: { amount: 30, time: "00:00", unit: "day" },
        },
      },
      mode: "conditions",
      status: "ready",
    });
    orderQueryTestServiceMock.runWorkflowOrderQueryTest.mockResolvedValue({
      output: {
        netAmount: 80,
        orderCount: 2,
        totalAmount: 100,
      },
    });
    renderOrderQueryTestPanel(node);

    await user.click(screen.getByRole("button", { name: "试运行订单查询节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "企微客户 ID" }), "101");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    await waitFor(() => expect(orderQueryTestServiceMock.runWorkflowOrderQueryTest).toHaveBeenCalledWith(
      "42",
      node.id,
      { expectedDraftVersion: 3, externalUserId: 101, variableValues: [] },
      "/server/workflows",
      expect.any(AbortSignal),
    ));
    expect(await within(workspace).findByText("运行成功")).toBeInTheDocument();
    expect(within(workspace).getByText("2")).toBeInTheDocument();
    expect(within(workspace).getByText("100.00")).toBeInTheDocument();
    expect(within(workspace).getByText("80.00")).toBeInTheDocument();
  });

  it("asks for both dynamic time values", async () => {
    const user = userEvent.setup();
    const node = createOrderQueryNode({
      conditions: createDefaultOrderQueryConditions(),
      mode: "conditions",
      status: "ready",
    });
    renderOrderQueryTestPanel(node);

    await user.click(screen.getByRole("button", { name: "试运行订单查询节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });

    expect(within(workspace).getByRole("button", { name: "开始时间试运行值" })).toBeInTheDocument();
    expect(within(workspace).getByRole("button", { name: "结束时间试运行值" })).toBeInTheDocument();
    expect(within(workspace).getByText("触发时间")).toBeInTheDocument();
    expect(within(workspace).getByText("进入时间")).toBeInTheDocument();
  });

  it("accepts a temporary order number for an order-number test run", async () => {
    const user = userEvent.setup();
    const node = createOrderQueryNode({
      mode: "order-number",
      status: "warning",
    });
    orderQueryTestServiceMock.runWorkflowOrderQueryTest.mockResolvedValue({
      output: {
        netAmount: 25,
        orderCount: 1,
        totalAmount: 25,
      },
    });
    renderOrderQueryTestPanel(node);

    await user.click(screen.getByRole("button", { name: "试运行订单查询节点" }));
    const workspace = screen.getByRole("region", { name: "试运行展开编辑" });
    await user.type(within(workspace).getByRole("textbox", { name: "订单号试运行值" }), "SO-1001");
    await user.click(within(workspace).getByRole("button", { name: "运行" }));

    await waitFor(() => expect(orderQueryTestServiceMock.runWorkflowOrderQueryTest).toHaveBeenCalledWith(
      "42",
      node.id,
      {
        expectedDraftVersion: 3,
        orderNumber: "SO-1001",
      },
      "/server/workflows",
      expect.any(AbortSignal),
    ));
  });

  it("omits platformIds when loading all authorized shops", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ data: { shops: [] } });

    await expect(listWorkflowOrderShops([])).resolves.toEqual([]);

    expect(get).toHaveBeenCalledWith("/server/workflow/order-shops", undefined);
    get.mockRestore();
  });

  it("exposes the final matched order count as a numeric variable", () => {
    const outputs = getWorkflowNodeOutputDefinitions(createOrderQueryNode());

    expect(outputs.find(output => output.key === "orderCount")).toMatchObject({
      usages: ["variable"],
      valueType: { kind: "number" },
    });
    expect(outputs.some(output => output.key === "goods")).toBe(false);
  });

  it("loads order status options from the workflow resource endpoint", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({
      data: { statuses: [{ name: "待付款", status: 0 }] },
    });

    await expect(listWorkflowOrderStatuses()).resolves.toEqual([{ name: "待付款", status: 0 }]);

    expect(get).toHaveBeenCalledWith("/server/workflow/order-statuses");
    get.mockRestore();
  });

  it("keeps status zero selectable and clears the filter when status is unrestricted", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={vi.fn().mockResolvedValue([])} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("combobox", { name: "订单状态" }));
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["不限", "待付款"]);
    await user.click(screen.getByRole("option", { name: "待付款" }));
    expect(onNodeChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({ orderStatus: 0 }),
    })));

    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("combobox", { name: "订单状态" }));
    await user.click(screen.getByRole("option", { name: "不限" }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      const lastPatch = onNodeChange.mock.calls.at(-1)?.[0] as { conditions?: object } | undefined;
      expect(lastPatch?.conditions).not.toHaveProperty("orderStatus");
    });
  });

  it("discards condition edits when the dialog is closed or cancelled", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={vi.fn().mockResolvedValue([])} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    onNodeChange.mockClear();
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.type(screen.getByRole("textbox", { name: "商品名称" }), "未保存商品");
    expect(onNodeChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(onNodeChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "修改条件" }));
    expect(screen.getByRole("textbox", { name: "商品名称" })).toHaveValue("");
    await user.type(screen.getByRole("textbox", { name: "商品名称" }), "仍未保存");
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onNodeChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "修改条件" }));
    expect(screen.getByRole("textbox", { name: "商品名称" })).toHaveValue("");
  });

  it("blocks saving incomplete time and a reversed amount range", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={vi.fn().mockResolvedValue([])} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("combobox", { name: "订单时间类型" }));
    await user.click(screen.getByRole("option", { name: "绝对时间" }));
    await user.type(screen.getByRole("textbox", { name: "最低订单金额" }), "900");
    await user.type(screen.getByRole("textbox", { name: "最高订单金额" }), "150");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("请选择完整的开始和结束时间")).toBeInTheDocument();
    expect(screen.getByText("最低金额不能大于最高金额")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "订单开始时间" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("textbox", { name: "最低订单金额" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onNodeChange).toHaveBeenCalledTimes(1);
  });

  it("preserves decimal price input and rejects more than two decimal places", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={vi.fn().mockResolvedValue([])} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    const minimum = screen.getByRole("textbox", { name: "最低订单金额" });
    const maximum = screen.getByRole("textbox", { name: "最高订单金额" });
    await user.type(minimum, "1.50");
    await user.type(maximum, "2.345");

    expect(minimum).toHaveValue("1.50");
    expect(maximum).toHaveValue("2.345");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("请输入正确的金额，最多两位小数")).toBeInTheDocument();
    expect(onNodeChange).toHaveBeenCalledTimes(1);

    await user.clear(maximum);
    await user.type(maximum, "2.35");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({ amount: { max: 2.35, min: 1.5 } }),
    })));
  });

  it("limits shop and influencer selection to 20 items", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const shops = Array.from({ length: 21 }, (_, index) => ({
      id: index + 1,
      model: 1,
      name: `店铺 ${index + 1}`,
      platformId: 2,
    }));
    render(<StatefulOrderQueryConfig
      listShops={vi.fn().mockResolvedValue(shops)}
      onNodeChange={onNodeChange}
    />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("combobox", { name: "店铺/达人" }));
    for (let index = 1; index <= 20; index += 1) {
      await user.click(await screen.findByRole("checkbox", { name: `店铺 ${index}` }));
    }

    const firstShop = screen.getByRole("checkbox", { name: "店铺 1" });
    const twentyFirstShop = screen.getByRole("checkbox", { name: "店铺 21" });
    expect(firstShop).toBeEnabled();
    expect(twentyFirstShop).toBeDisabled();
    await user.click(firstShop);
    expect(twentyFirstShop).toBeEnabled();
    await user.click(twentyFirstShop);
    expect(screen.getByRole("combobox", { name: "店铺/达人" })).toHaveTextContent("已选择 20 个");

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({
        shopIds: [...Array.from({ length: 19 }, (_, index) => index + 2), 21],
      }),
    })));
  });

  it("validates the shop selection limit before saving", () => {
    expect(validateOrderQueryConditions({
      ...createDefaultOrderQueryConditions(),
      shopIds: Array.from({ length: 21 }, (_, index) => index + 1),
    }).shopIds).toBe("最多选择 20 个店铺/达人");
  });

  it("validates the 360-day absolute and relative time boundaries", () => {
    const now = new Date("2026-09-04T21:00:00+08:00");
    const base = createDefaultOrderQueryConditions();

    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        endAt: "2026-09-04T00:00",
        mode: "absolute",
        startAt: "2025-09-09T00:00",
      },
    }, now).timeRange).toBeUndefined();
    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        endAt: "2025-09-09T21:00",
        mode: "absolute",
        startAt: "2025-09-08T21:00",
      },
    }, now).timeRange).toBe("时间不能早于360天前");
    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        endAt: "2026-09-05T00:00",
        mode: "absolute",
        startAt: "2025-09-09T00:00",
      },
    }, now).timeRange).toBe("时间跨度不能超过360天");
    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        end: { amount: 0, time: "00:00", unit: "day" },
        mode: "relative",
        start: { amount: 360, time: "00:00", unit: "day" },
      },
    }, now).timeRange).toBeUndefined();
    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        end: { amount: 0, time: "00:00", unit: "day" },
        mode: "relative",
        start: { amount: 361, time: "00:00", unit: "day" },
      },
    }, now).timeRange).toBe("时间不能早于360天前");
    expect(validateOrderQueryConditions({
      ...base,
      timeRange: {
        end: { amount: 0, time: "23:59", unit: "day" },
        mode: "relative",
        start: { amount: 360, time: "00:00", unit: "day" },
      },
    }, now).timeRange).toBeUndefined();
  });

  it("switches to customer conditions, retries shop loading, and keeps edited conditions", async () => {
    const user = userEvent.setup();
    const listShops = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValue([{ id: 11, model: 1, name: "旗舰店", platformId: 2 }]);
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={listShops} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    expect(screen.getByRole("combobox", { name: "订单时间类型" })).toHaveTextContent("动态时间");
    expect(screen.getByRole("button", { name: "开始动态时间" })).toHaveTextContent("全局变量.触发时间");
    expect(screen.getByRole("button", { name: "结束动态时间" })).toHaveTextContent("订单查询.进入时间");
    await user.click(screen.getByRole("combobox", { name: "平台" }));
    await user.click(screen.getByRole("option", { name: "视频号" }));

    await user.click(screen.getByRole("combobox", { name: "店铺/达人" }));
    expect(await screen.findByText("加载失败")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重试" }));
    await user.click(await screen.findByRole("checkbox", { name: "旗舰店" }));
    await user.type(screen.getByRole("textbox", { name: "商品名称" }), "  T恤  ");

    await user.click(screen.getByRole("combobox", { name: "订单时间字段" }));
    await user.click(screen.getByRole("option", { name: "支付时间" }));
    await user.click(screen.getByRole("combobox", { name: "订单时间类型" }));
    await user.click(screen.getByRole("option", { name: "绝对时间" }));
    expect(screen.getByRole("button", { name: "订单开始时间" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "订单结束时间" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "订单时间类型" }));
    await user.click(screen.getByRole("option", { name: "相对时间" }));
    await user.type(screen.getByRole("textbox", { name: "最低订单金额" }), "100");
    await user.type(screen.getByRole("textbox", { name: "最高订单金额" }), "200");
    await user.click(screen.getByRole("combobox", { name: "订单状态" }));
    await user.click(screen.getByRole("option", { name: "待付款" }));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("下单平台：")).toBeInTheDocument();
    expect(screen.getByText("视频号")).toBeInTheDocument();
    expect(screen.getByText("店铺/达人：")).toBeInTheDocument();
    expect(screen.getByText("已选择 1 个")).toBeInTheDocument();
    expect(screen.getByText("商品名称：")).toBeInTheDocument();
    expect(screen.getByText("T恤")).toBeInTheDocument();
    expect(screen.getByText("订单状态：")).toBeInTheDocument();
    expect(screen.getByText("待付款")).toBeInTheDocument();
    expect(screen.getByText("支付时间：")).toBeInTheDocument();
    expect(screen.getByText("过去 30 天 00:00:00 - 过去 0 天 23:59:00")).toBeInTheDocument();
    expect(screen.getByText("订单金额：")).toBeInTheDocument();
    expect(screen.getByText("100 - 200")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "修改条件" }));
    expect(screen.getByRole("combobox", { name: "订单时间字段" })).toHaveTextContent("支付时间");
    expect(screen.getByRole("combobox", { name: "订单时间类型" })).toHaveTextContent("相对时间");
    expect(screen.getByRole("textbox", { name: "最低订单金额" })).toHaveValue("100");
    expect(screen.getByRole("textbox", { name: "最高订单金额" })).toHaveValue("200");
    expect(screen.getByRole("textbox", { name: "商品名称" })).toHaveValue("T恤");
    expect(screen.getByRole("combobox", { name: "订单状态" })).toHaveTextContent("待付款");
    expect(screen.getByRole("combobox", { name: "店铺/达人" })).toHaveTextContent("旗舰店");
    await user.click(screen.getByRole("combobox", { name: "店铺/达人" }));
    expect(screen.getByRole("checkbox", { name: "旗舰店" })).toBeChecked();
    expect(listShops).toHaveBeenCalledTimes(4);
    await waitFor(() => expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({
        amount: { max: 200, min: 100 },
        goodsName: "T恤",
        orderStatus: 0,
        platformId: 2,
        shopIds: [11],
        timeField: "pay-time",
      }),
      mode: "conditions",
      status: "ready",
    })));
  });

  it("selects and echoes dynamic order time variables", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulOrderQueryConfig listShops={vi.fn().mockResolvedValue([])} onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("button", { name: "结束动态时间" }));
    await user.click(screen.getByRole("menuitem", { name: "全局变量" }));
    fireEvent.pointerDown(await screen.findByRole("menuitem", { name: /触发时间.*日期时间/ }));

    expect(onNodeChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({
        timeRange: {
          end: ["trigger", "occurredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
      }),
    })));
    expect(screen.getAllByText("全局变量")).toHaveLength(2);
    expect(screen.getAllByText("触发时间")).toHaveLength(2);
  });

  it("lists all platforms first and loads all authorized shops without a platform filter", async () => {
    const user = userEvent.setup();
    const listShops = vi.fn().mockResolvedValue([
      { id: 11, model: 1, name: "旗舰店", platformId: 2 },
    ]);
    render(<StatefulOrderQueryConfig listShops={listShops} onNodeChange={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));

    await waitFor(() => expect(listShops).toHaveBeenCalledWith([]));
    expect(screen.queryByRole("checkbox", { name: "旗舰店" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "店铺/达人" }));
    expect(await screen.findByRole("checkbox", { name: "旗舰店" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "平台" }));
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual([
      "全部",
      "视频号",
    ]);
  });

  it("groups authorized shops and influencers by shop model", async () => {
    const user = userEvent.setup();
    const listShops = vi.fn().mockResolvedValue([
      { id: 11, model: 1, name: "旗舰店", platformId: 2 },
      { id: 12, model: 2, name: "带货达人", platformId: 2 },
      { id: 13, model: 3, name: "品牌店播", platformId: 2 },
    ]);
    render(<StatefulOrderQueryConfig listShops={listShops} onNodeChange={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    await user.click(screen.getByRole("combobox", { name: "店铺/达人" }));

    const shopGroup = await screen.findByRole("group", { name: "店铺" });
    const influencerGroup = screen.getByRole("group", { name: "达人" });
    expect(within(shopGroup).getByRole("checkbox", { name: "旗舰店" })).toBeInTheDocument();
    expect(within(shopGroup).getByRole("checkbox", { name: "品牌店播" })).toBeInTheDocument();
    expect(within(influencerGroup).getByRole("checkbox", { name: "带货达人" })).toBeInTheDocument();
  });

  it("leaves shops unselected without rendering an all option", async () => {
    const user = userEvent.setup();
    const listShops = vi.fn().mockResolvedValue([
      { id: 11, model: 1, name: "旗舰店", platformId: 2 },
      { id: 12, model: 2, name: "带货达人", platformId: 2 },
    ]);
    render(<StatefulOrderQueryConfig listShops={listShops} onNodeChange={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "按条件" }));
    await user.click(screen.getByRole("button", { name: "修改条件" }));
    const trigger = screen.getByRole("combobox", { name: "店铺/达人" });
    expect(trigger).toHaveTextContent("请选择");
    await user.click(trigger);

    expect(screen.queryByRole("checkbox", { name: "全部" })).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "旗舰店" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "带货达人" })).not.toBeChecked();
  });
});

function StatefulOrderQueryConfig({
  listShops,
  onNodeChange,
}: {
  listShops: WorkflowOrderResource["listShops"];
  onNodeChange: (patch: WorkflowNodeConfigPatch<"order-query">) => void;
}) {
  const [node, setNode] = useState<WorkflowNode<"order-query">>(() => ({
    ...createOrderQueryNode(),
  }));
  const resource: WorkflowOrderResource = {
    listShops,
    orderStatuses: [{ name: "待付款", status: 0 }],
    platforms: [{ id: 2, name: "视频号" }],
    reload: vi.fn(),
    status: "ready",
  };

  return (
    <OrderQueryConfig
      edges={[]}
      node={node}
      nodes={[node]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
      }}
      resources={{ orders: resource }}
    />
  );
}

function renderOrderQueryTestPanel(node: WorkflowNode<"order-query">) {
  return render(
    <NodeConfigPanel
      allowedEntryEventTypes={["contact.friend_added"]}
      edges={[]}
      node={node}
      nodes={[node]}
      onClose={vi.fn()}
      onNodeChange={vi.fn()}
      onRenameNode={vi.fn()}
      testContext={{ draftVersion: 3, saveState: "saved", workflowId: "42" }}
    />,
  );
}

function createOrderQueryNode(
  patch: Partial<WorkflowNode<"order-query">["data"]> = {},
): WorkflowNode<"order-query"> {
  return {
    data: { ...createDefaultNodeData("order-query"), ...patch },
    id: "order-query",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

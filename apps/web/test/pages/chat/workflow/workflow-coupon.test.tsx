import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CouponConfig } from "@/pages/chat/workflow/nodes/coupon/panel";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { listWorkflowCoupons } from "@/pages/chat/workflow/nodes/coupon/service";
import { validateWorkflowNodeConfig } from "@/pages/chat/workflow/validation/workflow-validation";

vi.mock("@/pages/chat/workflow/nodes/coupon/service", () => ({ listWorkflowCoupons: vi.fn() }));
const items = [
  { couponId: 11, couponName: "满减券", couponContent: "满100减20", couponType: 1, stocks: 96, limitNum: 3 },
  { couponId: 12, couponName: "折扣券", couponContent: "九折", couponType: 2, stocks: 10, limitNum: 1 },
];
function Panel({ configured = false }: { configured?: boolean } = {}) {
  const [node, setNode] = useState(() => {
    const value = createNodeFromKind("coupon", "coupon", 0);
    if (configured) {
      value.data = {
        ...value.data,
        coupon: { couponId: 11, couponName: "旧名称", couponContent: "旧内容", couponType: 1 },
      };
    }
    return value;
  });
  return <CouponConfig node={node} nodes={[node]} edges={[]} onNodeChange={patch => setNode(current => ({ ...current, data: { ...current.data, ...patch } }))} />;
}
describe("Coupon configuration", () => {
  it("blocks publishing an unselected coupon", () => {
    const node = createNodeFromKind("coupon", "coupon", 0);
    expect(validateWorkflowNodeConfig(node, [node], [])).toContainEqual(expect.objectContaining({ code: "coupon-config-required" }));
  });
  beforeEach(() => vi.mocked(listWorkflowCoupons).mockReset().mockResolvedValue({ items, page: 1, pageSize: 10, total: 21, hasNext: true } as Awaited<ReturnType<typeof listWorkflowCoupons>>));
  it("commits only one selected coupon, cancels edits, and changes quantity", async () => {
    const user = userEvent.setup(); render(<Panel />);
    await user.click(screen.getByRole("button", { name: "选择优惠券" }));
    await user.click(await screen.findByRole("radio", { name: "选择满减券" }));
    await user.click(screen.getByRole("radio", { name: "选择折扣券" }));
    expect(screen.getByRole("radio", { name: "选择满减券" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("button", { name: "选择优惠券" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选择优惠券" }));
    await user.click(await screen.findByRole("radio", { name: "选择满减券" }));
    await user.click(screen.getByRole("button", { name: "确定" }));
    expect(screen.getByText("满100减20")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "发放张数" }));
    expect(screen.getAllByRole("option")).toHaveLength(5);
    await user.click(screen.getByRole("option", { name: "5 张" }));
    expect(screen.getAllByText("优惠券")).toHaveLength(3);
    expect(screen.queryByText("优惠券（共5张）")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(await screen.findByRole("radio", { name: "选择满减券" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "选择折扣券" }));
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByText("满100减20")).toBeInTheDocument();
  });
  it("queries one page at a time and retries resource loading", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflowCoupons).mockRejectedValueOnce(new Error("network"));
    render(<Panel />); await user.click(screen.getByRole("button", { name: "选择优惠券" }));
    await user.click(await screen.findByRole("button", { name: "重试" }));
    await screen.findByRole("radio", { name: "选择满减券" });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(listWorkflowCoupons).toHaveBeenLastCalledWith({ couponName: "", page: 2, pageSize: 10 }, expect.any(AbortSignal)));
    await user.type(screen.getByRole("textbox", { name: "优惠券名称" }), "折扣");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await waitFor(() => expect(listWorkflowCoupons).toHaveBeenLastCalledWith({ couponName: "折扣", page: 1, pageSize: 10 }, expect.any(AbortSignal)));
  });
  it("keeps the edit action available when the selected coupon cannot be refreshed", async () => {
    const user = userEvent.setup();
    vi.mocked(listWorkflowCoupons).mockRejectedValueOnce(new Error("network"));
    render(<Panel configured />);
    expect(await screen.findByText("旧名称")).toBeInTheDocument();
    expect(screen.getByText("加载失败")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    expect(await screen.findByRole("radio", { name: "选择满减券" })).toBeInTheDocument();
  });
  it("discards an old search response and cancels requests on close", async () => {
    const user = userEvent.setup();
    let resolveOld!: (value: Awaited<ReturnType<typeof listWorkflowCoupons>>) => void;
    vi.mocked(listWorkflowCoupons).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    render(<Panel />); await user.click(screen.getByRole("button", { name: "选择优惠券" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
    const oldSignal = vi.mocked(listWorkflowCoupons).mock.calls[0]![1]!;
    await user.type(screen.getByRole("textbox", { name: "优惠券名称" }), "新券");
    await user.click(screen.getByRole("button", { name: "查询" }));
    await screen.findByRole("radio", { name: "选择满减券" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => resolveOld({ items: [], total: 0, page: 1, pageSize: 10, hasNext: false }));
    expect(screen.getByRole("radio", { name: "选择满减券" })).toBeInTheDocument();
    const signal = vi.mocked(listWorkflowCoupons).mock.calls.at(-1)![1]!;
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(signal.aborted).toBe(true);
  });
});

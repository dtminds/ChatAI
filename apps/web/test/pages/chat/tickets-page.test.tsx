import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketsPage } from "@/pages/chat/tickets/tickets-page";
import {
  resetTicketCountStore,
  useTicketCountStore,
} from "@/pages/chat/tickets/ticket-count-store";
import { useAuthStore } from "@/store/auth-store";

const api = vi.hoisted(() => ({
  getTickets: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);

const ticket = {
  anchorMessageId: null, assignee: null, canClaim: true, canDelete: false, canEdit: false, canceledAt: null,
  completedAt: null, conversationId: "301", createdAt: 1, createdBy: { displayName: "客服乙", subUserId: "102" },
  customerAvatarUrl: null, customerName: "王女士", description: null, dueAt: null,
  dueHint: null, overdue: false, ownerAccountAvatarUrl: null, ownerAccountId: "201",
  ownerAccountName: "售后账号", priority: "high", sessionId: "401", snapshotId: null,
  sourceType: "ai", status: "open", ticketId: "501", title: "确认退款进度", updatedAt: 2,
};

beforeEach(() => {
  api.getTickets.mockResolvedValue({ items: [ticket], page: 1, pageSize: 20, total: 1, totalPages: 1 });
  window.localStorage.clear();
  resetTicketCountStore();
  useAuthStore.getState().setSession({ role: "operator" } as never);
});

describe("TicketsPage", () => {
  it("loads the selected reception view and renders the work table without a create command", async () => {
    render(<MemoryRouter initialEntries={["/chat/tickets?view=reception"]}><TicketsPage /></MemoryRouter>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await screen.findByRole("link", { name: /确认退款进度/ });
    expect(screen.getByText("客服乙")).toBeInTheDocument();
    expect(api.getTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "reception" }));
    expect(screen.queryByRole("button", { name: /新建|创建工单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "待领取" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "全部工单" })).not.toBeInTheDocument();
  });

  it("switches the list view through page tabs", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/chat/tickets"]}><TicketsPage /></MemoryRouter>);

    expect(await screen.findByRole("tab", { name: "我的待办" })).toHaveAttribute("data-state", "active");
    expect(api.getTickets).toHaveBeenCalledWith(expect.objectContaining({
      view: "assigned_to_me_active",
    }));
    await user.click(screen.getByRole("tab", { name: "我接待的" }));

    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ view: "reception" }),
    ));
  });

  it("does not show a redundant status filter in my todos", async () => {
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);

    await screen.findByRole("tab", { name: "我的待办" });
    expect(screen.queryByRole("combobox", { name: "状态" })).not.toBeInTheDocument();
  });

  it("persists the ticket menu reminder preference locally", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "通知配置" }));
    expect(screen.getByRole("dialog", { name: "工单通知配置" })).toBeInTheDocument();
    expect(screen.getByLabelText("3 个待处理工单")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /仅圆点/ }));
    expect(screen.getByLabelText("有待处理工单")).toBeInTheDocument();
    expect(useTicketCountStore.getState().reminderDisplayMode).toBe("number");

    await user.click(screen.getByRole("radio", { name: /不展示/ }));
    expect(screen.queryByLabelText("3 个待处理工单")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("有待处理工单")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /仅圆点/ }));
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(useTicketCountStore.getState().reminderDisplayMode).toBe("dot");

    resetTicketCountStore();
    expect(useTicketCountStore.getState().reminderDisplayMode).toBe("dot");
  });

  it("uses the unfiltered my-todos list total for the shared ticket badge", async () => {
    api.getTickets.mockResolvedValueOnce({
      items: [ticket],
      page: 1,
      pageSize: 20,
      total: 3,
      totalPages: 1,
    });
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);

    await screen.findByRole("link", { name: /确认退款进度/ });
    expect(useTicketCountStore.getState().counts).toEqual({
      assignedToMeActive: 3,
    });
  });

  it("does not send a stale status filter when switching to my todos", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/chat/tickets?view=assigned_to_me"]}><TicketsPage /></MemoryRouter>);

    await screen.findByRole("link", { name: /确认退款进度/ });
    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(screen.getByRole("option", { name: "已完成" }));
    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "done", view: "assigned_to_me" }),
    ));

    api.getTickets.mockClear();
    await user.click(screen.getByRole("tab", { name: "我的待办" }));
    await waitFor(() => expect(api.getTickets).toHaveBeenCalled());

    expect(api.getTickets.mock.calls.every(([query]) => (
      query.view !== "assigned_to_me_active" || query.status === undefined
    ))).toBe(true);
  });

  it("shows the global view to admins and resets paging when filters change", async () => {
    useAuthStore.getState().setSession({ role: "admin" } as never);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/chat/tickets"]}><TicketsPage /></MemoryRouter>);

    await screen.findByRole("link", { name: /确认退款进度/ });
    expect(screen.getByRole("tab", { name: "全部工单" })).toBeInTheDocument();
    const callsBeforeSearch = api.getTickets.mock.calls.length;
    await user.type(screen.getByRole("textbox", { name: "搜索工单" }), "退款");
    expect(api.getTickets).toHaveBeenCalledTimes(callsBeforeSearch);
    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, search: "退款" }),
    ));
  });

  it("resets the creation date together with the other ticket filters", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);

    await screen.findByRole("link", { name: /确认退款进度/ });
    await user.click(screen.getByRole("button", { name: "日期范围 创建时间" }));
    await user.click(screen.getByRole("button", { name: "昨天" }));
    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        createdFrom: expect.any(Number),
        createdTo: expect.any(Number),
      }),
    ));

    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    await user.click(screen.getByRole("menuitem", { name: "重置筛选" }));

    expect(screen.getByRole("button", { name: "日期范围 创建时间" })).toBeInTheDocument();
    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        createdFrom: undefined,
        createdTo: undefined,
      }),
    ));
  });

  it("keeps loading empty and error states distinct", async () => {
    api.getTickets.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const first = render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await screen.findByText("暂无数据");
    first.unmount();

    api.getTickets.mockRejectedValueOnce(new Error("加载失败"));
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("加载失败");
  });
});

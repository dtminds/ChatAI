import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketsPage } from "@/pages/chat/tickets/tickets-page";
import { useAuthStore } from "@/store/auth-store";

const api = vi.hoisted(() => ({
  getTicketCounts: vi.fn(),
  getTickets: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);

const ticket = {
  anchorMessageId: null, assignee: null, canClaim: true, canEdit: false, canceledAt: null,
  completedAt: null, conversationId: "301", createdAt: 1, createdBy: null,
  customerAvatarUrl: null, customerName: "王女士", description: null, dueAt: null,
  dueHint: null, overdue: false, ownerAccountAvatarUrl: null, ownerAccountId: "201",
  ownerAccountName: "售后账号", priority: "high", sessionId: "401", snapshotId: null,
  sourceType: "ai", status: "open", ticketId: "501", title: "确认退款进度", updatedAt: 2,
};

beforeEach(() => {
  api.getTicketCounts.mockResolvedValue({ assignedToMeActive: 1, unassignedOpen: 2 });
  api.getTickets.mockResolvedValue({ items: [ticket], page: 1, pageSize: 20, total: 1, totalPages: 1 });
  useAuthStore.getState().setSession({ role: "operator" } as never);
});

describe("TicketsPage", () => {
  it("loads the selected reception view and renders the work table without a create command", async () => {
    render(<MemoryRouter initialEntries={["/chat/tickets?view=reception"]}><TicketsPage /></MemoryRouter>);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await screen.findByRole("link", { name: /确认退款进度/ });
    expect(api.getTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "reception" }));
    expect(screen.queryByRole("button", { name: /新建|创建工单/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "全部工单" })).not.toBeInTheDocument();
  });

  it("shows the global view to admins and resets paging when filters change", async () => {
    useAuthStore.getState().setSession({ role: "admin" } as never);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/chat/tickets"]}><TicketsPage /></MemoryRouter>);

    await screen.findByRole("link", { name: /确认退款进度/ });
    expect(screen.getByRole("link", { name: "全部工单" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "搜索工单" }), "退款");
    await waitFor(() => expect(api.getTickets).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, search: "退款" }),
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

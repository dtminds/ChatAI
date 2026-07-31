import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket, TicketListItem } from "@chatai/contracts";
import { ConversationTicketsPanel } from "@/pages/chat/tickets/conversation-tickets-panel";

const api = vi.hoisted(() => ({
  getConversationTickets: vi.fn(),
  updateTicket: vi.fn(),
}));
const ticketCounts = vi.hoisted(() => ({
  refreshTicketCounts: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);
vi.mock("@/pages/chat/tickets/ticket-count-store", () => ticketCounts);
vi.mock("@/pages/chat/tickets/ticket-detail-page", () => ({
  TicketDetailContent: ({
    onTicketChange,
    ticketId,
  }: {
    onTicketChange?: () => void;
    ticketId: string;
  }) => (
    <div>
      <h1>工单详情 {ticketId}</h1>
      <button onClick={onTicketChange} type="button">模拟详情更新</button>
    </div>
  ),
}));
vi.mock("sonner", () => ({ toast }));

const ticket: Ticket = {
  anchorMessageId: null,
  assignee: { displayName: "客服甲", subUserId: "101" },
  canClaim: false,
  canDelete: true,
  canEdit: true,
  canceledAt: null,
  completedAt: null,
  conversationId: "301",
  createdAt: 1,
  createdBy: { displayName: "客服甲", subUserId: "101" },
  customerAvatarUrl: null,
  customerName: "客户甲",
  description: null,
  dueAt: null,
  overdue: false,
  ownerAccountAvatarUrl: null,
  ownerAccountId: "201",
  ownerAccountName: "账号甲",
  priority: "medium",
  sessionId: null,
  snapshotId: null,
  sourceType: "manual",
  status: "open",
  ticketId: "501",
  title: "跟进退款",
  updatedAt: 2,
};

const listTicket: TicketListItem = { ...ticket };
delete (listTicket as Partial<Ticket>).canClaim;

function response(items: TicketListItem[] = [listTicket]) {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: 1,
  };
}

beforeEach(() => {
  toast.error.mockReset();
  api.getConversationTickets.mockReset().mockResolvedValue(response());
  api.updateTicket.mockReset().mockResolvedValue({ ticket });
  ticketCounts.refreshTicketCounts.mockReset().mockResolvedValue(undefined);
});

function renderPanel(props: Partial<React.ComponentProps<typeof ConversationTicketsPanel>> = {}) {
  return render(
    <MemoryRouter>
      <ConversationTicketsPanel conversationId="301" {...props} />
    </MemoryRouter>,
  );
}

describe("ConversationTicketsPanel", () => {
  it("groups open and in-progress tickets into the pending filter", async () => {
    const user = userEvent.setup();
    const onCreateTicket = vi.fn();
    api.getConversationTickets
      .mockResolvedValueOnce(response([
        listTicket,
        {
          ...listTicket,
          status: "in_progress",
          ticketId: "502",
          title: "处理中工单",
        },
      ]))
      .mockResolvedValueOnce(response([{
        ...listTicket,
        status: "done",
        ticketId: "504",
        title: "已完成工单",
      }]));

    const { rerender } = renderPanel({ onCreateTicket });
    expect(await screen.findByRole("button", { name: /跟进退款/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /处理中工单/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "处理中" })).not.toBeInTheDocument();
    expect(api.getConversationTickets).toHaveBeenLastCalledWith("301", {
      filter: "active",
      page: 1,
      pageSize: 20,
    });
    await user.click(screen.getByRole("button", { name: "创建工单" }));
    expect(onCreateTicket).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("tab", { name: "已完成" }));
    expect(await screen.findByRole("button", { name: /已完成工单/ })).toBeInTheDocument();
    expect(api.getConversationTickets).toHaveBeenLastCalledWith("301", {
      filter: "done",
      page: 1,
      pageSize: 20,
    });

    api.getConversationTickets.mockResolvedValueOnce(response([{
      ...listTicket,
      ticketId: "503",
      title: "新建待处理工单",
    }]));
    rerender(
      <MemoryRouter>
        <ConversationTicketsPanel
          conversationId="301"
          onCreateTicket={onCreateTicket}
          refreshKey={1}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("button", { name: /新建待处理工单/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "待处理" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(api.getConversationTickets).toHaveBeenLastCalledWith("301", {
      filter: "active",
      page: 1,
      pageSize: 20,
    });
  });

  it("opens ticket details in a drawer and returns to the conversation panel on close", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /查看工单 跟进退款/ }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "工单详情 501" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "模拟详情更新" }));
    expect(api.getConversationTickets).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(api.getConversationTickets).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("tab", { name: "待处理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /查看工单 跟进退款/ })).toBeInTheDocument();
  });

  it("does not offer list claiming and updates status with the expected state", async () => {
    const user = userEvent.setup();
    api.getConversationTickets.mockResolvedValue(
      response([{ ...listTicket, assignee: null, canEdit: true }]),
    );

    const { rerender } = renderPanel();
    await user.click(
      await screen.findByRole("button", { name: "更多工单操作" }),
    );
    expect(screen.queryByRole("menuitem", { name: "分配给我" })).not.toBeInTheDocument();

    api.getConversationTickets.mockResolvedValue(response([listTicket]));
    rerender(
      <MemoryRouter>
        <ConversationTicketsPanel conversationId="301" refreshKey={1} />
      </MemoryRouter>,
    );
    await user.click(
      await screen.findByRole("button", { name: "更多工单操作" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "标记为已解决" }),
    );
    await waitFor(() =>
      expect(api.updateTicket).toHaveBeenCalledWith("501", {
        expectedStatus: "open",
        status: "done",
      }),
    );
    expect(ticketCounts.refreshTicketCounts).toHaveBeenCalledOnce();
  });

  it("reloads the ticket list after a state conflict", async () => {
    const conflict = Object.assign(new Error("工单状态已变化，请刷新后重试"), {
      code: "TICKET_STATE_CONFLICT",
    });
    api.getConversationTickets
      .mockReset()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([{ ...listTicket, status: "done" }]));
    api.updateTicket.mockRejectedValueOnce(conflict);
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "更多工单操作" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "标记为已解决" }),
    );
    await waitFor(() => {
      expect(api.updateTicket).toHaveBeenCalledWith("501", {
        expectedStatus: "open",
        status: "done",
      });
    });
    await waitFor(() => expect(api.getConversationTickets).toHaveBeenCalledTimes(2));
    expect(
      within(await screen.findByRole("article")).getByText("已完成"),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("工单状态已变化，请刷新后重试");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show a previous response after the filter changes", async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    api.getConversationTickets
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValueOnce(response([{
        ...listTicket,
        status: "done",
        ticketId: "601",
        title: "已完成工单",
      }]));

    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("tab", { name: "已完成" }));

    expect(await screen.findByRole("button", { name: /已完成工单/ })).toBeInTheDocument();
    resolveFirst(response([{ ...listTicket, title: "旧客户工单" }]));
    await waitFor(() => expect(screen.queryByText("旧客户工单")).not.toBeInTheDocument());
  });
});

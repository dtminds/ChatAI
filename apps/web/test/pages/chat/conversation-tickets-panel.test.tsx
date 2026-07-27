import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ticket } from "@chatai/contracts";
import { ConversationTicketsPanel } from "@/pages/chat/tickets/conversation-tickets-panel";

const api = vi.hoisted(() => ({
  claimTicket: vi.fn(),
  getConversationTickets: vi.fn(),
  updateTicket: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);

const ticket: Ticket = {
  anchorMessageId: null,
  assignee: { displayName: "客服甲", subUserId: "101" },
  canClaim: false,
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
  dueHint: null,
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

function response(scope: "conversation" | "customer", items: Ticket[] = [ticket]) {
  return {
    activeCount: items.length,
    items,
    page: 1,
    pageSize: 20,
    scope,
    total: items.length,
    totalPages: 1,
  };
}

beforeEach(() => {
  api.getConversationTickets.mockReset().mockResolvedValue(response("conversation"));
  api.claimTicket.mockReset().mockResolvedValue({ ticket });
  api.updateTicket.mockReset().mockResolvedValue({ ticket });
});

function renderPanel(props: Partial<React.ComponentProps<typeof ConversationTicketsPanel>> = {}) {
  return render(
    <MemoryRouter>
      <ConversationTicketsPanel conversationId="301" {...props} />
    </MemoryRouter>,
  );
}

describe("ConversationTicketsPanel", () => {
  it("switches between current conversation and customer-visible tickets", async () => {
    const user = userEvent.setup();
    api.getConversationTickets
      .mockResolvedValueOnce(response("conversation"))
      .mockResolvedValueOnce(response("customer", [{ ...ticket, ticketId: "502", title: "其他聊天工单" }]));

    renderPanel();
    expect(await screen.findByRole("link", { name: /跟进退款/ })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /该客户/ }));
    expect(await screen.findByRole("link", { name: /其他聊天工单/ })).toBeInTheDocument();
    expect(api.getConversationTickets).toHaveBeenLastCalledWith("301", {
      page: 1,
      pageSize: 20,
      scope: "customer",
    });
  });

  it("claims unassigned tickets and updates status with the expected state", async () => {
    const user = userEvent.setup();
    api.getConversationTickets.mockResolvedValue(
      response("conversation", [{ ...ticket, assignee: null, canClaim: true, canEdit: false }]),
    );

    const { rerender } = renderPanel();
    await user.click(await screen.findByRole("button", { name: "领取" }));
    await waitFor(() => expect(api.claimTicket).toHaveBeenCalledWith("501"));

    api.getConversationTickets.mockResolvedValue(response("conversation"));
    rerender(
      <MemoryRouter>
        <ConversationTicketsPanel conversationId="301" refreshKey={1} />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "完成" }));
    await waitFor(() =>
      expect(api.updateTicket).toHaveBeenCalledWith("501", {
        expectedStatus: "open",
        status: "done",
      }),
    );
  });

  it("does not show a previous conversation response after the scope changes", async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    api.getConversationTickets
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValueOnce(response("conversation", [{ ...ticket, ticketId: "601", title: "新客户工单" }]));

    const { rerender } = renderPanel();
    rerender(
      <MemoryRouter>
        <ConversationTicketsPanel conversationId="302" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: /新客户工单/ })).toBeInTheDocument();
    resolveFirst(response("conversation", [{ ...ticket, title: "旧客户工单" }]));
    await waitFor(() => expect(screen.queryByText("旧客户工单")).not.toBeInTheDocument());
  });
});

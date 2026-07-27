import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketDetailPage } from "@/pages/chat/tickets/ticket-detail-page";

const api = vi.hoisted(() => ({
  addTicketComment: vi.fn(), claimTicket: vi.fn(), getTicketDetail: vi.fn(), updateTicket: vi.fn(),
}));
vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);
vi.mock("@/pages/chat/insights/insight-detail-panel", () => ({ adaptInsightMessages: (messages: unknown[]) => messages }));
vi.mock("@/pages/chat/components/message-history-side-panel", () => ({
  HistoryCompactMessageList: ({ messages }: { messages: unknown[] }) => <div data-testid="messages">{messages.length}</div>,
}));

const baseDetail = {
  activities: [{ activityId: "1", activityType: "created", content: null, createdAt: 1, detail: null, operator: null, operatorType: "ai", ticketId: "501" }],
  assigneeOptions: [{ displayName: "客服甲", subUserId: "101" }],
  context: { kind: "session", messages: [{ seq: 1 }], sessionId: "401" },
  contextAccess: "allowed",
  evidenceMessages: [],
  ticket: {
    anchorMessageId: null, assignee: null, canClaim: true, canEdit: true, canceledAt: null, completedAt: null,
    conversationId: "301", createdAt: 1, createdBy: null, customerAvatarUrl: null, customerName: "客户",
    description: null, dueAt: null, dueHint: null, overdue: false, ownerAccountAvatarUrl: null,
    ownerAccountId: "201", ownerAccountName: "账号", priority: "medium", sessionId: "401", snapshotId: null,
    sourceType: "ai", status: "open", ticketId: "501", title: "跟进退款", updatedAt: 2,
  },
} as const;

beforeEach(() => {
  api.getTicketDetail.mockResolvedValue(baseDetail);
  api.updateTicket.mockResolvedValue({ ticket: baseDetail.ticket });
  api.claimTicket.mockResolvedValue({ ticket: baseDetail.ticket });
  api.addTicketComment.mockResolvedValue({ activity: baseDetail.activities[0] });
});

function renderPage() {
  return render(<MemoryRouter initialEntries={["/chat/tickets/501"]}><Routes><Route element={<TicketDetailPage />} path="/chat/tickets/:ticketId" /></Routes></MemoryRouter>);
}

describe("TicketDetailPage", () => {
  it("loads direct routes and sends expectedStatus with status changes", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    await user.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith("501", { expectedStatus: "open", status: "done" }));
    expect(screen.getByTestId("messages")).toHaveTextContent("1");
  });

  it("does not expose mutation controls without write permission and separates forbidden context", async () => {
    api.getTicketDetail.mockResolvedValueOnce({ ...baseDetail, context: { kind: "none" }, contextAccess: "forbidden", ticket: { ...baseDetail.ticket, canClaim: false, canEdit: false } });
    renderPage(); await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.queryByRole("button", { name: "完成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).not.toBeInTheDocument();
    expect(screen.getByText("无权查看关联聊天")).toBeInTheDocument();
  });

  it("reloads after comments instead of fabricating timeline entries", async () => {
    const user = userEvent.setup(); renderPage(); await screen.findByRole("heading", { name: "跟进退款" });
    await user.type(screen.getByRole("textbox", { name: "添加处理备注" }), "已联系客户");
    await user.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(api.addTicketComment).toHaveBeenCalledWith("501", { content: "已联系客户" }));
    expect(api.getTicketDetail).toHaveBeenCalledTimes(2);
  });

  it("shows context failures without dropping the ticket", async () => {
    api.getTicketDetail.mockResolvedValueOnce({ ...baseDetail, context: { kind: "none" }, contextAccess: "error" });
    renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.getByText("关联聊天加载失败")).toBeInTheDocument();
  });
});

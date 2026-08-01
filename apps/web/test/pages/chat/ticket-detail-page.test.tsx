import type {
  Ticket,
  TicketClaimResponse,
  TicketCommentResponse,
  TicketUpdateResponse,
} from "@chatai/contracts";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TicketDetailContent,
  TicketDetailPage,
} from "@/pages/chat/tickets/ticket-detail-page";

const api = vi.hoisted(() => ({
  addTicketComment: vi.fn(), claimTicket: vi.fn(), deleteTicket: vi.fn(), getTicketActivities: vi.fn(), getTicketAssigneeOptions: vi.fn(), getTicketContext: vi.fn(), getTicketDetail: vi.fn(), updateTicket: vi.fn(),
}));
const ticketCounts = vi.hoisted(() => ({
  refreshTicketCounts: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);
vi.mock("@/pages/chat/tickets/ticket-count-store", () => ticketCounts);
vi.mock("sonner", () => ({ toast }));
vi.mock("@/pages/chat/insights/insight-detail-panel", () => ({ adaptInsightMessages: (messages: unknown[]) => messages }));
vi.mock("@/pages/chat/components/message-history-side-panel", () => ({
  HistoryCompactMessageList: ({ messages }: { messages: Array<{ seq?: number }> }) => (
    <div data-message-seqs={messages.map((message) => message.seq).join(",")} data-testid="messages">
      {messages.length}
    </div>
  ),
}));

const baseDetail = {
  activities: {
    hasMore: false,
    items: [{ activityId: "1", activityType: "created", content: null, createdAt: 1, detail: null, operator: null, operatorType: "ai", ticketId: "501" }],
    nextCursor: null,
  },
  assigneeOptions: [{ displayName: "客服甲", subUserId: "101" }],
  context: {
    hasMore: false,
    kind: "session",
    messages: [{ seq: 1 }],
    nextCursor: null,
    sessionId: "401",
  },
  contextAccess: "allowed",
  evidenceMessages: [],
  ticket: {
    anchorMessageId: null, assignee: null, canClaim: true, canDelete: false, canEdit: true, canceledAt: null, completedAt: null,
    conversationId: "301", createdAt: 1, createdBy: { displayName: "客服乙", subUserId: "102" }, customerAvatarUrl: "/customer.png", customerName: "客户张三",
    description: null, dueAt: null, overdue: false, ownerAccountAvatarUrl: "/account.png",
    ownerAccountId: "201", ownerAccountName: "账号", priority: "medium", sessionId: "401", snapshotId: null,
    sourceType: "ai", status: "open", ticketId: "501", title: "跟进退款", updatedAt: 2,
  },
} as const;

beforeEach(() => {
  toast.error.mockReset();
  api.getTicketDetail.mockResolvedValue({ ticket: baseDetail.ticket });
  api.getTicketContext.mockResolvedValue({ context: baseDetail.context, contextAccess: baseDetail.contextAccess });
  api.getTicketAssigneeOptions.mockResolvedValue({ items: baseDetail.assigneeOptions });
  api.updateTicket.mockResolvedValue({ ticket: baseDetail.ticket });
  api.claimTicket.mockResolvedValue({ ticket: baseDetail.ticket });
  api.deleteTicket.mockResolvedValue({ deleted: true });
  api.getTicketActivities.mockResolvedValue(baseDetail.activities);
  api.addTicketComment.mockResolvedValue({ activity: baseDetail.activities.items[0] });
  ticketCounts.refreshTicketCounts.mockReset().mockResolvedValue(undefined);
});

function renderPage(entry = "/chat/tickets/501") {
  return render(<MemoryRouter initialEntries={[entry]}><Routes><Route element={<TicketDetailPage />} path="/chat/tickets/:ticketId" /></Routes></MemoryRouter>);
}

function ticketFor(ticketId: string, title: string): Ticket {
  return { ...baseDetail.ticket, ticketId, title };
}

function TicketRouteHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate("/chat/tickets/502")} type="button">打开下一张工单</button>
      <TicketDetailPage />
    </>
  );
}

function ConversationOpenStateProbe() {
  const location = useLocation();

  return (
    <div data-testid="conversation-open-state">
      {JSON.stringify(location.state)}
    </div>
  );
}

function renderNavigablePage() {
  return render(
    <MemoryRouter initialEntries={["/chat/tickets/501"]}>
      <Routes>
        <Route element={<TicketRouteHarness />} path="/chat/tickets/:ticketId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TicketDetailPage", () => {
  it("renders the shared detail content in drawer mode without page navigation", async () => {
    render(
      <MemoryRouter>
        <TicketDetailContent presentation="drawer" ticketId="501" />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "跟进退款" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "返回工单列表" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "打开会话" })).toHaveAttribute(
      "href",
      "/chat/conversations/301",
    );
  });

  it("marks conversation links as intentional in-app opens", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/chat/tickets/501"]}>
        <Routes>
          <Route
            element={<TicketDetailContent presentation="drawer" ticketId="501" />}
            path="/chat/tickets/:ticketId"
          />
          <Route
            element={<ConversationOpenStateProbe />}
            path="/chat/conversations/:conversationId"
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "打开会话" }));

    expect(screen.getByTestId("conversation-open-state")).toHaveTextContent(
      JSON.stringify({ openConversation: true }),
    );
  });

  it("loads direct routes and sends expectedStatus with status changes", async () => {
    const user = userEvent.setup(); renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.getByRole("link", { name: "返回工单列表" })).toHaveAttribute(
      "href",
      "/chat/tickets?view=assigned_to_me_active",
    );
    expect(screen.getByText("客服乙")).toBeInTheDocument();
    expect(screen.getByText("客户张三")).toBeInTheDocument();
    expect(screen.queryByText("接待会话 401")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "标记为已解决" }));
    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith("501", { expectedStatus: "open", status: "done" }));
    expect(ticketCounts.refreshTicketCounts).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("messages")).toHaveTextContent("1");
  });

  it("keeps a successful update successful when refreshing activities fails", async () => {
    api.getTicketActivities
      .mockResolvedValueOnce(baseDetail.activities)
      .mockRejectedValueOnce(new Error("处理记录刷新失败"));
    api.updateTicket.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, status: "done" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "标记为已解决" }));

    await waitFor(() => {
      expect(api.updateTicket).toHaveBeenCalledWith("501", {
        expectedStatus: "open",
        status: "done",
      });
    });
    expect(toast.error).not.toHaveBeenCalledWith("工单更新失败");
    expect(await screen.findByText("处理记录刷新失败")).toBeInTheDocument();
  });

  it("keeps a successful claim successful when refreshing activities fails", async () => {
    api.getTicketActivities
      .mockResolvedValueOnce(baseDetail.activities)
      .mockRejectedValueOnce(new Error("处理记录刷新失败"));
    api.claimTicket.mockResolvedValueOnce({
      ticket: {
        ...baseDetail.ticket,
        assignee: { displayName: "客服甲", subUserId: "101" },
        canClaim: false,
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "分配给我" }));

    await waitFor(() => expect(api.claimTicket).toHaveBeenCalledWith("501"));
    expect(toast.error).not.toHaveBeenCalledWith("分配失败");
    expect(await screen.findByText("处理记录刷新失败")).toBeInTheDocument();
  });

  it("clears saving after a state conflict reloads the ticket", async () => {
    const conflict = Object.assign(new Error("工单状态已变化，请刷新后重试"), {
      code: "TICKET_STATE_CONFLICT",
    });
    api.updateTicket.mockRejectedValueOnce(conflict);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "标记为已解决" }));

    await waitFor(() => expect(api.getTicketDetail).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "分配给我" })).not.toBeDisabled();
    });
  });

  it("returns to the ticket view used to open the detail", async () => {
    renderPage("/chat/tickets/501?view=reception");

    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.getByRole("link", { name: "返回工单列表" })).toHaveAttribute(
      "href",
      "/chat/tickets?view=reception",
    );
  });

  it("allows an eligible creator to confirm deletion and returns to the originating view", async () => {
    api.getTicketDetail.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, canDelete: true, sourceType: "manual" },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/chat/tickets/501?view=created_by_me"]}>
        <Routes>
          <Route element={<TicketDetailPage />} path="/chat/tickets/:ticketId" />
          <Route element={<div>工单列表</div>} path="/chat/tickets" />
        </Routes>
      </MemoryRouter>,
    );

    await user.hover(await screen.findByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除工单" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(api.deleteTicket).toHaveBeenCalledWith("501"));
    expect(ticketCounts.refreshTicketCounts).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("工单列表")).toBeInTheDocument();
  });

  it("does not expose deletion when the ticket is not deletable", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.queryByRole("button", { name: "更多操作" })).not.toBeInTheDocument();
  });

  it("closes the confirmation and reports deletion failures with a toast", async () => {
    api.getTicketDetail.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, canDelete: true, sourceType: "manual" },
    });
    api.deleteTicket.mockRejectedValueOnce(new Error("删除失败，请稍后重试"));
    const user = userEvent.setup();
    renderPage();

    await user.hover(await screen.findByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除工单" }));
    await user.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(toast.error).toHaveBeenCalledWith("删除失败，请稍后重试");
    expect(screen.queryByText("删除失败，请稍后重试")).not.toBeInTheDocument();
  });

  it("shows due-soon and overdue icons only for active tickets", async () => {
    const now = 1_785_216_000_000;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    api.getTicketDetail.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, dueAt: now + 29 * 60_000 },
    });
    const dueSoon = renderPage();

    expect(await screen.findByLabelText("即将到期")).toBeInTheDocument();
    expect(screen.queryByText("逾期")).not.toBeInTheDocument();
    dueSoon.unmount();

    api.getTicketDetail.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, dueAt: now - 1 },
    });
    const overdue = renderPage();
    expect(await screen.findByText("逾期")).toBeInTheDocument();
    overdue.unmount();

    api.getTicketDetail.mockResolvedValueOnce({
      ticket: { ...baseDetail.ticket, dueAt: now - 1, status: "done" },
    });
    renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.queryByText("逾期")).not.toBeInTheDocument();
    dateNow.mockRestore();
  });

  it("starts processing through a separate action after the ticket is assigned", async () => {
    const user = userEvent.setup();
    api.getTicketDetail.mockResolvedValueOnce({
      ...baseDetail,
      ticket: {
        ...baseDetail.ticket,
        assignee: { displayName: "客服甲", subUserId: "101" },
        canClaim: false,
      },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "开始处理" }));
    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith("501", {
      expectedStatus: "open",
      status: "in_progress",
    }));
  });

  it("renders activity operations on the first line and changes as their details", async () => {
    api.getTicketActivities.mockResolvedValueOnce({
        hasMore: false,
        items: [
          {
            activityId: "3",
            activityType: "status_changed",
            content: null,
            createdAt: 2,
            detail: { after: "in_progress", before: "open" },
            operator: { displayName: "客服甲", subUserId: "101" },
            operatorType: "sub_user",
            ticketId: "501",
          },
          {
            activityId: "2",
            activityType: "comment_added",
            content: "已联系客户确认退款账户",
            createdAt: 1,
            detail: null,
            operator: { displayName: "客服甲", subUserId: "101" },
            operatorType: "sub_user",
            ticketId: "501",
          },
        ],
        nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText("添加评论")).toBeInTheDocument();
    expect(screen.getByText("已联系客户确认退款账户")).toBeInTheDocument();
    expect(screen.getByText("更新状态")).toBeInTheDocument();
    expect(screen.getByLabelText("待处理 → 处理中")).toBeInTheDocument();
  });

  it("renders one edit activity with a separate block for every changed field", async () => {
    api.getTicketActivities.mockResolvedValueOnce({
        hasMore: false,
        items: [{
          activityId: "4",
          activityType: "content_updated",
          content: null,
          createdAt: 3,
          detail: {
            changes: [
              { after: "high", before: "medium", field: "priority" },
              { after: 1_785_254_400_000, before: null, field: "dueAt" },
              { after: "客户已补充退款账号", before: null, field: "description" },
            ],
          },
          operator: { displayName: "客服甲", subUserId: "101" },
          operatorType: "sub_user",
          ticketId: "501",
        }],
        nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText("编辑工单")).toBeInTheDocument();
    expect(screen.getByLabelText("优先级：中 → 高")).toBeInTheDocument();
    expect(screen.getByLabelText(/^截止时间：未设置 →/)).toBeInTheDocument();
    expect(screen.getByText("描述已更新")).toBeInTheDocument();
    expect(screen.getAllByTestId("ticket-activity-item")).toHaveLength(1);
  });

  it("groups activity records by calendar date", async () => {
    api.getTicketActivities.mockResolvedValueOnce({
        hasMore: false,
        items: [
          {
            activityId: "3",
            activityType: "comment_added",
            content: "第二天的评论",
            createdAt: new Date(2024, 0, 2, 13, 12).getTime(),
            detail: null,
            operator: { displayName: "客服甲", subUserId: "101" },
            operatorType: "sub_user",
            ticketId: "501",
          },
          {
            activityId: "2",
            activityType: "created",
            content: null,
            createdAt: new Date(2024, 0, 1, 16, 11).getTime(),
            detail: null,
            operator: null,
            operatorType: "system",
            ticketId: "501",
          },
        ],
        nextCursor: null,
    });
    renderPage();

    expect(await screen.findByRole("heading", { level: 3, name: "2024年1月2日" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2024年1月1日" })).toBeInTheDocument();
  });

  it("renders assignee changes with display names instead of internal IDs", async () => {
    api.getTicketActivities.mockResolvedValueOnce({
        hasMore: false,
        items: [{
          activityId: "2",
          activityType: "content_updated",
          content: null,
          createdAt: 2,
          detail: { changes: [{ after: "101", afterLabel: "客服甲", before: null, beforeLabel: "未分配", field: "assignee" }] },
          operator: { displayName: "客服乙", subUserId: "102" },
          operatorType: "sub_user",
          ticketId: "501",
        }],
        nextCursor: null,
    });
    renderPage();

    expect(await screen.findByLabelText("负责人：未分配 → 客服甲")).toBeInTheDocument();
    expect(screen.queryByText("未分配 → 子账号 101")).not.toBeInTheDocument();
  });

  it.each([
    { canceledAt: null, completedAt: 1_720_000_000_000, hiddenLabel: "取消时间", status: "done" as const, visibleLabel: "完成时间" },
    { canceledAt: 1_721_000_000_000, completedAt: null, hiddenLabel: "完成时间", status: "canceled" as const, visibleLabel: "取消时间" },
  ])("shows only the timestamp for the current $status status", async ({ canceledAt, completedAt, hiddenLabel, status, visibleLabel }) => {
    api.getTicketDetail.mockResolvedValueOnce({
      ...baseDetail,
      ticket: {
        ...baseDetail.ticket,
        canceledAt,
        completedAt,
        status,
      },
    });
    renderPage();

    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.getByText(visibleLabel)).toBeInTheDocument();
    expect(screen.queryByText(hiddenLabel)).not.toBeInTheDocument();
  });

  it("keeps mutable fields read-only until editing and saves the edit form", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.queryByRole("textbox", { name: "标题" })).not.toBeInTheDocument();
    expect(api.getTicketAssigneeOptions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await waitFor(() => expect(api.getTicketAssigneeOptions).toHaveBeenCalledWith("501"));
    const titleInput = screen.getByRole("textbox", { name: "标题" });
    expect(titleInput).toHaveAttribute("maxLength", "120");
    expect(screen.getByRole("textbox", { name: "描述" })).toHaveAttribute("maxLength", "2000");
    expect(screen.getByText("0/2000")).toBeInTheDocument();
    await user.clear(titleInput);
    await user.type(titleInput, "确认退款进度");
    await user.click(screen.getByRole("radio", { name: "高" }));
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith("501", {
      assigneeSubUserId: null,
      description: null,
      dueAt: null,
      priority: "high",
      title: "确认退款进度",
    }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "标题" })).not.toBeInTheDocument());
  });

  it("does not expose mutation controls without write permission and separates forbidden context", async () => {
    api.getTicketDetail.mockResolvedValueOnce({ ticket: { ...baseDetail.ticket, canClaim: false, canEdit: false } });
    api.getTicketContext.mockResolvedValueOnce({ context: { kind: "none" }, contextAccess: "forbidden" });
    renderPage(); await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.queryByRole("button", { name: "标记为已解决" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.getByText("无权查看关联聊天")).toBeInTheDocument();
  });

  it("prepends the authoritative activity returned after adding a comment", async () => {
    api.addTicketComment.mockResolvedValueOnce({
      activity: {
        activityId: "2",
        activityType: "comment_added",
        content: "已联系客户",
        createdAt: 3,
        detail: null,
        operator: { displayName: "客服甲", subUserId: "101" },
        operatorType: "sub_user",
        ticketId: "501",
      },
    });
    const user = userEvent.setup(); renderPage(); await screen.findByRole("heading", { name: "跟进退款" });
    const commentInput = screen.getByRole("textbox", { name: "添加评论" });
    expect(commentInput).toHaveAttribute("maxlength", "1000");
    expect(commentInput).toHaveAttribute("rows", "1");
    expect(screen.queryByRole("button", { name: "添加" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument();

    await user.type(commentInput, "已联系客户");
    expect(commentInput).toHaveAttribute("rows", "4");
    await user.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(api.addTicketComment).toHaveBeenCalledWith("501", { content: "已联系客户" }));
    const activities = screen.getAllByTestId("ticket-activity-item");
    expect(activities.map((item) => item.getAttribute("data-activity-id"))).toEqual(["2", "1"]);
    expect(api.getTicketDetail).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "添加" })).not.toBeInTheDocument();
  });

  it("cancels an expanded comment without creating an activity", async () => {
    const user = userEvent.setup();
    renderPage();
    const commentInput = await screen.findByRole("textbox", { name: "添加评论" });

    await user.type(commentInput, "暂不提交");
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(commentInput).toHaveValue("");
    expect(commentInput).toHaveAttribute("rows", "1");
    expect(api.addTicketComment).not.toHaveBeenCalled();
  });

  it("collapses an empty comment when focus leaves the editor", async () => {
    const user = userEvent.setup();
    renderPage();
    const commentInput = await screen.findByRole("textbox", { name: "添加评论" });

    await user.click(commentInput);
    expect(commentInput).toHaveAttribute("rows", "4");
    expect(screen.getByRole("button", { name: "添加" })).toBeInTheDocument();

    await user.tab();

    expect(commentInput).toHaveAttribute("rows", "1");
    expect(screen.queryByRole("button", { name: "添加" })).not.toBeInTheDocument();
  });

  it("appends older cursor pages below the latest activities", async () => {
    api.getTicketActivities.mockResolvedValueOnce({
        hasMore: true,
        items: [{
          activityId: "3",
          activityType: "created",
          content: null,
          createdAt: 3,
          detail: null,
          operator: null,
          operatorType: "ai",
          ticketId: "501",
        }],
        nextCursor: "3",
    });
    api.getTicketActivities.mockResolvedValueOnce({
      hasMore: false,
      items: [{
        activityId: "2",
        activityType: "comment_added",
        content: "更早的评论",
        createdAt: 2,
        detail: null,
        operator: null,
        operatorType: "system",
        ticketId: "501",
      }],
      nextCursor: null,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(api.getTicketActivities).toHaveBeenCalledWith("501", {
      beforeActivityId: "3",
      pageSize: 20,
    }));
    expect(screen.getAllByTestId("ticket-activity-item").map(
      (item) => item.getAttribute("data-activity-id"),
    )).toEqual(["3", "2"]);
  });

  it("shows context failures without dropping the ticket", async () => {
    api.getTicketContext.mockResolvedValueOnce({ context: { kind: "none" }, contextAccess: "error" });
    renderPage();
    await screen.findByRole("heading", { name: "跟进退款" });
    expect(screen.getByText("关联聊天加载失败")).toBeInTheDocument();
  });

  it("loads older session messages on demand and prepends them in conversation order", async () => {
    api.getTicketContext
      .mockResolvedValueOnce({
        context: {
          hasMore: true,
          kind: "session",
          messages: [{ seq: 3 }, { seq: 4 }],
          nextCursor: "cursor-1",
          sessionId: "401",
        },
        contextAccess: "allowed",
      })
      .mockResolvedValueOnce({
        context: {
          hasMore: false,
          kind: "session",
          messages: [{ seq: 1 }, { seq: 2 }],
          nextCursor: null,
          sessionId: "401",
        },
        contextAccess: "allowed",
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "加载更早消息" }));
    await waitFor(() => expect(api.getTicketContext).toHaveBeenLastCalledWith("501", {
      cursor: "cursor-1",
      pageSize: 50,
    }));
    expect(screen.getByTestId("messages")).toHaveAttribute("data-message-seqs", "1,2,3,4");
    expect(screen.queryByRole("button", { name: "加载更早消息" })).not.toBeInTheDocument();
  });

  it("does not let an older ticket response replace the current route", async () => {
    let resolveFirst!: (value: { ticket: typeof baseDetail.ticket }) => void;
    api.getTicketDetail
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ticket: { ...baseDetail.ticket, ticketId: "502", title: "确认发票" } });

    function NavigateToCurrentTicket() {
      const navigate = useNavigate();
      useEffect(() => { navigate("/chat/tickets/502"); }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/chat/tickets/501"]}>
        <Routes>
          <Route
            element={<><NavigateToCurrentTicket /><TicketDetailPage /></>}
            path="/chat/tickets/:ticketId"
          />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "确认发票" });
    resolveFirst({ ticket: baseDetail.ticket });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("heading", { name: "跟进退款" })).not.toBeInTheDocument();
  });

  it("does not let an older update response replace the current route", async () => {
    let resolveUpdate!: (value: TicketUpdateResponse) => void;
    api.getTicketDetail.mockImplementation((requestedTicketId: string) => Promise.resolve({
      ticket: requestedTicketId === "502"
        ? ticketFor("502", "确认发票")
        : ticketFor("501", "跟进退款"),
    }));
    api.updateTicket.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpdate = resolve;
    }));

    const user = userEvent.setup();
    renderNavigablePage();

    await user.click(await screen.findByRole("button", { name: "标记为已解决" }));
    await waitFor(() => expect(api.updateTicket).toHaveBeenCalledWith("501", {
      expectedStatus: "open",
      status: "done",
    }));
    await user.click(screen.getByRole("button", { name: "打开下一张工单" }));
    await screen.findByRole("heading", { name: "确认发票" });

    await act(async () => {
      resolveUpdate({ ticket: { ...ticketFor("501", "已解决的退款工单"), status: "done" } });
    });

    expect(screen.getByRole("heading", { name: "确认发票" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "已解决的退款工单" })).not.toBeInTheDocument();
  });

  it("does not let an older comment response enter the current timeline", async () => {
    let resolveComment!: (value: TicketCommentResponse) => void;
    api.getTicketDetail.mockImplementation((requestedTicketId: string) => Promise.resolve({
      ticket: requestedTicketId === "502"
        ? ticketFor("502", "确认发票")
        : ticketFor("501", "跟进退款"),
    }));
    api.getTicketActivities.mockImplementation((requestedTicketId: string) => Promise.resolve(
      requestedTicketId === "502"
        ? {
            hasMore: false,
            items: [{
              activityId: "5021",
              activityType: "comment_added",
              content: "发票工单记录",
              createdAt: 2,
              detail: null,
              operator: null,
              operatorType: "system",
              ticketId: "502",
            }],
            nextCursor: null,
          }
        : baseDetail.activities,
    ));
    api.addTicketComment.mockImplementationOnce(() => new Promise((resolve) => {
      resolveComment = resolve;
    }));

    const user = userEvent.setup();
    renderNavigablePage();

    const commentInput = await screen.findByRole("textbox", { name: "添加评论" });
    await user.type(commentInput, "退款工单旧评论");
    await user.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => expect(api.addTicketComment).toHaveBeenCalledWith("501", {
      content: "退款工单旧评论",
    }));
    await user.click(screen.getByRole("button", { name: "打开下一张工单" }));
    await screen.findByText("发票工单记录");

    await act(async () => {
      resolveComment({
        activity: {
          activityId: "5012",
          activityType: "comment_added",
          content: "退款工单旧评论",
          createdAt: 3,
          detail: null,
          operator: null,
          operatorType: "system",
          ticketId: "501",
        },
      });
    });

    expect(screen.getByText("发票工单记录")).toBeInTheDocument();
    expect(screen.queryByText("退款工单旧评论")).not.toBeInTheDocument();
  });

  it("does not let an older claim response replace the current route", async () => {
    let resolveClaim!: (value: TicketClaimResponse) => void;
    api.getTicketDetail.mockImplementation((requestedTicketId: string) => Promise.resolve({
      ticket: requestedTicketId === "502"
        ? ticketFor("502", "确认发票")
        : ticketFor("501", "跟进退款"),
    }));
    api.claimTicket.mockImplementationOnce(() => new Promise((resolve) => {
      resolveClaim = resolve;
    }));

    const user = userEvent.setup();
    renderNavigablePage();

    await user.click(await screen.findByRole("button", { name: "分配给我" }));
    await waitFor(() => expect(api.claimTicket).toHaveBeenCalledWith("501"));
    await user.click(screen.getByRole("button", { name: "打开下一张工单" }));
    await screen.findByRole("heading", { name: "确认发票" });

    await act(async () => {
      resolveClaim({
        ticket: {
          ...ticketFor("501", "已领取的退款工单"),
          assignee: { displayName: "客服甲", subUserId: "101" },
          canClaim: false,
        },
      });
    });

    expect(screen.getByRole("heading", { name: "确认发票" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "已领取的退款工单" })).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketCreateDialog } from "@/pages/chat/tickets/ticket-create-dialog";

const api = vi.hoisted(() => ({
  createTicket: vi.fn(),
  getTicketContextOptions: vi.fn(),
}));
const ticketCounts = vi.hoisted(() => ({
  refreshTicketCounts: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);
vi.mock("@/pages/chat/tickets/ticket-count-store", () => ticketCounts);

const contextOptions = {
  assignees: [
    { displayName: "客服甲", subUserId: "101" },
    { displayName: "客服乙", subUserId: "102" },
  ],
  defaultAssigneeSubUserId: "101",
  sessions: [{
    endedAt: 200,
    sessionId: "401",
    startedAt: 100,
    status: "ended",
    summary: "退款沟通",
    title: null,
  }],
} as const;

beforeEach(() => {
  api.getTicketContextOptions.mockReset().mockResolvedValue(contextOptions);
  api.createTicket.mockReset().mockResolvedValue({
    ticket: { ticketId: "501" },
  });
  ticketCounts.refreshTicketCounts.mockReset().mockResolvedValue(undefined);
});

describe("TicketCreateDialog", () => {
  it("keeps the options loading status inside the assignee control", async () => {
    let resolveOptions!: (value: typeof contextOptions) => void;
    api.getTicketContextOptions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOptions = resolve;
      }),
    );

    render(
      <TicketCreateDialog
        conversationId="301"
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    const assignee = screen.getByRole("combobox", { name: "负责人" });
    expect(within(assignee).getByRole("status")).toBeInTheDocument();

    resolveOptions(contextOptions);
    await waitFor(() =>
      expect(within(assignee).queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("uses the current reception session and server-provided default assignee", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();

    render(
      <TicketCreateDialog
        conversationId="301"
        onCreated={onCreated}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "负责人" })).toHaveTextContent(
        "客服甲",
      ),
    );
    expect(screen.getByRole("combobox", { name: "关联接待会话" })).toHaveTextContent(
      "当前会话",
    );
    await user.hover(screen.getByRole("button", { name: "关联接待会话说明" }));
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "负责人" })).toHaveTextContent(
      "客服甲",
    );
    expect(screen.getByRole("textbox", { name: "标题" })).toHaveAttribute("maxLength", "120");
    expect(screen.getByRole("textbox", { name: "描述" })).toHaveAttribute("maxLength", "2000");
    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(api.getTicketContextOptions).toHaveBeenCalledWith({ conversationId: "301" });
    expect(screen.getByRole("radio", { name: "中" })).toHaveAttribute("data-state", "on");

    await user.type(screen.getByRole("textbox", { name: "标题" }), " 跟进退款 ");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() =>
      expect(api.createTicket).toHaveBeenCalledWith({
        assigneeSubUserId: "101",
        context: { type: "current" },
        conversationId: "301",
        description: null,
        dueAt: null,
        priority: "medium",
        title: "跟进退款",
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ ticketId: "501" }));
    expect(ticketCounts.refreshTicketCounts).toHaveBeenCalledTimes(1);
  });

  it("offers only the returned recent sessions and allows creating without context", async () => {
    const user = userEvent.setup();

    render(
      <TicketCreateDialog
        conversationId="301"
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await user.click(await screen.findByRole("combobox", { name: "关联接待会话" }));
    expect(screen.queryByRole("button", { name: "加载更多接待会话" })).not.toBeInTheDocument();
    expect(api.getTicketContextOptions).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await user.click(screen.getByRole("option", { name: "不关联" }));
    await user.type(screen.getByRole("textbox", { name: "标题" }), "线下沟通跟进");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() =>
      expect(api.createTicket).toHaveBeenCalledWith(
        expect.objectContaining({ context: { type: "none" } }),
      ),
    );
    expect(screen.queryByRole("button", { name: /消息/ })).not.toBeInTheDocument();
  });

  it("keeps entered values after a failed submission", async () => {
    const user = userEvent.setup();
    api.createTicket.mockRejectedValueOnce(new Error("创建失败"));

    render(
      <TicketCreateDialog
        conversationId="301"
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await screen.findByRole("combobox", { name: "负责人" });
    const title = screen.getByRole("textbox", { name: "标题" });
    await user.type(title, "需要保留的内容");
    await user.click(screen.getByRole("button", { name: "创建" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("创建失败");
    expect(title).toHaveValue("需要保留的内容");
  });

  it("falls back to the backend default assignee when options fail to load", async () => {
    const user = userEvent.setup();
    api.getTicketContextOptions.mockRejectedValueOnce(new Error("选项加载失败"));

    render(
      <TicketCreateDialog
        conversationId="301"
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
      />,
    );

    await screen.findByRole("alert");
    await user.type(screen.getByRole("textbox", { name: "标题" }), "继续跟进");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(api.createTicket).toHaveBeenCalledTimes(1));
    expect(api.createTicket.mock.calls[0]?.[0]).not.toHaveProperty("assigneeSubUserId");
  });
});

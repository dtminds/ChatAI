import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageHistorySidePanel } from "@/pages/chat/components/message-history-side-panel";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";

describe("MessageHistorySidePanel", () => {
  it("uses a compact underline tab layout for history scopes", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const tabs = screen.getByRole("tablist");
    const activeTab = screen.getByRole("tab", { name: "全部" });

    expect(screen.getByRole("complementary", { name: "聊天记录" })).toBeInTheDocument();
    expect(screen.getByText("聊天记录")).toHaveClass("text-sm");
    expect(screen.queryByText("测试客户")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭聊天记录" })).toBeInTheDocument();
    expect(tabs).toHaveClass("w-full", "justify-start", "border-b", "border-divider", "px-4");
    expect(tabs).not.toHaveClass("rounded-2xl", "bg-secondary/90", "grid");
    expect(activeTab).toHaveClass("border-b-2", "text-sm");
    expect(activeTab).not.toHaveClass("text-base", "text-lg");
  });

  it("renders the history filter controls in the header without search", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText("搜索聊天记录")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送人" })).toHaveClass("h-8", "py-0", "text-[12px]");
    expect(screen.getByRole("button", { name: "日期" })).toHaveClass("h-8", "py-0", "text-[12px]");
  });

  it("does not show empty state while loading history data", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "file" }}
        activeHistoryLoading
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();
  });

  it("keeps existing history items visible while loading more data", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [createTextMessage("message-loading", "已有消息")],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(screen.getByText("已有消息")).toBeInTheDocument();
    expect(screen.queryByText("暂无历史记录")).not.toBeInTheDocument();
  });

  it("renders all-scope messages in a compact linear history layout", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "老郁，我下午三点去「茶甜甜」这个客户这里拜访", {
              author: "余圆圆",
              sentAt: "2026-03-09 10:30:45",
            }),
            createTextMessage("message-2", "OK", {
              author: "郁佳杰",
              sentAt: "2025-12-31 09:08:07",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyItems = screen.getAllByTestId("history-message-item");
    const compactText = screen.getAllByTestId("history-message-text")[0];

    expect(historyItems).toHaveLength(2);
    expect(historyItems[0]).toHaveClass("w-full", "max-w-full", "min-w-0", "items-start");
    expect(historyItems[0]).not.toHaveClass("justify-end", "justify-start");
    expect(screen.queryByRole("button", { name: "消息操作" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("message-row")).not.toBeInTheDocument();
    expect(screen.queryByTestId("text-message-bubble")).not.toBeInTheDocument();
    expect(screen.getByText("余圆圆")).toHaveClass("text-[13px]", "text-muted-foreground/80");
    expect(screen.getByText("3/9 10:30")).toHaveClass("text-xs", "text-muted-foreground/70");
    expect(screen.getByText("2025/12/31 09:08")).toHaveClass("text-xs", "text-muted-foreground/70");
    expect(screen.queryByText("10:30:45")).not.toBeInTheDocument();
    expect(compactText).toHaveTextContent("老郁，我下午三点去「茶甜甜」这个客户这里拜访");
    expect(compactText).toHaveClass("w-full", "max-w-full", "min-w-0", "break-words", "text-sm");
    expect(compactText).not.toHaveClass("w-max", "max-w-none", "whitespace-nowrap");
  });

  it("keeps long non-breaking history text inside the panel width", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createTextMessage(
              "message-long",
              "Welcome\u00a0to\u00a0BoomerHome\u00a0pet\u00a0service\u00a0platform!aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            ),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyText = screen.getByTestId("history-message-text");

    expect(historyText.textContent).not.toContain("\u00a0");
    expect(historyText).toHaveClass("w-full", "max-w-full", "min-w-0", "[overflow-wrap:anywhere]");
    expect(historyText).not.toHaveClass("w-max", "max-w-none", "whitespace-nowrap");
  });

  it("renders WeChat emoji tokens as inline images in compact history text", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [createTextMessage("message-emoji", "收到[微笑]")],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyText = screen.getByTestId("history-message-text");
    const emoji = screen.getByRole("img", { name: "微笑" });

    expect(historyText).toHaveTextContent("收到");
    expect(historyText).not.toHaveTextContent("[微笑]");
    expect(emoji).toHaveAttribute("src", expect.stringContaining("/face/微笑.png"));
    expect(emoji).toHaveClass("inline-block", "size-6");
  });

  it("renders quote messages without chat bubble alignment in history", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [
            createQuoteMessage({
              author: "范双飞test",
              quotedMessage: {
                contentType: "file",
                senderName: "余圆圆",
                title: "报价单.pdf",
              },
              text: "请看附件",
            }),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const historyItem = screen.getByTestId("history-message-item");
    const quoteText = screen.getByTestId("history-message-text");
    const quotePreview = screen.getByTestId("quote-generic-preview");
    const quoteIcon = screen.getByTestId("quote-file-attachment-icon");

    expect(historyItem).toHaveClass("items-start");
    expect(historyItem).not.toHaveClass("items-end", "justify-end");
    expect(quoteText).toHaveTextContent("请看附件");
    expect(quoteText).not.toHaveClass("rounded-", "bg-primary", "bg-muted");
    expect(screen.queryByTestId("text-message-bubble")).not.toBeInTheDocument();
    expect(quotePreview).toHaveClass("border-l-2", "text-[12px]");
    expect(quotePreview).toHaveTextContent("余圆圆");
    expect(quotePreview).toHaveTextContent("报价单.pdf");
    expect(screen.queryByText("引用消息不可用")).not.toBeInTheDocument();
    expect(quoteIcon).toHaveAttribute("data-icon-name", "file-empty-01");
  });

  it("fills the sidebar slot without overlay shadow or fixed width", () => {
    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: false,
          hasPrev: false,
          messages: [],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    const panel = screen.getByRole("complementary", { name: "聊天记录" });

    expect(panel).toHaveClass("absolute", "inset-0", "w-full", "border-l", "border-divider");
    expect(panel).not.toHaveClass("w-[420px]");
    expect(panel.className).not.toContain("shadow");
  });

  it("keeps the viewport anchored when older messages are prepended", async () => {
    const user = userEvent.setup();
    const handleLoadMorePrev = vi.fn();
    const conversation = createConversation();
    const { rerender } = render(
      <MessageHistorySidePanel
        activeConversation={conversation}
        activeHistory={{
          hasNext: true,
          hasPrev: true,
          messages: [
            createTextMessage("message-3", "第三条"),
            createTextMessage("message-4", "第四条"),
          ],
          nextCursor: "next",
          prevCursor: "prev",
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={handleLoadMorePrev}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );
    const viewport = screen.getByTestId("history-message-viewport");

    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = 120;

    await user.click(screen.getByRole("button", { name: "加载更早的对话" }));

    expect(handleLoadMorePrev).toHaveBeenCalledTimes(1);

    defineScrollMetric(viewport, "scrollHeight", 620);
    rerender(
      <MessageHistorySidePanel
        activeConversation={conversation}
        activeHistory={{
          hasNext: true,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
            createTextMessage("message-3", "第三条"),
            createTextMessage("message-4", "第四条"),
          ],
          nextCursor: "next",
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={vi.fn()}
        onLoadMorePrev={handleLoadMorePrev}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    expect(viewport.scrollTop).toBe(340);
  });

  it("triggers next history loading from the bottom loader", async () => {
    const user = userEvent.setup();
    const handleLoadMoreNext = vi.fn();

    render(
      <MessageHistorySidePanel
        activeConversation={createConversation()}
        activeHistory={{
          hasNext: true,
          hasPrev: false,
          messages: [
            createTextMessage("message-1", "第一条"),
            createTextMessage("message-2", "第二条"),
          ],
        }}
        activeHistoryFilters={{ scope: "all" }}
        activeHistoryLoading={false}
        groupMembers={[]}
        isOpen
        onClose={vi.fn()}
        onLoadMoreNext={handleLoadMoreNext}
        onLoadMorePrev={vi.fn()}
        onRefresh={vi.fn()}
        onSetDay={vi.fn()}
        onSetScope={vi.fn()}
        onSetSenderId={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "加载更多对话" }));

    expect(handleLoadMoreNext).toHaveBeenCalledTimes(1);
  });
});

function defineScrollMetric(
  element: HTMLElement,
  key: "clientHeight" | "scrollHeight",
  value: number,
) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
  });
}

function createConversation(): Conversation {
  return {
    accountId: "seat-1",
    customerAvatarUrl: "",
    customerId: "customer-1",
    customerName: "测试客户",
    id: "conversation-1",
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}

function createTextMessage(
  id: string,
  text: string,
  overrides: Partial<Pick<ChatMessage, "author" | "sentAt">> = {},
): ChatMessage {
  return {
    author: overrides.author ?? "客户",
    content: {
      text,
      type: "text",
    },
    conversationId: "conversation-1",
    id,
    role: "customer",
    sender: {
      id: "customer-1",
      name: "客户",
    },
    sentAt: overrides.sentAt ?? "2026-05-19 10:00:00",
    status: "read",
  };
}

function createQuoteMessage({
  author,
  text,
  quotedMessage,
}: {
  author: string;
  quotedMessage?: NonNullable<ChatMessage & { content: { type: "quote" } }>["content"]["quotedMessage"];
  text: string;
}): ChatMessage {
  return {
    author,
    content: {
      quoteMsgId: "quote-1",
      quotedMessage,
      text,
      type: "quote",
    },
    conversationId: "conversation-1",
    id: "quote-message-1",
    role: "agent",
    sender: {
      id: "agent-1",
      name: author,
    },
    sentAt: "2026-05-19 10:12:00",
    status: "read",
  };
}

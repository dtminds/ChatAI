import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageHistorySidePanel } from "@/pages/chat/components/message-history-side-panel";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";

describe("MessageHistorySidePanel", () => {
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

    const panel = screen.getByRole("complementary", { name: "历史记录" });

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

    await user.click(screen.getByRole("button", { name: "更早" }));

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

function createTextMessage(id: string, text: string): ChatMessage {
  return {
    author: "客户",
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
    sentAt: "2026-05-19 10:00:00",
    status: "read",
  };
}

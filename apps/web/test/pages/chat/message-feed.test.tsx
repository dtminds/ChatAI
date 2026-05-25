import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageRow, getMessageFeedItemKey } from "@/pages/chat/components/message-feed";
import type { ChatMessage } from "@/pages/chat/chat-types";

describe("message feed row actions", () => {
  it("opens an avatar anchored action menu with quote and mention actions for group messages", async () => {
    const user = userEvent.setup();
    const onMentionMessage = vi.fn();
    const onQuoteMessage = vi.fn();
    const message = {
      ...createTextMessage("群消息"),
      isGroupConversation: true,
      isOwnMessage: false,
      role: "customer" as const,
      sender: {
        groupMemberId: "member-001",
        id: "member-001",
        name: "成员甲",
      },
      senderDisplayName: "成员甲",
    };

    render(
      <MessageRow
        message={message}
        onMentionMessage={onMentionMessage}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));

    expect(onMentionMessage).toHaveBeenCalledWith(message);

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

    expect(onQuoteMessage).toHaveBeenCalledWith(message);
  });

  it("does not expose the mention action for single chat messages", async () => {
    const user = userEvent.setup();

    render(
      <MessageRow
        message={createTextMessage("单聊消息")}
        onMentionMessage={vi.fn()}
        onQuoteMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "@Ta" })).not.toBeInTheDocument();
  });

  it("keeps eligible message actions visible but disabled when actions are locked", async () => {
    const user = userEvent.setup();
    const onMentionMessage = vi.fn();
    const onQuoteMessage = vi.fn();
    const message = {
      ...createTextMessage("未接管群消息"),
      isGroupConversation: true,
      isOwnMessage: false,
      role: "customer" as const,
      sender: {
        groupMemberId: "member-001",
        id: "member-001",
        name: "成员甲",
      },
      senderDisplayName: "成员甲",
    };

    render(
      <MessageRow
        canUseMessageActions={false}
        message={message}
        onMentionMessage={onMentionMessage}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "@Ta" })).toHaveAttribute(
      "data-disabled",
    );
    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );

    await user.click(screen.getByRole("menuitem", { name: "@Ta" }));
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

    expect(onMentionMessage).not.toHaveBeenCalled();
    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("disables the quote action for revoked messages", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{ ...createTextMessage("已撤回原消息"), isRevoked: true }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("disables the quote action for contact card messages", async () => {
    const user = userEvent.setup();
    const onQuoteMessage = vi.fn();

    render(
      <MessageRow
        message={{
          ...createTextMessage("名片消息"),
          content: {
            avatarUrl: "https://example.com/avatar.png",
            name: "客户甲",
            type: "contact-card",
          },
        }}
        onQuoteMessage={onQuoteMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    expect(screen.getByRole("menuitem", { name: "引用消息" })).toHaveAttribute(
      "data-disabled",
    );
    await user.click(screen.getByRole("menuitem", { name: "引用消息" }));

    expect(onQuoteMessage).not.toHaveBeenCalled();
  });

  it("shows smart reply trigger icon for customer messages without suggestions", () => {
    render(
      <MessageRow
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          id: "msg-customer-1",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
        }}
      />,
    );

    expect(screen.getByTestId("smart-reply-trigger-icon")).toBeInTheDocument();
    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
  });

  it("calls smart reply trigger handler when the side icon is clicked", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "生成智能回复" }));

    expect(onTriggerSmartReply).toHaveBeenCalledWith(message);
  });

  it("hides smart reply trigger icon when a ready suggestion card is shown", () => {
    render(
      <MessageRow
        message={{
          content: { text: "客户想了解产品", type: "text" },
          conversationId: "conv-1",
          id: "msg-customer-1",
          role: "customer",
          sender: { id: "cus-1", name: "客户甲" },
          sentAt: "2026-05-25T10:00:00+08:00",
        }}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          status: "ready",
          versionCount: 1,
          versionIndex: 0,
        }}
      />,
    );

    expect(screen.queryByTestId("smart-reply-trigger-icon")).not.toBeInTheDocument();
    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
  });

  it("calls smart reply trigger handler when regenerate is selected", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    const message = {
      content: { text: "客户想了解产品", type: "text" },
      conversationId: "conv-1",
      id: "msg-customer-1",
      role: "customer",
      sender: { id: "cus-1", name: "客户甲" },
      sentAt: "2026-05-25T10:00:00+08:00",
      seq: 12,
    } as ChatMessage;

    render(
      <MessageRow
        message={message}
        onTriggerSmartReply={onTriggerSmartReply}
        smartReply={{
          assistantName: "护肤小助手",
          content: "建议先确认肤质",
          status: "ready",
          versionCount: 1,
          versionIndex: 0,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "智能回复调整" }));
    await user.click(screen.getByRole("menuitem", { name: "重新生成" }));

    expect(onTriggerSmartReply).toHaveBeenCalledWith(message);
  });

  it("keeps the feed item key stable after optimistic messages are reconciled", () => {
    const optimisticMessage = {
      ...createTextMessage("已确认消息"),
      clientMessageId: "local-001",
      id: "local-001",
      optNo: "opt-001",
      remoteMessageId: "opt-001",
      status: "accepted",
    } satisfies ChatMessage;
    const reconciledMessage = {
      ...optimisticMessage,
      id: "remote-001",
      remoteMessageId: "remote-001",
      status: "sent",
    } satisfies ChatMessage;

    expect(getMessageFeedItemKey(optimisticMessage)).toBe(
      getMessageFeedItemKey(reconciledMessage),
    );
  });
});

function createTextMessage(text: string) {
  return {
    author: "客服",
    content: {
      text,
      type: "text" as const,
    },
    conversationId: "conv-layout",
    id: "msg-text-layout",
    role: "agent" as const,
    sender: {
      id: "agent-layout",
      name: "客服",
    },
    sentAt: "2026-05-08 09:54:00",
    status: "sent" as const,
  } satisfies ChatMessage;
}

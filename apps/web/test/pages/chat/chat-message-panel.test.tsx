import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";

function createCustomerMessage(overrides: Partial<ChatMessage> = {}) {
  return {
    author: "客户甲",
    content: { text: "想了解产品", type: "text" },
    conversationId: "conv-001",
    id: "msg-001",
    rawMsgtype: "text",
    role: "customer",
    sender: { id: "cust-001", name: "客户甲" },
    sentAt: "2026-05-25T10:00:00+08:00",
    seq: 1,
    status: "sent",
    ...overrides,
  } satisfies ChatMessage;
}

function renderPanel({
  conversationMode = "single",
  messages = [createCustomerMessage()],
}: {
  conversationMode?: "single" | "group";
  messages?: ChatMessage[];
} = {}) {
  return render(
    <ChatMessagePanel
      activeHistoryStatus="idle"
      conversationId="conv-001"
      conversationMode={conversationMode}
      hasMoreHistory={false}
      isConversationLoading={false}
      messageViewportRef={createRef()}
      messages={messages}
      onLoadOlderMessages={vi.fn()}
      onMessageViewportScroll={vi.fn()}
      onRetryMessage={vi.fn()}
    />,
  );
}

describe("ChatMessagePanel smart reply state", () => {
  beforeEach(() => {
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("shows visible smart replies for the current single conversation", () => {
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "可展示的话术",
            pollComplete: true,
            status: "ready",
          },
        },
      },
    }));

    renderPanel();

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("可展示的话术")).toBeInTheDocument();
  });

  it("hides smart replies marked hidden for the current conversation", () => {
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "隐藏的话术",
            pollComplete: true,
            status: "ready",
          },
        },
      },
      smartReplyHiddenMessageKeysByConversationId: {
        ...state.smartReplyHiddenMessageKeysByConversationId,
        "conv-001": {
          "1": true,
        },
      },
    }));

    renderPanel();

    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(screen.queryByText("隐藏的话术")).not.toBeInTheDocument();
  });

  it("does not show smart replies in group conversations", () => {
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "群聊不展示的话术",
            pollComplete: true,
            status: "ready",
          },
        },
      },
    }));

    renderPanel({
      conversationMode: "group",
      messages: [
        createCustomerMessage({
          isGroupConversation: true,
          senderDisplayName: "客户甲",
        }),
      ],
    });

    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(screen.queryByText("群聊不展示的话术")).not.toBeInTheDocument();
  });
});

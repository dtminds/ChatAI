import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";

function createCustomerMessage(overrides: Partial<ChatMessage> = {}) {
  return {
    author: "客户甲",
    content: { text: "想了解产品", type: "text" },
    conversationId: "conv-001",
    msgid: "msg-001",
    rawMsgtype: "text",
    role: "customer",
    sender: { id: "cust-001", name: "客户甲" },
    sentAt: "2026-05-25T10:00:00+08:00",
    seq: 1,
    status: "sent",
    uiMessageKey: "1",
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

function enableSmartReplyDisplayContext(enabled = true) {
  useWorkbenchStore.setState((state) => ({
    accounts: [
      {
        avatarUrl: "",
        description: "",
        id: "seat-001",
        loginStatus: "online",
        metrics: {
          activeCustomers: 0,
          agents: 0,
          stores: 0,
          totalCustomers: 0,
        },
        name: "席位",
        operator: "客服",
        phone: "",
        seatAIAssistantEnabled: enabled,
        takenOverEmployeeId: state.me?.id,
        tone: "",
      },
    ],
    conversationListsByScope: {
      "seat-001": [
        {
          accountId: "seat-001",
          bizStatus: 1,
          conversationAIHostingSwitch: false,
          customerAvatarUrl: "",
          customerBindType: 1,
          customerId: "cust-001",
          customerName: "客户甲",
          id: "conv-001",
          mode: "single",
          preview: "",
          priority: "medium",
          quietFor: "",
          unread: 0,
          updatedAt: "刚刚",
        },
      ],
    },
  }));
}

describe("ChatMessagePanel smart reply state", () => {
  beforeEach(() => {
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("shows visible smart replies for the current single conversation", () => {
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "可展示的话术",
            generateStatus: 2,
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
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "隐藏的话术",
            generateStatus: 2,
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
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "群聊不展示的话术",
            generateStatus: 2,
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

  it("hides cached smart replies immediately after seat AI assistant is disabled", () => {
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "关闭后不展示的话术",
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        },
      },
    }));

    renderPanel();

    expect(screen.getByTestId("smart-reply-card")).toBeInTheDocument();
    expect(screen.getByText("关闭后不展示的话术")).toBeInTheDocument();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        accounts: state.accounts.map((account) =>
          account.id === "seat-001"
            ? {
                ...account,
                seatAIAssistantEnabled: false,
              }
            : account,
        ),
      }));
    });

    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(screen.queryByText("关闭后不展示的话术")).not.toBeInTheDocument();
  });
});

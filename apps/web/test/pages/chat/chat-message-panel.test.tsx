import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  onTriggerSmartReply,
}: {
  conversationMode?: "single" | "group";
  messages?: ChatMessage[];
  onTriggerSmartReply?: (message: ChatMessage, options?: { force?: boolean }) => void;
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
      onTriggerSmartReply={onTriggerSmartReply}
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

  it("hides semantic-wait smart replies that are no longer for the latest customer message", () => {
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "",
            createdAt: Date.now() - 1_000,
            generateStatus: 5,
            pollComplete: false,
            status: "processing",
          },
        },
      },
    }));

    renderPanel({
      messages: [
        createCustomerMessage(),
        createCustomerMessage({
          msgid: "msg-002",
          seq: 2,
          uiMessageKey: "2",
        }),
      ],
    });

    expect(
      screen.queryByText("语义不完整，继续等待下一条消息"),
    ).not.toBeInTheDocument();
  });

  it("shows semantic-wait smart replies for the latest customer message", () => {
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "2": {
            assistantName: "智能助手",
            content: "",
            createdAt: Date.now() - 1_000,
            generateStatus: 5,
            pollComplete: false,
            status: "processing",
          },
        },
      },
    }));

    renderPanel({
      messages: [
        createCustomerMessage(),
        createCustomerMessage({
          msgid: "msg-002",
          seq: 2,
          uiMessageKey: "2",
        }),
      ],
    });

    expect(
      screen.getByText("语义不完整，继续等待下一条消息"),
    ).toBeInTheDocument();
  });

  it("disables the smart reply action when seat AI assistant is unavailable", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    enableSmartReplyDisplayContext(false);

    renderPanel({ onTriggerSmartReply });

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const smartReplyAction = screen.getByRole("menuitem", { name: "话术推荐" });

    expect(smartReplyAction).toHaveAttribute("data-disabled");

    await user.click(smartReplyAction);

    expect(onTriggerSmartReply).not.toHaveBeenCalled();
  });
});

import { createRef } from "react";
import { render, screen } from "@testing-library/react";
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

function enableSmartReplyDisplayContext({
  conversationAIHostingSwitch = false,
  enabled = true,
  seatGroupAIHostingEnabled,
  seatGroupAIAssistantEnabled,
  mode = "single",
}: {
  conversationAIHostingSwitch?: boolean;
  enabled?: boolean;
  seatGroupAIHostingEnabled?: boolean;
  seatGroupAIAssistantEnabled?: boolean;
  mode?: "single" | "group";
} = {}) {
  useWorkbenchStore.setState((state) => ({
    accounts: [
      {
        avatarUrl: "",
        description: "",
        seatGroupAIHostingEnabled:
          seatGroupAIHostingEnabled ?? (mode === "group" ? conversationAIHostingSwitch : false),
        seatGroupAIAssistantEnabled:
          seatGroupAIAssistantEnabled ?? (mode === "group" ? enabled : false),
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
        seatAIHostingEnabled: mode === "single" ? conversationAIHostingSwitch : false,
        takenOverEmployeeId: state.me?.id,
        tone: "",
      },
    ],
    conversationListsByScope: {
      "seat-001": [
        {
          accountId: "seat-001",
          bizStatus: 1,
          conversationAIHostingSwitch,
          handoffMsgId: 0,
          customerAvatarUrl: "",
          customerBindType: 1,
          customerId: "cust-001",
          customerName: "客户甲",
          id: "conv-001",
          mode,
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

  it("keeps an active smart reply out of the message row and hides its duplicate trigger", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        "conv-001": "1",
      },
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

    renderPanel({ onTriggerSmartReply });

    expect(screen.queryByTestId("smart-reply-card")).not.toBeInTheDocument();
    expect(screen.queryByText("可展示的话术")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "消息操作" }));
    expect(
      screen.queryByRole("menuitem", { name: "话术推荐" }),
    ).not.toBeInTheDocument();
    expect(onTriggerSmartReply).not.toHaveBeenCalled();
  });

  it("does not let a semantic-wait turn on an older message block a newer one", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        "conv-001": "1",
      },
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
    const latestMessage = createCustomerMessage({
      msgid: "msg-002",
      seq: 2,
      uiMessageKey: "2",
    });

    renderPanel({
      messages: [createCustomerMessage(), latestMessage],
      onTriggerSmartReply,
    });

    const actionButtons = screen.getAllByRole("button", { name: "消息操作" });
    await user.click(actionButtons.at(-1)!);
    const action = screen.getByRole("menuitem", { name: "话术推荐" });
    expect(action).not.toHaveAttribute("data-disabled");
    await user.click(action);
    expect(onTriggerSmartReply).toHaveBeenCalledWith(latestMessage);
  });

  it("does not let a skipped recommendation block another message", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    enableSmartReplyDisplayContext();
    useWorkbenchStore.setState((state) => ({
      smartReplyActiveMessageKeyByConversationId: {
        ...state.smartReplyActiveMessageKeyByConversationId,
        "conv-001": "1",
      },
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "1": {
            assistantName: "智能助手",
            content: "",
            failReason: "命中人工处理规则",
            generateStatus: 4,
            pollComplete: true,
          },
        },
      },
    }));
    const latestMessage = createCustomerMessage({
      msgid: "msg-002",
      seq: 2,
      uiMessageKey: "2",
    });

    renderPanel({
      messages: [createCustomerMessage(), latestMessage],
      onTriggerSmartReply,
    });

    const actionButtons = screen.getAllByRole("button", { name: "消息操作" });
    await user.click(actionButtons.at(-1)!);
    const action = screen.getByRole("menuitem", { name: "话术推荐" });
    expect(action).not.toHaveAttribute("data-disabled");
    await user.click(action);
    expect(onTriggerSmartReply).toHaveBeenCalledWith(latestMessage);
  });

  it("disables the smart reply action when seat AI assistant is unavailable", async () => {
    const user = userEvent.setup();
    const onTriggerSmartReply = vi.fn();
    enableSmartReplyDisplayContext({ enabled: false });

    renderPanel({ onTriggerSmartReply });

    await user.click(screen.getByRole("button", { name: "消息操作" }));

    const smartReplyAction = screen.getByRole("menuitem", { name: "话术推荐" });

    expect(smartReplyAction).toHaveAttribute("data-disabled");

    await user.click(smartReplyAction);

    expect(onTriggerSmartReply).not.toHaveBeenCalled();
  });
});

describe("ChatMessagePanel history loader", () => {
  it("does not show a history loader when the current page covers all messages", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: "加载更早的对话" })).not.toBeInTheDocument();
  });
});

describe("ChatMessagePanel scrollbar", () => {
  it("shows the message scrollbar only while scrolling", () => {
    renderPanel();

    expect(screen.getByTestId("message-scroll-area")).toHaveAttribute(
      "data-scrollbar-visibility",
      "scroll",
    );
  });
});

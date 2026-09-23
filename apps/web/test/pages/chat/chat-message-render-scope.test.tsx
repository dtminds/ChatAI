import { createRef } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessagePanel } from "@/pages/chat/components/chat-message-panel";
import { ChatMessageList } from "@/pages/chat/components/message-feed";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { useWorkbenchStore } from "@/store/workbench-store";

const messageContentRenderMock = vi.hoisted(() => vi.fn());

vi.mock("@/pages/chat/components/message", () => ({
  MessageContentRenderer: ({ message }: { message: ChatMessage }) => {
    messageContentRenderMock(message.uiMessageKey);
    return <span>{message.content.type}</span>;
  },
}));

function createCustomerMessage(
  uiMessageKey: string,
  overrides: Partial<ChatMessage> = {},
) {
  return {
    author: "客户甲",
    content: { text: `消息 ${uiMessageKey}`, type: "text" },
    conversationId: "conv-001",
    msgid: `msg-${uiMessageKey}`,
    rawMsgtype: "text",
    role: "customer",
    sender: { id: "cust-001", name: "客户甲" },
    sentAt: "2026-09-22T10:00:00+08:00",
    seq: Number(uiMessageKey),
    status: "sent",
    uiMessageKey,
    ...overrides,
  } satisfies ChatMessage;
}

describe("chat message render scope", () => {
  beforeEach(() => {
    messageContentRenderMock.mockClear();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("keeps the message list idle across equivalent panel renders", () => {
    const messages = [createCustomerMessage("1")];
    const props = {
      activeHistoryStatus: "idle" as const,
      canUseMessageActions: true,
      conversationId: "conv-001",
      conversationMode: "single" as const,
      hasMoreHistory: false,
      isConversationLoading: false,
      messages,
      messageViewportRef: createRef<HTMLDivElement>(),
      onLoadOlderMessages: vi.fn(),
      onMessageViewportScroll: vi.fn(),
      onRetryMessage: vi.fn(),
    };
    const { rerender } = render(<ChatMessagePanel {...props} />);

    expect(messageContentRenderMock.mock.calls.flat()).toEqual(["1"]);

    rerender(<ChatMessagePanel {...props} />);
    rerender(
      <ChatMessagePanel {...props} activeHistoryStatus="loading" />,
    );

    expect(messageContentRenderMock.mock.calls.flat()).toEqual(["1"]);

    rerender(
      <ChatMessagePanel
        {...props}
        activeHistoryStatus="loading"
        canUseMessageActions={false}
      />,
    );

    expect(messageContentRenderMock.mock.calls.flat()).toEqual(["1", "1"]);
  });

  it("renders only appended rows and still updates on conversation changes", () => {
    const firstMessage = createCustomerMessage("1");
    const secondMessage = createCustomerMessage("2");
    const initialMessages = [firstMessage];
    const appendedMessages = [firstMessage, secondMessage];
    const { rerender } = render(
      <ChatMessageList
        conversationId="conv-001"
        messages={initialMessages}
      />,
    );

    rerender(
      <ChatMessageList
        conversationId="conv-001"
        messages={appendedMessages}
      />,
    );

    expect(messageContentRenderMock.mock.calls.flat()).toEqual(["1", "2"]);

    rerender(
      <ChatMessageList
        conversationId="conv-002"
        messages={appendedMessages}
      />,
    );

    expect(messageContentRenderMock.mock.calls.flat()).toEqual([
      "1",
      "2",
      "1",
      "2",
    ]);
  });

  it("updates only the row whose smart reply state changes", () => {
    const firstMessage = createCustomerMessage("1");
    const secondMessage = createCustomerMessage("2");
    const messages = [firstMessage, secondMessage];
    const { rerender } = render(
      <ChatMessageList conversationId="conv-001" messages={messages} />,
    );

    rerender(
      <ChatMessageList
        conversationId="conv-001"
        messages={messages}
        smartReplyByMessageId={{
          "2": {
            assistantName: "智能助手",
            content: "建议回复",
            generateStatus: 2,
            pollComplete: true,
            status: "ready",
          },
        }}
      />,
    );

    expect(messageContentRenderMock.mock.calls.flat()).toEqual([
      "1",
      "2",
      "2",
    ]);
  });
});

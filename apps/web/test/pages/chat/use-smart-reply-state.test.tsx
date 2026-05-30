import { render } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LexicalEditor } from "lexical";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_TEXT_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import { useSmartReplyState } from "@/pages/chat/hooks/use-smart-reply-state";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";
import type { SmartReplySuggestion } from "@/pages/chat/components/smart-reply-card";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";

const singleConversation = {
  accountId: "drc",
  custodyMode: "semi",
  customerAvatarUrl: "",
  customerId: "cust-001",
  customerName: "客户",
  id: "conv-001",
  mode: "single",
  preview: "",
  priority: "medium",
  quietFor: "",
  unread: 0,
  updatedAt: "刚刚",
} satisfies Conversation;

const groupConversation = {
  ...singleConversation,
  id: "conv-group",
  mode: "group",
} satisfies Conversation;

const customerMessage = {
  author: "客户",
  content: {
    text: "想了解活动",
    type: "text",
  },
  conversationId: "conv-001",
  id: "msg-001",
  role: "customer",
  sender: {
    id: "cust-001",
    name: "客户",
  },
  sentAt: "2026-05-30 10:00:00",
  seq: 1,
  status: "sent",
} satisfies ChatMessage;

function createSuggestion(content: string): SmartReplySuggestion {
  return {
    assistantName: "智能助手",
    content,
    pollComplete: true,
    status: "ready",
  };
}

function createSendPayload(content = "推荐话术"): SmartReplySendPayload {
  return {
    content,
    recommendedAttachments: [],
    selectedAttachmentIds: [],
  };
}

function createEditorMock() {
  return {
    dispatchCommand: vi.fn(),
    focus: vi.fn(),
  } as unknown as LexicalEditor & {
    dispatchCommand: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
  };
}

type HarnessProps = Parameters<typeof useSmartReplyState>[0] & {
  onState: (state: ReturnType<typeof useSmartReplyState>) => void;
};

function Harness({ onState, ...props }: HarnessProps) {
  const composerRef = useRef<LexicalEditor | null>(props.composerRef.current);
  const state = useSmartReplyState({
    ...props,
    composerRef,
  });

  onState(state);

  return null;
}

describe("useSmartReplyState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes only visible smart replies for the active single conversation", () => {
    let latestState: ReturnType<typeof useSmartReplyState> | undefined;
    const visibleSuggestion = createSuggestion("展示的话术");
    const hiddenSuggestion = createSuggestion("隐藏的话术");

    render(
      <Harness
        activeConversation={singleConversation}
        canSendMessage
        composerRef={{ current: null }}
        dismissSmartReply={vi.fn()}
        isMountedRef={{ current: true }}
        isSendingDraftRef={{ current: false }}
        onDraftChange={vi.fn()}
        onSendFailure={vi.fn()}
        onSent={vi.fn()}
        onSendingChange={vi.fn()}
        onState={(state) => {
          latestState = state;
        }}
        requestSmartReplyGeneralAnswer={vi.fn()}
        requestSmartReplyMakeShorter={vi.fn()}
        sendSmartReply={vi.fn()}
        smartReplyByMessageIdByConversationId={{
          "conv-001": {
            "1": visibleSuggestion,
            "2": hiddenSuggestion,
          },
          "conv-other": {
            "3": createSuggestion("其他会话"),
          },
        }}
        smartReplyHiddenMessageKeysByConversationId={{
          "conv-001": {
            "2": true,
          },
        }}
      />,
    );

    expect(latestState?.activeSmartReplyByMessageId).toEqual({
      "1": visibleSuggestion,
    });
  });

  it("does not expose smart replies for group conversations", () => {
    let latestState: ReturnType<typeof useSmartReplyState> | undefined;

    render(
      <Harness
        activeConversation={groupConversation}
        canSendMessage
        composerRef={{ current: null }}
        dismissSmartReply={vi.fn()}
        isMountedRef={{ current: true }}
        isSendingDraftRef={{ current: false }}
        onDraftChange={vi.fn()}
        onSendFailure={vi.fn()}
        onSent={vi.fn()}
        onSendingChange={vi.fn()}
        onState={(state) => {
          latestState = state;
        }}
        requestSmartReplyGeneralAnswer={vi.fn()}
        requestSmartReplyMakeShorter={vi.fn()}
        sendSmartReply={vi.fn()}
        smartReplyByMessageIdByConversationId={{
          "conv-group": {
            "1": createSuggestion("群聊不展示"),
          },
        }}
        smartReplyHiddenMessageKeysByConversationId={{}}
      />,
    );

    expect(latestState?.activeSmartReplyByMessageId).toEqual({});
  });

  it("fills the composer through Lexical commands without sending", () => {
    let latestState: ReturnType<typeof useSmartReplyState> | undefined;
    const editor = createEditorMock();

    render(
      <Harness
        activeConversation={singleConversation}
        canSendMessage
        composerRef={{ current: editor }}
        dismissSmartReply={vi.fn()}
        isMountedRef={{ current: true }}
        isSendingDraftRef={{ current: false }}
        onDraftChange={vi.fn()}
        onSendFailure={vi.fn()}
        onSent={vi.fn()}
        onSendingChange={vi.fn()}
        onState={(state) => {
          latestState = state;
        }}
        requestSmartReplyGeneralAnswer={vi.fn()}
        requestSmartReplyMakeShorter={vi.fn()}
        sendSmartReply={vi.fn()}
        smartReplyByMessageIdByConversationId={{}}
        smartReplyHiddenMessageKeysByConversationId={{}}
      />,
    );

    latestState?.handleFillSmartReplyComposer(customerMessage, "  推荐话术  ");

    expect(editor.dispatchCommand).toHaveBeenCalledWith(
      CLEAR_COMPOSER_COMMAND,
      undefined,
    );
    expect(editor.dispatchCommand).toHaveBeenCalledWith(
      INSERT_COMPOSER_TEXT_COMMAND,
      "推荐话术",
    );
    expect(latestState?.handleFillSmartReplyComposer).toBeDefined();
    expect(editor.focus).toHaveBeenCalledTimes(1);
  });

  it("sends smart replies through the store action and reports failures", async () => {
    let latestState: ReturnType<typeof useSmartReplyState> | undefined;
    const onSendFailure = vi.fn();
    const onSendingChange = vi.fn();
    const sendSmartReply = vi.fn(async () => ({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      ok: false as const,
      reason: "send" as const,
    }));

    render(
      <Harness
        activeConversation={singleConversation}
        canSendMessage
        composerRef={{ current: null }}
        dismissSmartReply={vi.fn()}
        isMountedRef={{ current: true }}
        isSendingDraftRef={{ current: false }}
        onDraftChange={vi.fn()}
        onSendFailure={onSendFailure}
        onSent={vi.fn()}
        onSendingChange={onSendingChange}
        onState={(state) => {
          latestState = state;
        }}
        requestSmartReplyGeneralAnswer={vi.fn()}
        requestSmartReplyMakeShorter={vi.fn()}
        sendSmartReply={sendSmartReply}
        smartReplyByMessageIdByConversationId={{}}
        smartReplyHiddenMessageKeysByConversationId={{}}
      />,
    );

    const result = await latestState?.handleSendSmartReply(
      customerMessage,
      createSendPayload(),
    );

    expect(sendSmartReply).toHaveBeenCalledWith(
      customerMessage,
      createSendPayload(),
    );
    expect(onSendingChange).toHaveBeenNthCalledWith(1, true);
    expect(onSendFailure).toHaveBeenCalledWith({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      reason: "send",
    });
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
    expect(result).toMatchObject({ ok: false });
  });

  it("forwards trigger, dismiss, and make-shorter handlers", () => {
    let latestState: ReturnType<typeof useSmartReplyState> | undefined;
    const dismissSmartReply = vi.fn();
    const requestSmartReplyGeneralAnswer = vi.fn(async () => undefined);
    const requestSmartReplyMakeShorter = vi.fn(async () => undefined);

    render(
      <Harness
        activeConversation={singleConversation}
        canSendMessage
        composerRef={{ current: null }}
        dismissSmartReply={dismissSmartReply}
        isMountedRef={{ current: true }}
        isSendingDraftRef={{ current: false }}
        onDraftChange={vi.fn()}
        onSendFailure={vi.fn()}
        onSent={vi.fn()}
        onSendingChange={vi.fn()}
        onState={(state) => {
          latestState = state;
        }}
        requestSmartReplyGeneralAnswer={requestSmartReplyGeneralAnswer}
        requestSmartReplyMakeShorter={requestSmartReplyMakeShorter}
        sendSmartReply={vi.fn()}
        smartReplyByMessageIdByConversationId={{}}
        smartReplyHiddenMessageKeysByConversationId={{}}
      />,
    );

    latestState?.handleTriggerSmartReply(customerMessage, { force: true });
    latestState?.handleDismissSmartReply(customerMessage);
    latestState?.handleMakeShorterSmartReply(customerMessage);

    expect(requestSmartReplyGeneralAnswer).toHaveBeenCalledWith(
      customerMessage,
      { force: true },
    );
    expect(dismissSmartReply).toHaveBeenCalledWith(customerMessage);
    expect(requestSmartReplyMakeShorter).toHaveBeenCalledWith(customerMessage);
  });
});

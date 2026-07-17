import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LexicalEditor } from "lexical";
import {
  CLEAR_COMPOSER_COMMAND,
  INSERT_COMPOSER_TEXT_COMMAND,
} from "@/pages/chat/components/composer/lexical-commands";
import { useSmartReplyState } from "@/pages/chat/hooks/use-smart-reply-state";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";
import type { SmartReplySendPayload } from "@/pages/chat/api/smart-reply-adapter";

type SmartReplyStateOptions = Parameters<typeof useSmartReplyState>[0];

const singleConversation = {
  accountId: "drc",
  conversationAIHostingSwitch: false,
  handoffMsgId: 0,
  customerAvatarUrl: "",
  customerBindType: 1,
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

const customerMessage = {
  author: "客户",
  content: {
    text: "想了解活动",
    type: "text",
  },
  conversationId: "conv-001",
  msgid: "msg-001",
  role: "customer",
  sender: {
    id: "cust-001",
    name: "客户",
  },
  sentAt: "2026-05-30 10:00:00",
  seq: 1,
  status: "sent",
  uiMessageKey: "1",
} satisfies ChatMessage;

function createSendPayload(content = "推荐话术"): SmartReplySendPayload {
  return {
    content,
    recommendedAttachments: [],
    selectedAttachmentIds: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
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

function getBooleanMockCalls(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls.map(([value]) => value);
}

function createDefaultHookOptions(
  overrides: Partial<SmartReplyStateOptions> = {},
): SmartReplyStateOptions {
  return {
    activeConversation: singleConversation,
    canSendMessage: true,
    composerRef: { current: null },
    dismissSmartReply: vi.fn(),
    isMountedRef: { current: true },
    isSendingDraftRef: { current: false },
    onDraftChange: vi.fn(),
    onSendFailure: vi.fn(),
    onSent: vi.fn(),
    onSendingChange: vi.fn(),
    requestSmartReplyGeneralAnswer: vi.fn(),
    requestSmartReplyMakeShorter: vi.fn(),
    sendSmartReply: vi.fn(),
    ...overrides,
  };
}

describe("useSmartReplyState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fills the composer through Lexical commands without sending", () => {
    const editor = createEditorMock();

    const { result } = renderHook(() =>
      useSmartReplyState(
        createDefaultHookOptions({
          composerRef: { current: editor },
        }),
      ),
    );

    result.current.handleFillSmartReplyComposer(customerMessage, "  推荐话术  ");

    expect(editor.dispatchCommand).toHaveBeenCalledWith(
      CLEAR_COMPOSER_COMMAND,
      undefined,
    );
    expect(editor.dispatchCommand).toHaveBeenCalledWith(
      INSERT_COMPOSER_TEXT_COMMAND,
      "推荐话术",
    );
    expect(result.current.handleFillSmartReplyComposer).toBeDefined();
    expect(editor.focus).toHaveBeenCalledTimes(1);
  });

  it("sends smart replies through the store action and reports failures", async () => {
    const onSendFailure = vi.fn();
    const onSendingChange = vi.fn();
    const sendSmartReply = vi.fn(async () => ({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      ok: false as const,
      reason: "send" as const,
    }));

    const { result } = renderHook(() =>
      useSmartReplyState(
        createDefaultHookOptions({
          onSendFailure,
          onSendingChange,
          sendSmartReply,
        }),
      ),
    );

    const sendResult = await result.current.handleSendSmartReply(
      customerMessage,
      createSendPayload(),
    );

    expect(sendSmartReply).toHaveBeenCalledWith(
      customerMessage,
      createSendPayload(),
    );
    expect(getBooleanMockCalls(onSendingChange)).toContain(true);
    expect(onSendFailure).toHaveBeenCalledWith({
      errorCode: "SEND_FAILED",
      errorMessage: "发送失败",
      reason: "send",
    });
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
    expect(sendResult).toMatchObject({ ok: false });
  });

  it("keeps the shared send lock while skipping stale side effects after the active conversation changes", async () => {
    const sendGate = createDeferred<{
      didConsumeQuote?: boolean;
      ok: true;
    }>();
    const isSendingDraftRef = { current: false };
    const onSendFailure = vi.fn();
    const onSent = vi.fn();
    const onSendingChange = vi.fn();
    const sendSmartReply = vi.fn(() => sendGate.promise);
    const { result, rerender } = renderHook(
      (options: SmartReplyStateOptions) => useSmartReplyState(options),
      {
        initialProps: createDefaultHookOptions({
          isSendingDraftRef,
          onSendFailure,
          onSent,
          onSendingChange,
          sendSmartReply,
        }),
      },
    );

    const sendPromise = result.current.handleSendSmartReply(
      customerMessage,
      createSendPayload(),
    );
    onSendingChange.mockClear();

    rerender(
      createDefaultHookOptions({
        activeConversation: {
          ...singleConversation,
          id: "conv-002",
        },
        isSendingDraftRef,
        onSendFailure,
        onSent,
        onSendingChange,
        sendSmartReply,
      }),
    );

    expect(isSendingDraftRef.current).toBe(true);
    expect(getBooleanMockCalls(onSendingChange)).toEqual([]);

    await act(async () => {
      sendGate.resolve({ ok: true });
      await sendPromise;
    });

    expect(onSent).not.toHaveBeenCalled();
    expect(onSendFailure).not.toHaveBeenCalled();
    expect(isSendingDraftRef.current).toBe(false);
    expect(onSendingChange).toHaveBeenLastCalledWith(false);
  });

  it("blocks another smart reply after switching away and back until the first send settles", async () => {
    const olderSendGate = createDeferred<{
      didConsumeQuote?: boolean;
      ok: true;
    }>();
    const isSendingDraftRef = { current: false };
    const onSent = vi.fn();
    const onSendingChange = vi.fn();
    const sendSmartReply = vi.fn().mockReturnValueOnce(olderSendGate.promise);
    const { result, rerender } = renderHook(
      (options: SmartReplyStateOptions) => useSmartReplyState(options),
      {
        initialProps: createDefaultHookOptions({
          isSendingDraftRef,
          onSent,
          onSendingChange,
          sendSmartReply,
        }),
      },
    );

    const olderSendPromise = result.current.handleSendSmartReply(
      customerMessage,
      createSendPayload(),
    );

    rerender(
      createDefaultHookOptions({
        activeConversation: {
          ...singleConversation,
          id: "conv-002",
        },
        isSendingDraftRef,
        onSent,
        onSendingChange,
        sendSmartReply,
      }),
    );

    rerender(
      createDefaultHookOptions({
        isSendingDraftRef,
        onSent,
        onSendingChange,
        sendSmartReply,
      }),
    );

    onSendingChange.mockClear();

    const newerSendPromise = result.current.handleSendSmartReply(
      customerMessage,
      createSendPayload("新的推荐话术"),
    );

    await expect(newerSendPromise).resolves.toBeUndefined();
    expect(sendSmartReply).toHaveBeenCalledTimes(1);
    expect(isSendingDraftRef.current).toBe(true);
    expect(onSendingChange).not.toHaveBeenCalled();

    await act(async () => {
      olderSendGate.resolve({ ok: true });
      await olderSendPromise;
    });

    expect(isSendingDraftRef.current).toBe(false);
    expect(onSent).not.toHaveBeenCalled();
    expect(getBooleanMockCalls(onSendingChange)).toEqual([false]);
  });

  it("forwards trigger, dismiss, and make-shorter handlers", () => {
    const dismissSmartReply = vi.fn();
    const requestSmartReplyGeneralAnswer = vi.fn(async () => undefined);
    const requestSmartReplyMakeShorter = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useSmartReplyState(
        createDefaultHookOptions({
          dismissSmartReply,
          requestSmartReplyGeneralAnswer,
          requestSmartReplyMakeShorter,
        }),
      ),
    );

    result.current.handleTriggerSmartReply(customerMessage, { force: true });
    result.current.handleDismissSmartReply(customerMessage);
    result.current.handleMakeShorterSmartReply(customerMessage);

    expect(requestSmartReplyGeneralAnswer).toHaveBeenCalledWith(
      customerMessage,
      { force: true },
    );
    expect(dismissSmartReply).toHaveBeenCalledWith(customerMessage);
    expect(requestSmartReplyMakeShorter).toHaveBeenCalledWith(customerMessage);
  });
});

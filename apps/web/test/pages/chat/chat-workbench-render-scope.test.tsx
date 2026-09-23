import { act, screen, waitFor } from "@testing-library/react";
import type { LexicalEditor } from "lexical";
import type { RefObject } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import { INSERT_COMPOSER_MENTION_COMMAND } from "@/pages/chat/components/composer/lexical-commands";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

const chatPanelRenderMock = vi.hoisted(() => vi.fn());
const conversationListPanelRenderMock = vi.hoisted(() => vi.fn());

vi.mock("@/pages/chat/components/chat-panel", () => ({
  ChatPanel: (props: {
    activeConversation?: { id: string; isShadowGroup?: boolean };
    composerRef: RefObject<LexicalEditor | null>;
    groupMembers: unknown;
    messages: Message[];
    messageViewportRef: RefObject<HTMLDivElement | null>;
    onCancelFileUpload: unknown;
    onClearQuotedMessage: unknown;
    onCollectMaterial?: unknown;
    onDismissSmartReply?: unknown;
    onDownloadMessageFile?: unknown;
    onEnterMultiSelectMode?: unknown;
    onFileSelect: unknown;
    onFillSmartReplyComposer?: unknown;
    onForwardMessage?: unknown;
    onLoadOlderMessages: unknown;
    onLoadSendFailReason?: unknown;
    onLoadMoreCollectedExpressions?: unknown;
    onMakeShorterSmartReply?: unknown;
    onMentionMessage?: unknown;
    onMessageViewportScroll: unknown;
    onOpenQuotedMessage?: unknown;
    onQuoteMessage?: unknown;
    onRevokeMessage?: unknown;
    onRetryMessage: unknown;
    onSendDraft: unknown;
    onSendSmartReply?: unknown;
    onToggleMessageSelection?: unknown;
    onTranscribeVoice?: unknown;
    onTriggerSmartReply?: unknown;
    onVoicePlaybackReady?: unknown;
  }) => {
    chatPanelRenderMock({
      activeConversationId: props.activeConversation?.id ?? null,
      composerRef: props.composerRef,
      isShadowGroup: props.activeConversation?.isShadowGroup,
      messageComposerBoundaryProps: {
        groupMembers: props.groupMembers,
        messages: props.messages,
        onCancelFileUpload: props.onCancelFileUpload,
        onClearQuotedMessage: props.onClearQuotedMessage,
        onCollectMaterial: props.onCollectMaterial,
        onDismissSmartReply: props.onDismissSmartReply,
        onDownloadMessageFile: props.onDownloadMessageFile,
        onEnterMultiSelectMode: props.onEnterMultiSelectMode,
        onFileSelect: props.onFileSelect,
        onFillSmartReplyComposer: props.onFillSmartReplyComposer,
        onForwardMessage: props.onForwardMessage,
        onLoadOlderMessages: props.onLoadOlderMessages,
        onLoadSendFailReason: props.onLoadSendFailReason,
        onLoadMoreCollectedExpressions:
          props.onLoadMoreCollectedExpressions,
        onMakeShorterSmartReply: props.onMakeShorterSmartReply,
        onMentionMessage: props.onMentionMessage,
        onMessageViewportScroll: props.onMessageViewportScroll,
        onOpenQuotedMessage: props.onOpenQuotedMessage,
        onQuoteMessage: props.onQuoteMessage,
        onRevokeMessage: props.onRevokeMessage,
        onRetryMessage: props.onRetryMessage,
        onSendDraft: props.onSendDraft,
        onSendSmartReply: props.onSendSmartReply,
        onToggleMessageSelection: props.onToggleMessageSelection,
        onTranscribeVoice: props.onTranscribeVoice,
        onTriggerSmartReply: props.onTriggerSmartReply,
        onVoicePlaybackReady: props.onVoicePlaybackReady,
      },
      onRevokeMessage: props.onRevokeMessage,
    });

    return (
      <div data-testid="mock-chat-panel">
        {props.activeConversation?.id ?? "no-conversation"}
        <div ref={props.messageViewportRef}>
          {props.messages.map((message) => (
            <div data-scroll-anchor={message.uiMessageKey} key={message.uiMessageKey} />
          ))}
        </div>
      </div>
    );
  },
}));

vi.mock("@/pages/chat/components/conversation-list-panel", () => ({
  ConversationListPanel: (props: {
    conversations: unknown[];
    searchableConversations: unknown[];
  }) => {
    conversationListPanelRenderMock({
      conversations: props.conversations,
      searchableConversations: props.searchableConversations,
    });

    return <div data-testid="mock-conversation-list-panel" />;
  },
}));

async function renderReadyWorkbenchPage() {
  renderChatWorkbenchPage();

  await waitFor(() => {
    expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
  });
}

describe("ChatWorkbenchPage render scope", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
    chatPanelRenderMock.mockClear();
    conversationListPanelRenderMock.mockClear();
  });

  it("does not re-render ChatPanel when smart reply or empty poll updates", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-chat-panel");
    chatPanelRenderMock.mockClear();

    act(() => {
      useWorkbenchStore.setState((state) => ({
        smartReplyByMessageIdByConversationId: {
          ...state.smartReplyByMessageIdByConversationId,
          "conv-001": {
            "1": {
              assistantName: "智能助手",
              content: "推荐回复",
              pollComplete: true,
              status: "ready",
            },
          },
        },
      }));
    });

    expect(chatPanelRenderMock).not.toHaveBeenCalled();

    await act(async () => {
      await useWorkbenchStore.getState().pollWorkbench();
    });

    expect(chatPanelRenderMock).not.toHaveBeenCalled();
  });

  it("does not re-render ChatPanel when seat summaries are unchanged", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        return baseService.getSeats();
      },
    });

    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-chat-panel");
    chatPanelRenderMock.mockClear();

    await act(async () => {
      await useWorkbenchStore.getState().refreshSeatSummaries();
    });

    expect(chatPanelRenderMock).not.toHaveBeenCalled();
  });

  it("keeps visible conversation references stable across unrelated page renders", async () => {
    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-conversation-list-panel");
    await waitFor(() => expect(conversationListPanelRenderMock).toHaveBeenCalled());
    const firstProps = conversationListPanelRenderMock.mock.lastCall?.[0];

    act(() => {
      useWorkbenchStore.setState({
        readReceiptError: "已读状态同步失败",
      });
    });

    await waitFor(() =>
      expect(conversationListPanelRenderMock.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );
    const nextProps = conversationListPanelRenderMock.mock.lastCall?.[0];

    expect(nextProps.conversations).toBe(firstProps.conversations);
    expect(nextProps.searchableConversations).toBe(
      firstProps.searchableConversations,
    );
  });

  it("keeps message and composer callbacks stable across unrelated page renders", async () => {
    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-chat-panel");
    await waitFor(() => expect(chatPanelRenderMock).toHaveBeenCalled());
    const firstBoundaryProps = chatPanelRenderMock.mock.lastCall?.[0]
      .messageComposerBoundaryProps;
    const renderCount = chatPanelRenderMock.mock.calls.length;

    act(() => {
      useWorkbenchStore.setState({
        readReceiptError: "已读状态同步失败",
      });
    });

    await waitFor(() =>
      expect(chatPanelRenderMock.mock.calls.length).toBeGreaterThan(renderCount),
    );
    const nextBoundaryProps = chatPanelRenderMock.mock.lastCall?.[0]
      .messageComposerBoundaryProps;

    expect(
      Object.entries(nextBoundaryProps).flatMap(([name, value]) =>
        value === firstBoundaryProps[name as keyof typeof firstBoundaryProps]
          ? []
          : [name],
      ),
    ).toEqual([]);
  });

  it("keeps the quote callback stable when messages append and locates the new message", async () => {
    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-chat-panel");
    const firstProps = chatPanelRenderMock.mock.lastCall?.[0];
    const conversationId = firstProps.activeConversationId as string;
    const firstMessages = useWorkbenchStore.getState().messagesByConversationId[conversationId] ?? [];
    const appendedMessage: Message = {
      author: "客户",
      content: { text: "追加的消息", type: "text" },
      conversationId,
      msgid: "appended-message",
      role: "customer",
      sender: { id: "customer-001", name: "客户" },
      sentAt: "2026-09-23T10:00:00+08:00",
      seq: 123456,
      status: "sent",
      uiMessageKey: "appended-message",
    };

    act(() => {
      useWorkbenchStore.setState((state) => ({
        messagesByConversationId: {
          ...state.messagesByConversationId,
          [conversationId]: [...firstMessages, appendedMessage],
        },
      }));
    });

    const nextProps = chatPanelRenderMock.mock.lastCall?.[0];
    expect(nextProps.messageComposerBoundaryProps.messages).toHaveLength(firstMessages.length + 1);
    expect(
      Object.entries(nextProps.messageComposerBoundaryProps).flatMap(([name, value]) =>
        value === firstProps.messageComposerBoundaryProps[
          name as keyof typeof firstProps.messageComposerBoundaryProps
        ]
          ? []
          : [name],
      ),
    ).toEqual(["messages"]);

    const anchor = document.querySelector<HTMLElement>(
      '[data-scroll-anchor="appended-message"]',
    );
    expect(anchor).not.toBeNull();
    const scrollIntoView = vi.fn();
    anchor!.scrollIntoView = scrollIntoView;

    act(() => {
      (nextProps.messageComposerBoundaryProps.onOpenQuotedMessage as (id: string) => void)(
        "123456",
      );
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("keeps the mention callback stable while using refreshed group members", async () => {
    await renderReadyWorkbenchPage();
    await act(async () => {
      await useWorkbenchStore.getState().setActiveMode("group");
    });
    await waitFor(() => {
      expect(chatPanelRenderMock.mock.lastCall?.[0].activeConversationId).toBe("conv-004");
    });
    const firstProps = chatPanelRenderMock.mock.lastCall?.[0];
    const onMentionMessage = firstProps.messageComposerBoundaryProps.onMentionMessage as (
      message: ChatMessage,
    ) => void;
    const dispatchCommand = vi.fn();
    firstProps.composerRef.current = {
      dispatchCommand,
      focus: vi.fn(),
    } as unknown as LexicalEditor;

    act(() => {
      useWorkbenchStore.setState((state) => ({
        groupMembersByConversationId: {
          ...state.groupMembersByConversationId,
          "conv-004": [
            ...(state.groupMembersByConversationId["conv-004"] ?? []),
            { displayName: "新群成员", id: "new-member", type: 0 },
          ],
        },
      }));
    });

    expect(chatPanelRenderMock.mock.lastCall?.[0].messageComposerBoundaryProps.onMentionMessage)
      .toBe(onMentionMessage);

    act(() => {
      onMentionMessage({
        author: "新群成员",
        content: { text: "你好", type: "text" },
        conversationId: "conv-004",
        isGroupConversation: true,
        isOwnMessage: false,
        msgid: "group-message",
        role: "customer",
        sender: { groupMemberId: "new-member", id: "new-member", name: "新群成员" },
        sentAt: "2026-09-23T10:00:00+08:00",
        status: "sent",
        uiMessageKey: "group-message",
      });
    });

    expect(dispatchCommand).toHaveBeenCalledWith(INSERT_COMPOSER_MENTION_COMMAND, {
      displayName: "新群成员",
      memberId: "new-member",
    });
  });

  it("does not expose the revoke handler for shadow group conversations", async () => {
    await renderReadyWorkbenchPage();
    await screen.findByTestId("mock-chat-panel");
    await waitFor(() => expect(chatPanelRenderMock).toHaveBeenCalled());

    act(() => {
      useWorkbenchStore.setState((state) => ({
        conversationListsByScope: {
          ...state.conversationListsByScope,
          [state.activeAccountId]: (
            state.conversationListsByScope[state.activeAccountId] ?? []
          ).map((conversation) =>
            conversation.id === state.activeConversationId
              ? { ...conversation, isShadowGroup: true }
              : conversation,
          ),
        },
      }));
    });

    await waitFor(() =>
      expect(chatPanelRenderMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          activeConversationId: "conv-001",
          isShadowGroup: true,
          onRevokeMessage: undefined,
        }),
      ),
    );
  });
});

import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";
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
    onRevokeMessage?: unknown;
  }) => {
    chatPanelRenderMock({
      activeConversationId: props.activeConversation?.id ?? null,
      isShadowGroup: props.activeConversation?.isShadowGroup,
      onRevokeMessage: props.onRevokeMessage,
    });

    return (
      <div data-testid="mock-chat-panel">
        {props.activeConversation?.id ?? "no-conversation"}
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

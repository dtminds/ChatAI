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

vi.mock("@/pages/chat/components/chat-panel", () => ({
  ChatPanel: (props: { activeConversation?: { id: string } }) => {
    chatPanelRenderMock(props.activeConversation?.id ?? null);

    return (
      <div data-testid="mock-chat-panel">
        {props.activeConversation?.id ?? "no-conversation"}
      </div>
    );
  },
}));

describe("ChatWorkbenchPage render scope", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
    chatPanelRenderMock.mockClear();
  });

  it.each([
    [
      "suggestion state",
      () => {
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
      },
    ],
    [
      "hidden state",
      () => {
        useWorkbenchStore.setState((state) => ({
          smartReplyHiddenMessageKeysByConversationId: {
            ...state.smartReplyHiddenMessageKeysByConversationId,
            "conv-001": {
              "1": true,
            },
          },
        }));
      },
    ],
    [
      "auto pending state",
      () => {
        useWorkbenchStore.setState((state) => ({
          smartReplyAutoPendingMessageKeysByConversationId: {
            ...state.smartReplyAutoPendingMessageKeysByConversationId,
            "conv-001": {
              "1": true,
            },
          },
        }));
      },
    ],
  ])("does not re-render the page shell when smart reply %s changes", async (
    _label,
    updateSmartReplyState,
  ) => {
    renderChatWorkbenchPage();

    await screen.findByTestId("mock-chat-panel");
    await waitFor(() => expect(chatPanelRenderMock).toHaveBeenCalled());
    chatPanelRenderMock.mockClear();

    act(() => {
      updateSmartReplyState();
    });

    expect(chatPanelRenderMock).not.toHaveBeenCalled();
  });

  it("does not re-render the page shell when poll has no business changes", async () => {
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

    renderChatWorkbenchPage();

    await screen.findByTestId("mock-chat-panel");
    await waitFor(() => expect(chatPanelRenderMock).toHaveBeenCalled());
    chatPanelRenderMock.mockClear();

    await act(async () => {
      await useWorkbenchStore.getState().pollWorkbench();
    });

    expect(chatPanelRenderMock).not.toHaveBeenCalled();
  });
});

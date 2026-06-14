import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("does not re-render the page shell when smart reply state changes", async () => {
    renderChatWorkbenchPage();

    await screen.findByTestId("mock-chat-panel");
    await waitFor(() => expect(chatPanelRenderMock).toHaveBeenCalled());
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
  });
});

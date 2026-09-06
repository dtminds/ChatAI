import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchStore } from "@/store/workbench-store";
import {
  mockViewportMediaQuery,
  restoreViewportMediaQuery,
} from "./media-query-test-utils";
import {
  installChatWorkbenchTestEnvironment,
  renderChatWorkbenchPage,
  resetChatWorkbenchTestState,
} from "./workbench-test-utils";

vi.mock("@/pages/chat/components/chat-panel", () => ({
  ChatPanel: (props: {
    onBackToConversationList?: () => void;
  }) => (
    <div data-testid="mock-chat-panel">
      {props.onBackToConversationList ? (
        <button onClick={props.onBackToConversationList} type="button">
          返回会话列表
        </button>
      ) : null}
    </div>
  ),
}));

describe("ChatWorkbenchPage mobile layout", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
    mockViewportMediaQuery({ width: 390 });
  });

  afterEach(() => {
    restoreViewportMediaQuery();
  });

  it("switches from the conversation list to full-width chat detail and back", async () => {
    const user = userEvent.setup();
    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });

    const mobileListLayout = await screen.findByTestId("chat-mobile-list-layout");
    expect(
      within(mobileListLayout).getByRole("navigation", { name: "侧栏导航" }),
    ).toBeInTheDocument();
    expect(
      within(mobileListLayout).queryByRole("button", { name: "展开侧栏" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-chat-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chat-mobile-detail-layout")).not.toBeInTheDocument();

    await user.click(getConversationCardMainButton("conv-001"));

    expect(await screen.findByTestId("chat-mobile-detail-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-mobile-list-layout")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-chat-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回会话列表" }));

    expect(await screen.findByTestId("chat-mobile-list-layout")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-mobile-detail-layout")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mock-chat-panel")).not.toBeInTheDocument();
  });
});

function getConversationCardMainButton(conversationId: string) {
  const card = screen.getByTestId(`conversation-card-${conversationId}`);
  const title = within(card).getByText("丹阳草莓，得利市大樱桃");
  const button = title.closest("button");

  if (!button) {
    throw new Error(`Conversation ${conversationId} main button not found`);
  }

  return button;
}

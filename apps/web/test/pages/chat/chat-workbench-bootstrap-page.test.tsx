import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@/pages/chat/components/chat-panel", () => ({
  ChatPanel: (props: {
    onPersistentSidebarChange?: (visible: boolean) => void;
  }) => (
    <div data-testid="mock-chat-panel">
      <button
        onClick={() => props.onPersistentSidebarChange?.(false)}
        type="button"
      >
        收起固定侧栏
      </button>
    </div>
  ),
}));

vi.mock("@/pages/chat/components/conversation-list-panel", () => ({
  ConversationListPanel: () => <div data-testid="mock-conversation-list-panel" />,
}));

describe("ChatWorkbenchPage bootstrap", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
  });

  it("does not refresh existing workbench data when the store is already ready", async () => {
    const baseService = createMockWorkbenchService();
    const getSeats = vi.fn(baseService.getSeats);

    setWorkbenchService({
      ...baseService,
      getSeats,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    expect(getSeats).toHaveBeenCalledTimes(1);

    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });

    expect(getSeats).toHaveBeenCalledTimes(1);
  });

  it("reduces the desktop chat floor when the persistent sidebar is collapsed", async () => {
    const user = userEvent.setup();

    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    });

    const content = screen.getByTestId("chat-workbench-content");
    expect(content).toHaveStyle({ minWidth: "1100px" });

    await user.click(screen.getByRole("button", { name: "收起固定侧栏" }));

    expect(content).toHaveStyle({ minWidth: "776px" });
  });
});

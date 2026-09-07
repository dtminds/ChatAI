import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
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
  ChatPanel: () => <div data-testid="mock-chat-panel" />,
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
});

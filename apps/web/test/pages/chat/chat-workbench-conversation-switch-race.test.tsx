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

const conversationListHarness = vi.hoisted(() => ({
  onSelectConversation: undefined as
    | ((conversationId: string) => boolean | void | Promise<boolean | void>)
    | undefined,
}));

vi.mock("@/pages/chat/components/conversation-list-panel", () => ({
  ConversationListPanel: ({
    onSelectConversation,
  }: {
    onSelectConversation: (
      conversationId: string,
    ) => boolean | void | Promise<boolean | void>;
  }) => {
    conversationListHarness.onSelectConversation = onSelectConversation;
    return null;
  },
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("ChatWorkbenchPage conversation selection races", () => {
  beforeEach(() => {
    resetChatWorkbenchTestState();
    installChatWorkbenchTestEnvironment();
    conversationListHarness.onSelectConversation = undefined;
  });

  it("switches back to the previous conversation before the selection effect syncs", async () => {
    const baseService = createMockWorkbenchService();
    const releaseSecondConversation = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          await releaseSecondConversation.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    renderChatWorkbenchPage();

    await waitFor(() => {
      expect(conversationListHarness.onSelectConversation).toBeDefined();
      expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
    });

    const switchToSecond = Promise.resolve(
      conversationListHarness.onSelectConversation?.("conv-002"),
    );
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");

    const switchBack = Promise.resolve(
      conversationListHarness.onSelectConversation?.("conv-001"),
    );
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");

    releaseSecondConversation.resolve();
    await Promise.all([switchToSecond, switchBack]);

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");
  });
});

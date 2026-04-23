import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkbenchStore } from "@/store/workbench-store";

describe("useWorkbenchStore", () => {
  beforeEach(() => {
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
    vi.useRealTimers();
  });

  it("sends agent text message and updates active conversation metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-23T10:30:00"));

    const before = useWorkbenchStore.getState();

    before.sendAgentTextMessage("  已经帮你备注好了，下午再跟进。  ");

    const next = useWorkbenchStore.getState();
    const activeMessages = next.messagesByConversationId[next.activeConversationId];
    const latestMessage = activeMessages.at(-1);
    const activeConversation = next.conversationListsByScope[next.activeAccountId][0];

    expect(latestMessage).toMatchObject({
      conversationId: next.activeConversationId,
      role: "agent",
      status: "sent",
      content: {
        type: "text",
        text: "已经帮你备注好了，下午再跟进。",
      },
    });
    expect(next.activeMessageSeq).toBe(before.activeMessageSeq + 1);
    expect(next.sinceVersion).toBe(before.sinceVersion + 1);
    expect(activeConversation.preview).toBe("已经帮你备注好了，下午再跟进。");
    expect(activeConversation.unread).toBe(0);
    expect(activeConversation.updatedAt).toBe("2026-04-23 10:30:00");
  });

  it("ignores blank messages", () => {
    const before = useWorkbenchStore.getState();

    before.sendAgentTextMessage("   ");

    const next = useWorkbenchStore.getState();

    expect(next.activeMessageSeq).toBe(before.activeMessageSeq);
    expect(next.sinceVersion).toBe(before.sinceVersion);
    expect(next.messagesByConversationId[next.activeConversationId]).toHaveLength(
      before.messagesByConversationId[before.activeConversationId].length,
    );
  });

  it("switches account and keeps the active mode conversation in sync", () => {
    const store = useWorkbenchStore.getState();

    store.setActiveMode("group");
    store.setActiveAccount("ndt");

    const next = useWorkbenchStore.getState();

    expect(next.activeAccountId).toBe("ndt");
    expect(next.activeMode).toBe("group");
    expect(next.activeConversationId).toBe("conv-005");
    expect(next.activeMessageSeq).toBe(
      next.messagesByConversationId[next.activeConversationId].length,
    );
  });
});

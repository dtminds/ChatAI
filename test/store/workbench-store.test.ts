import { beforeEach, describe, expect, it } from "vitest";
import { resetWorkbenchService } from "@/pages/chat/api/workbench-service";
import { useWorkbenchStore } from "@/store/workbench-store";

describe("useWorkbenchStore", () => {
  beforeEach(() => {
    resetWorkbenchService();
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("bootstraps the first account, conversation, and read state", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.bootstrapStatus).toBe("ready");
    expect(state.me).toMatchObject({
      displayName: "林洒",
      id: "emp-001",
    });
    expect(state.activeAccountId).toBe("drc");
    expect(state.activeConversationId).toBe("conv-001");
    expect(state.messagesByConversationId["conv-001"].length).toBeGreaterThan(0);
    expect(state.conversationListsByScope.drc[0]).toMatchObject({
      id: "conv-001",
      unread: 0,
    });
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(11);
  });

  it("sends a message optimistically and reconciles it on poll", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("已经帮你备注好了，下午再跟进。");

    let state = useWorkbenchStore.getState();
    let latestMessage =
      state.messagesByConversationId[state.activeConversationId].at(-1);

    expect(latestMessage).toMatchObject({
      clientMessageId: expect.stringMatching(/^local_/),
      content: {
        text: "已经帮你备注好了，下午再跟进。",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
    expect(state.pendingMessages).toHaveLength(1);
    expect(state.conversationListsByScope[state.activeAccountId][0].preview).toBe(
      "已经帮你备注好了，下午再跟进。",
    );

    await useWorkbenchStore.getState().pollWorkbench();

    state = useWorkbenchStore.getState();
    latestMessage = state.messagesByConversationId[state.activeConversationId].at(-1);

    expect(latestMessage).toMatchObject({
      remoteMessageId: expect.stringMatching(/^msg-server-/),
      status: "sent",
    });
    expect(state.pendingMessages).toHaveLength(0);
    expect(state.sinceVersion).toBeGreaterThan(0);
  });

  it("switches account and falls back to the first available mode", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeMode).toBe("single");
    expect(state.activeConversationId).toBe("conv-005");
    expect(state.conversationListsByScope.ndt[0].unread).toBe(0);
  });

  it("marks send failures after polling an offline account", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败");
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const latestMessage =
      state.messagesByConversationId[state.activeConversationId].at(-1);

    expect(latestMessage).toMatchObject({
      failReason: "企微账号离线",
      status: "failed",
    });
    expect(state.pendingMessages).toHaveLength(0);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { createWorkbenchStore, useWorkbenchStore } from "@/store/workbench-store";

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

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
    expect(state.conversationListsByScope.ndt[0].unread).toBe(1);
  });

  it("marks send failures after polling a rejected message", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const latestMessage =
      state.messagesByConversationId[state.activeConversationId].at(-1);

    expect(latestMessage).toMatchObject({
      failReason: "模拟发送失败",
      status: "failed",
    });
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("retries a failed text message by resending it as a new pending message", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const beforeRetryCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;
    const failedMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

    expect(failedMessage).toMatchObject({
      status: "failed",
    });

    await useWorkbenchStore.getState().retryFailedMessage(failedMessage!.id);

    const state = useWorkbenchStore.getState();
    const latestMessage = state.messagesByConversationId["conv-001"].at(-1);

    expect(state.messagesByConversationId["conv-001"]).toHaveLength(beforeRetryCount);
    expect(latestMessage).toMatchObject({
      content: {
        text: "这条消息会失败 [fail]",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
    expect(latestMessage?.id).not.toBe(failedMessage?.id);
  });

  it("recovers by reloading the current scope when the poll cursor is invalidated", async () => {
    const baseService = createMockWorkbenchService();
    let shouldInvalidateCursor = true;

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        if (shouldInvalidateCursor) {
          shouldInvalidateCursor = false;
          throw {
            code: "WORKBENCH_CURSOR_INVALIDATED",
            message: "cursor invalidated",
            status: 409,
          };
        }

        return baseService.poll(request);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.pollState.status).toBe("idle");
    expect(state.activeConversationId).toBe("conv-001");
    expect(state.messagesByConversationId["conv-001"].length).toBeGreaterThan(0);
    expect(state.sinceVersion).toBe(0);
  });

  it("preserves the current conversation and unrelated pending messages during cursor recovery", async () => {
    const baseService = createMockWorkbenchService();
    let shouldInvalidateCursor = true;

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        if (shouldInvalidateCursor) {
          shouldInvalidateCursor = false;
          throw {
            code: "WORKBENCH_CURSOR_INVALIDATED",
            message: "cursor invalidated",
            status: 409,
          };
        }

        return baseService.poll(request);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("待回收消息");
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    const pendingBeforeRecovery = [...useWorkbenchStore.getState().pendingMessages];

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.activeConversationId).toBe("conv-002");
    expect(state.pendingMessages).toEqual(pendingBeforeRecovery);
    expect(state.sinceVersion).toBe(0);
  });

  it("drops stale cursor recovery results after the active account changes", async () => {
    const baseService = createMockWorkbenchService();
    let shouldInvalidateCursor = true;
    const recoveryGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId) {
        if (accountId === "drc" && !shouldInvalidateCursor) {
          await recoveryGate.promise;
        }

        return baseService.getConversations(accountId);
      },
      async poll(request) {
        if (shouldInvalidateCursor) {
          shouldInvalidateCursor = false;
          throw {
            code: "WORKBENCH_CURSOR_INVALIDATED",
            message: "cursor invalidated",
            status: 409,
          };
        }

        return baseService.poll(request);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const recoveryPromise = useWorkbenchStore.getState().pollWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    recoveryGate.resolve();
    await recoveryPromise;

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeConversationId).toBe("conv-005");
  });

  it("loads older messages before the current first sequence", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    let state = useWorkbenchStore.getState();

    expect(state.messagesByConversationId["conv-001"]).toHaveLength(5);
    expect(state.messagesByConversationId["conv-001"][0]).toMatchObject({
      id: "msg-006",
      seq: 6,
    });
    expect(state.hasMoreHistoryByConversationId["conv-001"]).toBe(true);

    await useWorkbenchStore.getState().loadOlderMessages();

    state = useWorkbenchStore.getState();

    expect(state.messagesByConversationId["conv-001"]).toHaveLength(10);
    expect(state.messagesByConversationId["conv-001"][0]).toMatchObject({
      id: "msg-001",
      seq: 1,
    });
    expect(state.hasMoreHistoryByConversationId["conv-001"]).toBe(true);

    await useWorkbenchStore.getState().loadOlderMessages();

    expect(
      useWorkbenchStore.getState().hasMoreHistoryByConversationId["conv-001"],
    ).toBe(false);
  });

  it("drops stale bootstrap read results after the active conversation changes", async () => {
    const baseService = createMockWorkbenchService();
    const bootstrapReadStarted = createDeferred();
    const bootstrapReadGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async markConversationRead(conversationId) {
        if (conversationId === "conv-001") {
          bootstrapReadStarted.resolve();
          await bootstrapReadGate.promise;
        }

        return baseService.markConversationRead(conversationId);
      },
    });

    const initializePromise = useWorkbenchStore.getState().initializeWorkbench();

    await bootstrapReadStarted.promise;
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    bootstrapReadGate.resolve();
    await initializePromise;

    const state = useWorkbenchStore.getState();
    const conv001 = state.conversationListsByScope.drc.find(
      (conversation) => conversation.id === "conv-001",
    );
    const conv002 = state.conversationListsByScope.drc.find(
      (conversation) => conversation.id === "conv-002",
    );

    expect(state.activeConversationId).toBe("conv-002");
    expect(conv001?.unread).toBeGreaterThan(0);
    expect(conv002?.unread).toBe(0);
  });

  it("isolates scope request tracking across store instances", async () => {
    const baseService = createMockWorkbenchService();
    const slowConversationGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          await slowConversationGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    const storeA = createWorkbenchStore();
    const storeB = createWorkbenchStore();

    await storeA.getState().initializeWorkbench();
    await storeB.getState().initializeWorkbench();

    const slowLoad = storeA.getState().setActiveConversation("conv-002");
    const otherStoreLoad = storeB.getState().setActiveConversation("conv-003");

    await otherStoreLoad;
    slowConversationGate.resolve();
    await slowLoad;

    const stateA = storeA.getState();
    const stateB = storeB.getState();

    expect(stateA.activeConversationId).toBe("conv-002");
    expect(stateA.isConversationLoading).toBe(false);
    expect(stateA.messagesByConversationId["conv-002"]).toBeDefined();
    expect(stateB.activeConversationId).toBe("conv-003");
  });

  it("ignores stale conversation loads when switching conversations quickly", async () => {
    const baseService = createMockWorkbenchService();
    const slowConversationGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          await slowConversationGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const slowLoad = useWorkbenchStore.getState().setActiveConversation("conv-002");
    const fastLoad = useWorkbenchStore.getState().setActiveConversation("conv-003");

    await fastLoad;
    slowConversationGate.resolve();
    await slowLoad;

    const state = useWorkbenchStore.getState();

    expect(state.activeConversationId).toBe("conv-003");
    expect(state.messagesByConversationId["conv-002"]).toBeUndefined();
    expect(state.messagesByConversationId["conv-003"].every((message) => message.conversationId === "conv-003")).toBe(true);
  });

  it("drops stale poll responses after the active scope changes", async () => {
    const baseService = createMockWorkbenchService();
    const pollGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        await pollGate.promise;
        return baseService.poll(request);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const previousSinceVersion = useWorkbenchStore.getState().sinceVersion;
    const pollPromise = useWorkbenchStore.getState().pollWorkbench();

    await useWorkbenchStore.getState().setActiveConversation("conv-002");
    pollGate.resolve();
    await pollPromise;

    const state = useWorkbenchStore.getState();

    expect(state.activeConversationId).toBe("conv-002");
    expect(state.pollState.status).toBe("idle");
    expect(state.sinceVersion).toBe(previousSinceVersion);
  });

  it("tracks send status per conversation instead of globally", async () => {
    const baseService = createMockWorkbenchService();
    const sendGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        if (payload.conversationId === "conv-001") {
          await sendGate.promise;
        }

        return baseService.sendMessage(payload);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const sendPromise = useWorkbenchStore.getState().sendAgentTextMessage("并发发送测试");

    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    let state = useWorkbenchStore.getState();

    expect(state.sendStatusByConversationId["conv-001"]).toBe("sending");
    expect(state.sendStatusByConversationId["conv-002"] ?? "idle").toBe("idle");

    sendGate.resolve();
    await sendPromise;

    state = useWorkbenchStore.getState();

    expect(state.sendStatusByConversationId["conv-001"]).toBe("idle");
  });

  it("tracks history loading per conversation instead of globally", async () => {
    const baseService = createMockWorkbenchService();
    const historyGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq != null) {
          await historyGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const historyPromise = useWorkbenchStore.getState().loadOlderMessages();

    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    let state = useWorkbenchStore.getState();

    expect(state.historyStatusByConversationId["conv-001"]).toBe("loading");
    expect(state.historyStatusByConversationId["conv-002"] ?? "idle").toBe("idle");

    historyGate.resolve();
    await historyPromise;

    state = useWorkbenchStore.getState();

    expect(state.historyStatusByConversationId["conv-001"]).toBe("idle");
  });

  it("tracks takeover status per account instead of globally", async () => {
    const baseService = createMockWorkbenchService();
    const takeoverGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async takeOverAccount(accountId) {
        if (accountId === "ndt") {
          await takeoverGate.promise;
        }

        return baseService.takeOverAccount(accountId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const takeoverPromise = useWorkbenchStore.getState().takeOverAccount("ndt");

    await useWorkbenchStore.getState().setActiveAccount("drc");

    let state = useWorkbenchStore.getState();

    expect(state.takeoverStatusByAccountId.ndt).toBe("taking-over");
    expect(state.takeoverStatusByAccountId.drc ?? "idle").toBe("idle");

    takeoverGate.resolve();
    await takeoverPromise;

    state = useWorkbenchStore.getState();

    expect(state.takeoverStatusByAccountId.ndt).toBeUndefined();
  });

  it("keeps unread counts when switching into an untaken account", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const state = useWorkbenchStore.getState();

    expect(state.accounts.find((account) => account.id === "ndt")?.unreadCount).toBe(1);
    expect(state.conversationListsByScope.ndt[0].unread).toBe(1);
  });

  it("does not send messages from an untaken account", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const beforeMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-005"].length;

    await useWorkbenchStore.getState().sendAgentTextMessage("未接管不能发送");

    const state = useWorkbenchStore.getState();

    expect(state.messagesByConversationId["conv-005"]).toHaveLength(beforeMessages);
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("takes over an account and then allows read state and sending", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    await useWorkbenchStore.getState().takeOverAccount("ndt");
    await useWorkbenchStore.getState().setActiveConversation("conv-006");
    await useWorkbenchStore.getState().setActiveConversation("conv-005");
    await useWorkbenchStore.getState().sendAgentTextMessage("接管后可以发送");

    const state = useWorkbenchStore.getState();

    expect(state.accounts.find((account) => account.id === "ndt")).toMatchObject({
      takenOverEmployeeId: "emp-001",
      unreadCount: 0,
    });
    expect(state.conversationListsByScope.ndt[0]).toMatchObject({
      id: "conv-005",
      unread: 0,
    });
    expect(state.messagesByConversationId["conv-005"].at(-1)).toMatchObject({
      content: {
        text: "接管后可以发送",
        type: "text",
      },
      role: "agent",
      status: "sending",
    });
  });

  it("captures scope transition errors instead of failing silently", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002" && options?.beforeSeq == null) {
          throw new Error("切换会话失败");
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    const state = useWorkbenchStore.getState();

    expect(state.isConversationLoading).toBe(false);
    expect(state.scopeTransitionError).toBe("切换会话失败");
  });
});

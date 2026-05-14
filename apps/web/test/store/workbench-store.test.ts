import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  resetWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import {
  seedConversations,
  seedMessages,
} from "@/pages/chat/mock-data";
import { createWorkbenchStore, useWorkbenchStore } from "@/store/workbench-store";

vi.mock("@/pages/chat/api/media-upload-service", () => ({
  resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
}));

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

function getSeedUnreadAfterRead(accountId: string, readConversationId: string) {
  return (seedConversations[accountId] ?? []).reduce(
    (total, conversation) =>
      total + (conversation.id === readConversationId ? 0 : conversation.unread),
    0,
  );
}

function getSeedUnreadAfterReadAndUnread(
  accountId: string,
  readConversationId: string,
  unreadConversationId: string,
) {
  return (seedConversations[accountId] ?? []).reduce((total, conversation) => {
    if (conversation.id === readConversationId) {
      return total;
    }

    if (conversation.id === unreadConversationId) {
      return total + 1;
    }

    return total + conversation.unread;
  }, 0);
}

function getSeedMessageIdAt(conversationId: string, index: number) {
  return seedMessages[conversationId]?.[index]?.id;
}

describe("useWorkbenchStore", () => {
  beforeEach(() => {
    resetWorkbenchService();
    vi.mocked(resolveImageSegmentsForSend).mockImplementation(
      async (_conversationId, segments) => segments,
    );
    useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
  });

  it("bootstraps the first account, conversation, and read state", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.bootstrapStatus).toBe("ready");
    expect(state.me).toMatchObject({
      displayName: "林洒",
      id: "sub-user-001",
    });
    expect(state.activeAccountId).toBe("drc");
    expect(state.activeConversationId).toBe("conv-001");
    expect(state.messagesByConversationId["conv-001"].length).toBeGreaterThan(0);
    expect(state.conversationListsByScope.drc[0]).toMatchObject({
      id: "conv-001",
      unread: 0,
    });
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(
      getSeedUnreadAfterRead("drc", "conv-001"),
    );
  });

  it("requests 50 messages for initial and switched conversation pages", async () => {
    const baseService = createMockWorkbenchService();
    const observedLimits: Array<number | undefined> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        observedLimits.push(options?.limit);

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    expect(observedLimits).toEqual([50, 50]);
  });

  it("loads group members once when opening a group conversation", async () => {
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.getGroupMembers(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveConversation("conv-001");
    await useWorkbenchStore.getState().setActiveMode("group");

    const state = useWorkbenchStore.getState();

    expect(observedConversationIds).toEqual(["conv-004"]);
    expect(state.groupMembersByConversationId["conv-004"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "群主小可",
          type: 2,
        }),
        expect.objectContaining({
          displayName: "小林",
          type: 1,
        }),
      ]),
    );
  });

  it("bootstraps conversations that contain video messages", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    const state = useWorkbenchStore.getState();

    expect(
      state.messagesByConversationId["conv-002"].some(
        (message) =>
          message.role !== "system" && message.content.type === "video",
      ),
    ).toBe(true);
    expect(state.bootstrapStatus).toBe("ready");
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
      status: "accepted",
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

  it("sends text and image segments as separate optimistic messages", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        text: "第一段[打脸]",
        type: "text",
      },
      {
        alt: "截图",
        localUrl: "data:image/png;base64,abc",
        type: "image",
        width: 320,
        height: 240,
      },
      {
        text: "第二段[强]",
        type: "text",
      },
    ]);

    const state = useWorkbenchStore.getState();
    const latestMessages =
      state.messagesByConversationId[state.activeConversationId].slice(-3);

    expect(latestMessages).toMatchObject([
      {
        content: {
          text: "第一段[打脸]",
          type: "text",
        },
        role: "agent",
        status: "accepted",
      },
      {
        content: {
          alt: "截图",
          imageUrl: "data:image/png;base64,abc",
          type: "image",
          width: 320,
          height: 240,
        },
        role: "agent",
        status: "accepted",
      },
      {
        content: {
          text: "第二段[强]",
          type: "text",
        },
        role: "agent",
        status: "accepted",
      },
    ]);
    expect(state.pendingMessages).toHaveLength(3);
    expect(state.conversationListsByScope[state.activeAccountId][0].preview).toBe(
      "第二段[强]",
    );
  });

  it("reconciles polled messages by optNo while keeping unmatched optimistic messages", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        sendIndex += 1;

        return {
          clientMessageId: payload.clientMessageId,
          messageId: `opt-${sendIndex}`,
          optNo: `opt-${sendIndex}`,
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              clientMessageId: undefined,
              content: {
                text: "服务端文本",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              messageId: "remote-text-001",
              optNo: "opt-2",
              seatId: "drc",
              senderType: "agent",
              seq: 999,
              status: "read",
            },
          ],
          conversationChanges: [],
          messageStatusChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });
    vi.mocked(resolveImageSegmentsForSend).mockResolvedValue([
      {
        alt: "截图 A",
        fileId: "chat-images/conv-001/a.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
      },
      {
        text: "本地文本",
        type: "text",
      },
      {
        alt: "截图 B",
        fileId: "chat-images/conv-001/b.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/b.png",
      },
    ]);

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "截图 A",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      },
      {
        text: "本地文本",
        type: "text",
      },
      {
        alt: "截图 B",
        localUrl: "data:image/png;base64,bbb",
        type: "image",
      },
    ]);

    let latestMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].slice(-3);

    expect(latestMessages.map((message) => message.optNo)).toEqual([
      "opt-1",
      "opt-2",
      "opt-3",
    ]);

    await useWorkbenchStore.getState().pollWorkbench();

    latestMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].slice(-3);

    expect(latestMessages).toMatchObject([
      {
        content: {
          type: "image",
        },
        optNo: "opt-1",
        remoteMessageId: "opt-1",
        status: "accepted",
      },
      {
        content: {
          text: "服务端文本",
          type: "text",
        },
        id: "remote-text-001",
        optNo: "opt-2",
        remoteMessageId: "remote-text-001",
        status: "read",
      },
      {
        content: {
          type: "image",
        },
        optNo: "opt-3",
        remoteMessageId: "opt-3",
        status: "accepted",
      },
    ]);
  });

  it("resolves image segments before sending them to the message API", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockResolvedValue([
      {
        alt: "截图 A",
        fileId: "chat-images/conv-001/a.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
      },
      {
        alt: "截图 B",
        fileId: "chat-images/conv-001/b.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/b.png",
      },
    ]);

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "截图 A",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      },
      {
        alt: "截图 B",
        localUrl: "data:image/png;base64,bbb",
        type: "image",
      },
    ]);

    expect(resolveImageSegmentsForSend).toHaveBeenCalledTimes(1);
    expect(resolveImageSegmentsForSend).toHaveBeenCalledWith("conv-001", [
      {
        alt: "截图 A",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      },
      {
        alt: "截图 B",
        localUrl: "data:image/png;base64,bbb",
        type: "image",
      },
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        segment: {
          alt: "截图 A",
          fileId: "chat-images/conv-001/a.png",
          type: "image",
          url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        segment: {
          alt: "截图 B",
          fileId: "chat-images/conv-001/b.png",
          type: "image",
          url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/b.png",
        },
      }),
    );
  });

  it("resolves composer image segments even when url is the local data URL", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);
    const dataUrl = "data:image/png;base64,aaa";

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockResolvedValue([
      {
        alt: "location_bg.png",
        fileId: "chat-images/conv-001/location_bg.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/location_bg.png",
      },
      {
        text: "12321",
        type: "text",
      },
    ]);

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "location_bg.png",
        localUrl: dataUrl,
        type: "image",
        url: dataUrl,
      },
      {
        text: "12321",
        type: "text",
      },
    ]);

    expect(resolveImageSegmentsForSend).toHaveBeenCalledWith("conv-001", [
      {
        alt: "location_bg.png",
        localUrl: dataUrl,
        type: "image",
        url: dataUrl,
      },
      {
        text: "12321",
        type: "text",
      },
    ]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        segment: {
          alt: "location_bg.png",
          fileId: "chat-images/conv-001/location_bg.png",
          type: "image",
          url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/location_bg.png",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        segment: {
          text: "12321",
          type: "text",
        },
      }),
    );
  });

  it("does not resolve image uploads before sending text-only messages", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("纯文本消息");

    expect(resolveImageSegmentsForSend).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        segment: {
          text: "纯文本消息",
          type: "text",
        },
      }),
    );
  });

  it("does not create optimistic image messages when image upload fails", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockRejectedValue(new Error("COS 上传失败"));

    await useWorkbenchStore.getState().initializeWorkbench();
    const beforeMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "截图",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      },
    ]);

    const state = useWorkbenchStore.getState();

    expect(result).toEqual({
      errorCode: "UNKNOWN",
      errorMessage: "COS 上传失败",
      reason: "image-upload",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(state.messagesByConversationId["conv-001"]).toEqual(beforeMessages);
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("does not create optimistic messages when the send API fails", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(async () => {
      throw new Error("发送接口失败");
    });

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const beforeMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        text: "这条不应落到消息列表",
        type: "text",
      },
    ]);

    expect(result).toEqual({
      errorCode: "UNKNOWN",
      errorMessage: "发送接口失败",
      reason: "send",
      ok: false,
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(useWorkbenchStore.getState().messagesByConversationId["conv-001"]).toEqual(
      beforeMessages,
    );
    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(0);
  });

  it("uses business error codes before HTTP status codes when the send API fails", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(async () => {
      throw {
        code: "SEAT_NOT_TAKEN_OVER",
        message: "当前账号尚未由你接管",
        status: 403,
      };
    });

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        text: "这条消息会返回业务错误",
        type: "text",
      },
    ]);

    expect(result).toEqual({
      errorCode: "SEAT_NOT_TAKEN_OVER",
      errorMessage: "当前账号尚未由你接管",
      reason: "send",
      ok: false,
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
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
      status: "accepted",
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

  it("loads the full seed page when the default message page covers all history", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-001"]).toHaveLength(
      seedMessages["conv-001"].length,
    );
    expect(state.messagesByConversationId["conv-001"][0]).toMatchObject({
      id: getSeedMessageIdAt("conv-001", 0),
      seq: 1,
    });
    expect(state.hasMoreHistoryByConversationId["conv-001"]).toBe(false);

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

  it("does not let bootstrap read receipts reclaim a newer account switch", async () => {
    const baseService = createMockWorkbenchService();
    const bootstrapMessagesStarted = createDeferred();
    const bootstrapMessagesGate = createDeferred();
    const accountSwitchMessagesStarted = createDeferred();
    const accountSwitchMessagesGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          bootstrapMessagesStarted.resolve();
          await bootstrapMessagesGate.promise;
        }

        if (conversationId === "conv-005" && options?.beforeSeq == null) {
          accountSwitchMessagesStarted.resolve();
          await accountSwitchMessagesGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    const initializePromise = useWorkbenchStore.getState().initializeWorkbench();

    await bootstrapMessagesStarted.promise;
    const accountSwitchPromise = useWorkbenchStore.getState().setActiveAccount("ndt");

    await accountSwitchMessagesStarted.promise;
    bootstrapMessagesGate.resolve();
    await initializePromise;

    accountSwitchMessagesGate.resolve();
    await accountSwitchPromise;

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeConversationId).toBe("conv-005");
    expect(state.isConversationLoading).toBe(false);
    expect(state.messagesByConversationId["conv-005"]).toBeDefined();
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
    let initialConversationLoad = true;

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
          initialConversationLoad = false;
          return baseService.getMessages(conversationId, {
            ...options,
            limit: 5,
          });
        }

        if (conversationId === "conv-001" && options?.beforeSeq != null) {
          await historyGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    expect(initialConversationLoad).toBe(false);
    useWorkbenchStore.setState((state) => ({
      hasMoreHistoryByConversationId: {
        ...state.hasMoreHistoryByConversationId,
        "conv-001": true,
      },
    }));

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
      async takeOverSeat(seatId) {
        if (seatId === "ndt") {
          await takeoverGate.promise;
        }

        return baseService.takeOverSeat(seatId);
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
      takenOverEmployeeId: "sub-user-001",
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
      status: "accepted",
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

  it("captures read receipt errors without marking the conversation transition as failed", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async markConversationRead(conversationId) {
        if (conversationId === "conv-002") {
          throw new Error("标记已读失败");
        }

        return baseService.markConversationRead(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    const state = useWorkbenchStore.getState();

    expect(state.activeConversationId).toBe("conv-002");
    expect(state.isConversationLoading).toBe(false);
    expect(state.scopeTransitionError).toBeUndefined();
    expect(state.readReceiptError).toBe("标记已读失败");
  });

  it("skips mark-read when the active account is not taken over by the current user", async () => {
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async markConversationRead(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.markConversationRead(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().setActiveConversation("conv-005");

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-005");
    expect(observedConversationIds).toEqual(["conv-001"]);
  });

  it("marks a read conversation unread when the active account is taken over", async () => {
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async markConversationUnread(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.markConversationUnread(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");
    await useWorkbenchStore.getState().markConversationUnread("conv-002");

    const state = useWorkbenchStore.getState();

    expect(observedConversationIds).toEqual(["conv-002"]);
    expect(state.conversationListsByScope.drc.find((conversation) => conversation.id === "conv-002")).toMatchObject({
      unread: 1,
    });
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(
      getSeedUnreadAfterReadAndUnread("drc", "conv-001", "conv-002"),
    );
  });

  it("skips mark-unread when the active account is not taken over by the current user", async () => {
    const baseService = createMockWorkbenchService();
    const observedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async markConversationUnread(conversationId) {
        observedConversationIds.push(conversationId);

        return baseService.markConversationUnread(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().markConversationUnread("conv-006");

    expect(observedConversationIds).toEqual([]);
  });

  it("pins a conversation and reloads the active account conversations", async () => {
    const baseService = createMockWorkbenchService();
    const observedPinnedConversationIds: string[] = [];
    const observedConversationScopes: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId) {
        observedConversationScopes.push(accountId);

        return baseService.getConversations(accountId);
      },
      async pinConversation(conversationId) {
        observedPinnedConversationIds.push(conversationId);

        return baseService.pinConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationScopes.length = 0;

    await useWorkbenchStore.getState().pinConversation("conv-002");

    const state = useWorkbenchStore.getState();

    expect(observedPinnedConversationIds).toEqual(["conv-002"]);
    expect(observedConversationScopes).toEqual(["drc"]);
    expect(state.conversationListsByScope.drc.find((conversation) => conversation.id === "conv-002")).toMatchObject({
      isPinned: true,
    });
  });

  it("keeps pin reload results when the user switches accounts before reload finishes", async () => {
    const baseService = createMockWorkbenchService();
    const reloadRequested = createDeferred();
    const deferredReload =
      createDeferred<Awaited<ReturnType<typeof baseService.getConversations>>>();
    let deferDrcReload = false;

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId) {
        if (deferDrcReload && accountId === "drc") {
          reloadRequested.resolve();

          return deferredReload.promise;
        }

        return baseService.getConversations(accountId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    deferDrcReload = true;

    const pinPromise = useWorkbenchStore.getState().pinConversation("conv-002");
    await reloadRequested.promise;
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    deferredReload.resolve(await baseService.getConversations("drc"));
    await pinPromise;

    const state = useWorkbenchStore.getState();
    expect(state.activeAccountId).toBe("ndt");
    expect(state.conversationListsByScope.drc.find((conversation) => conversation.id === "conv-002")).toMatchObject({
      isPinned: true,
    });
  });

  it("skips pin when the active account is not taken over by the current user", async () => {
    const baseService = createMockWorkbenchService();
    const observedPinnedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async pinConversation(conversationId) {
        observedPinnedConversationIds.push(conversationId);

        return baseService.pinConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().pinConversation("conv-006");

    expect(observedPinnedConversationIds).toEqual([]);
  });

  it("unpins a conversation and reloads the active account conversations", async () => {
    const baseService = createMockWorkbenchService();
    const observedUnpinnedConversationIds: string[] = [];
    const observedConversationScopes: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId) {
        observedConversationScopes.push(accountId);

        return baseService.getConversations(accountId);
      },
      async unpinConversation(conversationId) {
        observedUnpinnedConversationIds.push(conversationId);

        return baseService.unpinConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationScopes.length = 0;

    await useWorkbenchStore.getState().unpinConversation("conv-001");

    const state = useWorkbenchStore.getState();

    expect(observedUnpinnedConversationIds).toEqual(["conv-001"]);
    expect(observedConversationScopes).toEqual(["drc"]);
    expect(state.conversationListsByScope.drc.find((conversation) => conversation.id === "conv-001")).toMatchObject({
      isPinned: undefined,
    });
  });

  it("deletes a conversation locally without reloading conversations", async () => {
    const baseService = createMockWorkbenchService();
    const observedDeletedConversationIds: string[] = [];
    const observedConversationScopes: string[] = [];

    setWorkbenchService({
      ...baseService,
      async deleteConversation(conversationId) {
        observedDeletedConversationIds.push(conversationId);

        return baseService.deleteConversation(conversationId);
      },
      async getConversations(accountId) {
        observedConversationScopes.push(accountId);

        return baseService.getConversations(accountId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationScopes.length = 0;

    await useWorkbenchStore.getState().deleteConversation("conv-003");

    const state = useWorkbenchStore.getState();
    expect(observedDeletedConversationIds).toEqual(["conv-003"]);
    expect(observedConversationScopes).toEqual([]);
    expect(state.conversationListsByScope.drc.map((conversation) => conversation.id)).not.toContain("conv-003");
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(
      getSeedUnreadAfterRead("drc", "conv-001") - 4,
    );
  });

  it("selects the next conversation after deleting the active conversation", async () => {
    const baseService = createMockWorkbenchService();
    const observedMessageConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        observedMessageConversationIds.push(conversationId);

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedMessageConversationIds.length = 0;

    await useWorkbenchStore.getState().deleteConversation("conv-001");

    const state = useWorkbenchStore.getState();
    expect(state.conversationListsByScope.drc.map((conversation) => conversation.id)).not.toContain("conv-001");
    expect(state.activeConversationId).toBe("conv-002");
    expect(observedMessageConversationIds).toEqual(["conv-002"]);
    expect(state.messagesByConversationId["conv-002"]?.length).toBeGreaterThan(0);
  });

  it("resets active message sequence immediately when deleting the active conversation", async () => {
    const baseService = createMockWorkbenchService();
    const messageLoadStarted = createDeferred();
    const messageLoadGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-002") {
          messageLoadStarted.resolve();
          await messageLoadGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    expect(useWorkbenchStore.getState().activeMessageSeq).toBeGreaterThan(0);

    const deletePromise = useWorkbenchStore.getState().deleteConversation("conv-001");
    await messageLoadStarted.promise;

    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-002");
    expect(useWorkbenchStore.getState().activeMessageSeq).toBe(0);

    messageLoadGate.resolve();
    await deletePromise;
  });

  it("skips delete when the active account is not taken over by the current user", async () => {
    const baseService = createMockWorkbenchService();
    const observedDeletedConversationIds: string[] = [];

    setWorkbenchService({
      ...baseService,
      async deleteConversation(conversationId) {
        observedDeletedConversationIds.push(conversationId);

        return baseService.deleteConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().deleteConversation("conv-006");

    expect(observedDeletedConversationIds).toEqual([]);
  });

  it("uses a fallback read receipt error when the thrown error message is empty", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async markConversationRead(conversationId) {
        if (conversationId === "conv-002") {
          throw new Error("");
        }

        return baseService.markConversationRead(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    expect(useWorkbenchStore.getState().readReceiptError).toBe("标记已读失败");
  });
});

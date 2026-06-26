import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { adaptMessage } from "@/pages/chat/api/workbench-adapter";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { seedMessages } from "@/pages/chat/mock-data";
import {
  createWorkbenchStore,
  MAX_CONVERSATION_LIST_CACHE_SEATS,
  useWorkbenchStore,
} from "@/store/workbench-store";
import type { ChatMessage, Conversation, Message } from "@/pages/chat/chat-types";
import type {
  WorkbenchConversationSummaryDto,
  WorkbenchFullAutoAnswerStatusResponse,
  WorkbenchHistoryMessagePageDto,
  WorkbenchMessageDto,
  WorkbenchPollResponse,
  WorkbenchSmartReplyPollRequest,
} from "@chatai/contracts";
import { resetWorkbenchStoreTestState } from "./workbench-store-test-utils";
import { createFreshWorkbenchStoreForTest } from "./workbench-store-test-utils";

vi.mock("@/pages/chat/api/media-upload-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/api/media-upload-service")>();

  return {
    ...actual,
    resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
  };
});

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

async function waitForStoreAssertion(assertion: () => void) {
  let lastError: unknown;

  for (let index = 0; index < 20; index += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

function getSeedMessageIdAt(conversationId: string, index: number) {
  return seedMessages[conversationId]?.[index] ? String(index + 1) : undefined;
}

function createCachedConversation(accountId: string): Conversation {
  return {
    accountId,
    agentMode: "semi",
    customerAvatarUrl: "",
    customerId: `${accountId}-customer`,
    customerName: `${accountId} 客户`,
    id: `${accountId}-conversation`,
    mode: "single",
    preview: "缓存会话",
    priority: "medium",
    quietFor: "刚刚",
    unread: 0,
    updatedAt: "刚刚",
  };
}

function isChatMessage(message: Message | undefined): message is ChatMessage {
  return Boolean(message && message.role !== "system");
}

function createHistoryMessageDto(
  id: string,
  seq: number,
  text: string,
): WorkbenchMessageDto {
  return {
    content: { text },
    contentType: "text",
    conversationId: "conv-001",
    createdAt: 1_778_400_000_000 + seq * 1_000,
    customerId: "cust-001",
    msgid: id,
    rawMsgtype: "text",
    seatId: "drc",
    senderType: seq % 2 === 0 ? "agent" : "customer",
    seq,
    status: "sent",
  };
}

function createDownloadFileMessageDto({
  downloadStatus,
  fileUrl,
  id,
  seq,
}: {
  downloadStatus: "ing" | "finished" | "failed";
  fileUrl: string;
  id: string;
  seq: number;
}): WorkbenchMessageDto {
  return {
    content: {
      downloadStatus,
      extension: "pdf",
      fileName: "报价单.pdf",
      fileSerialNo: `serial-${id}`,
      fileSizeLabel: "2 KB",
      fileUrl,
      sourceLabel: "文件",
    },
    contentType: "file",
    conversationId: "conv-001",
    createdAt: 1_778_400_000_000 + seq * 1_000,
    customerId: "cust-001",
    msgid: id,
    rawMsgtype: "file",
    seatId: "drc",
    senderType: "customer",
    seq,
    status: "sent",
  };
}

function createSmartReplyTextMessageDto({
  conversationId = "conv-001",
  createdAt,
  id,
  isRevoked = false,
  senderType = "customer",
  seq,
  text,
}: {
  conversationId?: string;
  createdAt?: number;
  id: string;
  isRevoked?: boolean;
  senderType?: "customer" | "agent";
  seq: number;
  text: string;
}): WorkbenchMessageDto {
  return {
    content: { text },
    contentType: "text",
    conversationId,
    createdAt: createdAt ?? 1_778_400_000_000 + seq * 1_000,
    customerId: "cust-001",
    msgid: id,
    rawMsgtype: "text",
    seatId: "drc",
    senderType,
    seq,
    isRevoked,
    status: "sent",
  };
}

function createSmartReplyVoiceMessageDto({
  id,
  seq,
  transVoiceText,
}: {
  id: string;
  seq: number;
  transVoiceText?: string;
}): WorkbenchMessageDto {
  return {
    content: {
      audioUrl: `https://b5.bokr.com.cn/s5/msg/20260525/${id}.amr`,
      durationLabel: "11\"",
      playbackUrl: `https://b5.bokr.com.cn/s5/playable-voice/20260525/${id}.wav`,
      transFileUrlPersisted: true,
      transVoiceText,
    },
    contentType: "voice",
    conversationId: "conv-001",
    createdAt: 1_778_400_000_000 + seq * 1_000,
    customerId: "cust-001",
    msgid: id,
    rawMsgtype: "voice",
    seatId: "drc",
    senderType: "customer",
    seq,
    status: "sent",
  };
}

describe("useWorkbenchStore", () => {
  beforeEach(() => {
    resetWorkbenchStoreTestState();
    vi.mocked(resolveImageSegmentsForSend).mockImplementation(
      async (_conversationId, segments) => segments,
    );
  });

  it("defaults chat send permission to false before synchronization", () => {
    expect(createFreshWorkbenchStoreForTest().getState().hasChatSendPermission).toBe(
      false,
    );
  });

  it("changes active conversation full-auto through the workbench service", async () => {
    const baseService = createMockWorkbenchService();
    const changeConversationFullAuto = vi.fn().mockResolvedValue({
      aiHosted: false,
      conversationId: "conv-001",
      agentMode: "semi" as const,
      seatId: "drc",
    });

    setWorkbenchService({
      ...baseService,
      changeConversationFullAuto,
    });
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
      conversationListsByScope: {
        ...state.conversationListsByScope,
        drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
          conversation.id === "conv-001"
            ? {
                ...conversation,
                aiHosted: true,
                agentHostingStatus: "thinking",
                agentMode: "full",
              }
            : conversation,
        ),
      },
    }));

    await useWorkbenchStore.getState().changeActiveConversationFullAuto(false);

    expect(changeConversationFullAuto).toHaveBeenCalledWith("conv-001", {
      enabled: false,
    });
  });

  it("does not change full-auto when the active account cannot enable full-auto", async () => {
    const baseService = createMockWorkbenchService();
    const changeConversationFullAuto = vi.fn();

    setWorkbenchService({
      ...baseService,
      changeConversationFullAuto,
    });
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: false,
              fullAutoSwitch: false,
            }
          : account,
      ),
    }));

    await useWorkbenchStore.getState().changeActiveConversationFullAuto(true);

    expect(changeConversationFullAuto).not.toHaveBeenCalled();
  });

  it("changes the active account agent mode switch and patches local account state", async () => {
    const baseService = createMockWorkbenchService();
    const updateSeatAgentMode = vi.fn().mockResolvedValue({
      fullAutoSwitch: true,
      seatId: "drc",
      semiAutoSwitch: false,
    });

    setWorkbenchService({
      ...baseService,
      updateSeatAgentMode,
    });
    await useWorkbenchStore.getState().initializeWorkbench();

    await useWorkbenchStore.getState().changeActiveSeatAgentMode("semi", false);

    expect(updateSeatAgentMode).toHaveBeenCalledWith("drc", {
      mode: "semi",
      enabled: false,
    });
    expect(useWorkbenchStore.getState().accounts.find((account) => account.id === "drc")).toMatchObject({
      fullAutoSwitch: true,
      semiAutoSwitch: false,
    });
  });

  it("ignores duplicate active account agent mode switch changes while pending", async () => {
    const baseService = createMockWorkbenchService();
    const seatAgentModeChange = createDeferred<Awaited<ReturnType<typeof baseService.updateSeatAgentMode>>>();
    const updateSeatAgentMode = vi.fn(() => seatAgentModeChange.promise);

    setWorkbenchService({
      ...baseService,
      updateSeatAgentMode,
    });
    await useWorkbenchStore.getState().initializeWorkbench();

    const firstRequest = useWorkbenchStore
      .getState()
      .changeActiveSeatAgentMode("full", false);
    await waitForStoreAssertion(() => {
      expect(useWorkbenchStore.getState().seatAgentModeActionPending).toBe(true);
    });
    const secondRequest = useWorkbenchStore
      .getState()
      .changeActiveSeatAgentMode("full", true);

    expect(updateSeatAgentMode).toHaveBeenCalledTimes(1);
    seatAgentModeChange.resolve({
      fullAutoSwitch: false,
      seatId: "drc",
      semiAutoSwitch: true,
    });
    await Promise.all([firstRequest, secondRequest]);
    expect(useWorkbenchStore.getState().seatAgentModeActionPending).toBe(false);
  });

  it("ignores duplicate full-auto changes while a request is pending", async () => {
    const baseService = createMockWorkbenchService();
    const fullAutoChange = createDeferred<Awaited<ReturnType<typeof baseService.changeConversationFullAuto>>>();
    const changeConversationFullAuto = vi.fn(() => fullAutoChange.promise);

    setWorkbenchService({
      ...baseService,
      changeConversationFullAuto,
    });
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
    }));

    const firstRequest = useWorkbenchStore
      .getState()
      .changeActiveConversationFullAuto(true);
    await waitForStoreAssertion(() => {
      expect(useWorkbenchStore.getState().fullAutoActionPending).toBe(true);
    });
    const secondRequest = useWorkbenchStore
      .getState()
      .changeActiveConversationFullAuto(true);

    expect(changeConversationFullAuto).toHaveBeenCalledTimes(1);
    fullAutoChange.resolve({
      aiHosted: true,
      conversationId: "conv-001",
      agentMode: "full",
      seatId: "drc",
    });
    await Promise.all([firstRequest, secondRequest]);
    expect(useWorkbenchStore.getState().fullAutoActionPending).toBe(false);
  });

  it("keeps full-auto action errors separate from read receipt errors", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async changeConversationFullAuto() {
        throw new Error("取消托管失败");
      },
    });
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
      readReceiptError: "标记已读失败",
    }));

    await useWorkbenchStore.getState().changeActiveConversationFullAuto(false);

    expect(useWorkbenchStore.getState().readReceiptError).toBe("标记已读失败");
    expect(useWorkbenchStore.getState().fullAutoActionError).toBe("取消托管失败");
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
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(11);
  });

  it("clears user-scoped workbench data before another login initializes the workbench", async () => {
    const firstService = createMockWorkbenchService();
    const secondService = createMockWorkbenchService();
    const secondGetSeats = vi.fn(async () => [
      {
        avatar: "",
        description: "",
        hostSubUserId: "sub-user-002",
        lastMessageTime: 1_778_500_000_000,
        loginStatus: "online" as const,
        name: "B 用户席位",
        operatorName: "客服二号",
        phone: "",
        seatId: "b-seat",
        unreadCount: 0,
      },
    ]);
    const secondGetMe = vi.fn(async () => ({
      displayName: "客服二号",
      subUserId: "sub-user-002",
    }));

    setWorkbenchService(firstService);
    await useWorkbenchStore.getState().initializeWorkbench();

    expect(useWorkbenchStore.getState().bootstrapStatus).toBe("ready");
    expect(useWorkbenchStore.getState().activeAccountId).toBe("drc");

    useWorkbenchStore.getState().resetWorkbenchSession();
    setWorkbenchService({
      ...secondService,
      getMe: secondGetMe,
      getSeats: secondGetSeats,
    });
    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();
    expect(secondGetMe).toHaveBeenCalledTimes(1);
    expect(secondGetSeats).toHaveBeenCalledTimes(1);
    expect(state.bootstrapStatus).toBe("ready");
    expect(state.me).toMatchObject({ id: "sub-user-002" });
    expect(state.accounts).toHaveLength(1);
    expect(state.activeAccountId).toBe("b-seat");
    expect(state.conversationListsByScope).toEqual({ "b-seat": [] });
    expect(state.messagesByConversationId).toEqual({});
    expect(state.takeoverStatusByAccountId).toEqual({});
  });

  it("ignores stale initialize failures after the workbench session resets", async () => {
    const baseService = createMockWorkbenchService();
    const deferredSeats = createDeferred<never>();

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        return deferredSeats.promise;
      },
    });

    const initializePromise = useWorkbenchStore.getState().initializeWorkbench();

    await vi.waitFor(() => {
      expect(useWorkbenchStore.getState().bootstrapStatus).toBe("loading");
    });

    useWorkbenchStore.getState().resetWorkbenchSession();
    deferredSeats.reject(new Error("旧用户初始化失败"));
    await initializePromise;

    expect(useWorkbenchStore.getState()).toMatchObject({
      bootstrapError: undefined,
      bootstrapStatus: "idle",
    });
  });

  it("ignores stale poll responses after the workbench session resets", async () => {
    const baseService = createMockWorkbenchService();
    const deferredPoll = createDeferred<WorkbenchPollResponse>();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return deferredPoll.promise;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const pollPromise = useWorkbenchStore.getState().pollWorkbench();

    useWorkbenchStore.getState().resetWorkbenchSession();
    deferredPoll.resolve({
      activeConversationMessages: [],
      conversationChanges: [],
      nextMessageUpdateCursor: 99,
      nextSeatUpdateCursor: 88,
      nextVersion: 1_778_600_000_000,
      seatChanges: [
        {
          avatar: "",
          description: "私域客户管理",
          hostSubUserId: "sub-user-001",
          lastMessageTime: 1_778_600_000_000,
          loginStatus: "online",
          name: "德瑞可",
          operatorName: "小可",
          phone: "13296712905",
          seatId: "drc",
          unreadCount: 42,
        },
      ],
    });
    await pollPromise;

    expect(useWorkbenchStore.getState()).toMatchObject({
      accounts: [],
      bootstrapStatus: "idle",
      messageUpdateCursor: undefined,
      seatUpdateCursor: undefined,
      sinceVersion: 0,
    });
  });

  it("keeps the active poll latch when a stale poll finishes after another login", async () => {
    const baseService = createMockWorkbenchService();
    const firstPoll = createDeferred<WorkbenchPollResponse>();
    const secondPoll = createDeferred<WorkbenchPollResponse>();
    let pollCallCount = 0;

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        pollCallCount += 1;

        if (pollCallCount === 1) {
          return firstPoll.promise;
        }

        if (pollCallCount === 2) {
          return secondPoll.promise;
        }

        return baseService.poll(request);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const stalePollPromise = useWorkbenchStore.getState().pollWorkbench();

    useWorkbenchStore.getState().resetWorkbenchSession();
    await useWorkbenchStore.getState().initializeWorkbench();
    const activePollPromise = useWorkbenchStore.getState().pollWorkbench();

    firstPoll.resolve({
      activeConversationMessages: [],
      conversationChanges: [],
      nextVersion: 1_778_600_000_000,
      seatChanges: [],
    });
    await stalePollPromise;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(pollCallCount).toBe(2);

    secondPoll.resolve({
      activeConversationMessages: [],
      conversationChanges: [],
      nextVersion: 1_778_600_000_001,
      seatChanges: [],
    });
    await activePollPromise;
  });

  it("ignores stale seat summary refreshes after another login initializes matching seats", async () => {
    const baseService = createMockWorkbenchService();
    const deferredSeats = createDeferred<Awaited<ReturnType<typeof baseService.getSeats>>>();
    let shouldDeferSeats = false;

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        if (shouldDeferSeats) {
          return deferredSeats.promise;
        }

        return baseService.getSeats();
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    shouldDeferSeats = true;
    const refreshPromise = useWorkbenchStore.getState().refreshSeatSummaries();

    useWorkbenchStore.getState().resetWorkbenchSession();
    setWorkbenchService(baseService);
    await useWorkbenchStore.getState().initializeWorkbench();
    deferredSeats.resolve(
      (await baseService.getSeats()).map((seat) => ({
        ...seat,
        unreadCount: seat.seatId === "ndt" ? 42 : seat.unreadCount,
      })),
    );
    await refreshPromise;

    expect(useWorkbenchStore.getState()).toMatchObject({
      activeAccountId: "drc",
      bootstrapStatus: "ready",
    });
    expect(useWorkbenchStore.getState().accounts.find((account) => account.id === "ndt")?.unreadCount).toBe(1);
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

  it("keeps a loaded message page in message time order when seq order differs", async () => {
    const baseService = createMockWorkbenchService();
    const laterMessage = {
      ...createHistoryMessageDto("later-message", 100, "后写入但时间更晚"),
      createdAt: 1_778_400_030_000,
    };
    const earlierMessage = {
      ...createHistoryMessageDto("earlier-message", 101, "后写入但时间更早"),
      createdAt: 1_778_400_020_000,
    };

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001") {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [laterMessage, earlierMessage],
            scannedCount: 2,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].map((message) => message.uiMessageKey),
    ).toEqual(["101", "100"]);
  });

  it("keeps messages with invalid timestamps after timestamped page messages", async () => {
    const baseService = createMockWorkbenchService();
    const validLaterMessage = {
      ...createHistoryMessageDto("valid-later-message", 100, "有效时间较晚"),
      createdAt: 1_778_400_030_000,
    };
    const invalidTimestampMessage = {
      ...createHistoryMessageDto("invalid-time-message", 101, "没有有效时间"),
      createdAt: undefined,
    };
    const validEarlierMessage = {
      ...createHistoryMessageDto("valid-earlier-message", 102, "有效时间较早"),
      createdAt: 1_778_400_020_000,
    };

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001") {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [validLaterMessage, invalidTimestampMessage, validEarlierMessage],
            scannedCount: 3,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].map((message) => message.uiMessageKey),
    ).toEqual(["102", "100", "101"]);
  });

  it("keeps history page messages in message time order when seq order differs", async () => {
    const baseService = createMockWorkbenchService();
    const laterMessage = {
      ...createHistoryMessageDto("later-message", 100, "后写入但时间更晚"),
      createdAt: 1_778_400_030_000,
    };
    const earlierMessage = {
      ...createHistoryMessageDto("earlier-message", 101, "后写入但时间更早"),
      createdAt: 1_778_400_020_000,
    };

    setWorkbenchService({
      ...baseService,
      async getHistoryMessages(conversationId, options) {
        if (conversationId === "conv-001") {
          return {
            hasNext: false,
            hasPrev: false,
            messages: [laterMessage, earlierMessage],
          };
        }

        return baseService.getHistoryMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().openHistoryPanel("conv-001");

    expect(
      useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]?.messages.map(
        (message) => message.uiMessageKey,
      ),
    ).toEqual(["101", "100"]);
  });

  it("auto-generates only the latest unanswered customer message after loading a conversation", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-answered",
              seq: 1,
              text: "已经被客服回复的问题",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent",
              senderType: "agent",
              seq: 2,
              text: "客服已回复",
            }),
            ...Array.from({ length: 6 }, (_, index) =>
              createSmartReplyTextMessageDto({
                id: `msg-unanswered-${index + 1}`,
                seq: index + 3,
                text: `待回复问题 ${index + 1}`,
              }),
            ),
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 8,
      },
    ]);
  });

  it("waits for voice transcription before auto-generating smart reply", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyVoiceMessageDto({
              id: "msg-voice-9",
              seq: 9,
              transVoiceText: "",
            }),
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "voice-smart-reply-9" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
      async transcribeVoiceMessage(input) {
        return {
          messageSeq: input.messageSeq,
          transVoiceText: "识别后的客户问题",
          transVoiceTextPersisted: true,
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedAutoRequests).toEqual([]);

    await useWorkbenchStore.getState().transcribeVoiceMessage(
      "conv-001",
      "9",
    );

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 9,
      },
    ]);
  });

  it("adds latest page non-terminal smart replies to polling", async () => {
    const baseService = createMockWorkbenchService();
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              messageId: "9",
              status: "processing",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedSmartReplyRequests).toEqual([
      {
        conversationId: "conv-001",
        msgIds: [9],
      },
    ]);
  });

  it("merges smart replies returned with the latest message page", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "页面随带推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toMatchObject({
      "9": {
        content: "页面随带推荐",
        pollComplete: true,
      },
    });
  });

  it("drops page smart replies for messages whose raw type cannot trigger recommendations", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            {
              content: {
                alt: "表情",
                fileUrl: "https://cdn.example.com/emotion.gif",
              },
              contentType: "emotion",
              conversationId: "conv-001",
              createdAt: 1_778_400_010_000,
              customerId: "cust-001",
              msgid: "msg-emotion-10",
              rawMsgtype: "emotion",
              seatId: "drc",
              senderType: "customer",
              seq: 10,
              status: "sent",
            },
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "不应该展示",
              messageId: "10",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toEqual({});
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({});
  });

  it("keeps but hides page smart replies for messages already followed by an agent reply", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户问题",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent-8",
              senderType: "agent",
              seq: 8,
              text: "客服回复",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "最新客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "旧问题推荐",
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
            {
              assistantName: "智能助手",
              content: "最新问题推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toMatchObject({
      "7": {
        content: "旧问题推荐",
      },
      "9": {
        content: "最新问题推荐",
      },
    });
    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({
      "7": true,
    });
  });

  it("keeps but hides failed smart replies returned with the latest message page", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "最新客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              failReason: "model_error",
              generateStatus: 3,
              messageId: "9",
              pollComplete: true,
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.smartReplyByMessageIdByConversationId["conv-001"]).toMatchObject({
      "9": {
        failReason: "model_error",
        generateStatus: 3,
        pollComplete: true,
      },
    });
    expect(state.smartReplyHiddenMessageKeysByConversationId["conv-001"]).toEqual({
      "9": true,
    });
    expect(state.smartReplyPendingMessageKeysByConversationId["conv-001"]).toEqual(
      {},
    );
  });

  it("adds non-terminal smart replies from the message page to pending", async () => {
    const baseService = createMockWorkbenchService();
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              messageId: "9",
              status: "processing",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toMatchObject({
      "9": true,
    });
    expect(observedSmartReplyRequests.at(-1)).toEqual({
      conversationId: "conv-001",
      msgIds: [9],
    });
  });

  it("automatically creates a smart reply task for the latest customer message without a recommendation", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];
    const autoRequest = createDeferred<{ id: string }>();

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return autoRequest.promise;
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 9,
      },
    ]);
    expect(
      useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).toMatchObject({
      "9": true,
    });
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");

    autoRequest.resolve({ id: "88" });
    await waitForStoreAssertion(() => {
      expect(
        useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
          "conv-001"
        ],
      ).not.toHaveProperty("9");
      expect(
        useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId[
          "conv-001"
        ],
      ).toMatchObject({
        "9": true,
      });
    });
  });

  it("clears auto smart reply preview pending when a background conversation auto request completes", async () => {
    const baseService = createMockWorkbenchService();
    const autoRequest = createDeferred<{ id: string }>();

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer() {
        return autoRequest.promise;
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).toMatchObject({
      "9": true,
    });

    useWorkbenchStore.setState({ activeConversationId: "conv-002" });

    autoRequest.resolve({ id: "88" });
    await waitForStoreAssertion(() => {
      expect(
        useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
          "conv-001"
        ],
      ).not.toHaveProperty("9");
    });
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).not.toHaveProperty("9");
  });

  it("does not automatically create a smart reply task without chat send permission", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });
    useWorkbenchStore.getState().setChatSendPermission(false);

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedAutoRequests).toEqual([]);
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toEqual({});
  });

  it("does not auto-generate or poll smart replies when the latest page disables the feature", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplyEnabled: false,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              messageId: "9",
              status: "processing",
            },
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(observedAutoRequests).toEqual([]);
    expect(observedSmartReplyRequests).toEqual([]);
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toEqual({});
    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toEqual({});
  });

  it("does not display or auto-generate smart replies for active full-auto conversations", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        const seats = await baseService.getSeats();

        return seats.map((seat) =>
          seat.seatId === "drc"
            ? {
                ...seat,
                fullAutoAuth: true,
                fullAutoSwitch: true,
              }
            : seat,
        );
      },
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          items: response.items.map((conversation) =>
            conversation.conversationId === "conv-001"
              ? {
                  ...conversation,
                  agentMode: "full",
                }
              : conversation,
          ),
        };
      },
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplyEnabled: true,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "推荐回复",
              messageId: "9",
              pollComplete: true,
            },
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(useWorkbenchStore.getState().smartReplyEnabledByConversationId["conv-001"]).toBe(
      true,
    );
    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toEqual({});
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toEqual({});
    expect(observedAutoRequests).toEqual([]);
    expect(observedSmartReplyRequests).toEqual([]);
  });

  it("polls full-auto answer status for a recent customer message and returns to active after terminal status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    const answerStatuses: WorkbenchFullAutoAnswerStatusResponse[] = [
      { analyseMsgId: "20", genStatus: 2, recordId: "27", sendStatus: 0 },
      { analyseMsgId: "20", genStatus: 2, recordId: "27", sendStatus: 1 },
    ];
    const observedStatusRequests: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getFullAutoAnswerStatus(conversationId) {
        observedStatusRequests.push(conversationId);

        return (
          answerStatuses.shift() ?? {
            analyseMsgId: "20",
            genStatus: 2,
            recordId: "27",
            sendStatus: 1,
          }
        );
      },
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            ...page.messages,
            createSmartReplyTextMessageDto({
              id: "full-auto-customer",
              seq: 20,
              text: "请帮我看下",
              createdAt: Date.now(),
            }),
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
      conversationListsByScope: {
        ...state.conversationListsByScope,
        drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
          conversation.id === "conv-001"
            ? {
                ...conversation,
                agentMode: "full",
              }
            : conversation,
        ),
      },
    }));

    await useWorkbenchStore.getState().syncFullAutoAgentStatus();

    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("sending");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("sent");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBeUndefined();
    expect(observedStatusRequests).toEqual(["conv-001", "conv-001"]);

    vi.useRealTimers();
  });

  it("keeps full-auto thinking when the latest answer record belongs to an older customer message", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    const observedStatusRequests: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getFullAutoAnswerStatus(conversationId) {
        observedStatusRequests.push(conversationId);

        return {
          analyseMsgId: "19",
          genStatus: 2,
          recordId: "27",
          sendStatus: 1,
        };
      },
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            ...page.messages,
            createSmartReplyTextMessageDto({
              id: "full-auto-customer",
              seq: 20,
              text: "请帮我看下",
              createdAt: Date.now(),
            }),
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
      conversationListsByScope: {
        ...state.conversationListsByScope,
        drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
          conversation.id === "conv-001"
            ? {
                ...conversation,
                agentMode: "full",
              }
            : conversation,
        ),
      },
    }));

    await useWorkbenchStore.getState().syncFullAutoAgentStatus();

    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("thinking");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("thinking");
    expect(observedStatusRequests).toEqual(["conv-001", "conv-001"]);

    vi.useRealTimers();
  });

  it("restarts full-auto status polling for a new customer message with the same timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    let latestCustomerSeq = 20;
    const observedStatusRequests: string[] = [];

    setWorkbenchService({
      ...baseService,
      async getFullAutoAnswerStatus(conversationId) {
        observedStatusRequests.push(conversationId);

        return {
          analyseMsgId: String(latestCustomerSeq),
          genStatus: 2,
          recordId: `record-${latestCustomerSeq}`,
          sendStatus: 1,
        };
      },
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            ...page.messages,
            createSmartReplyTextMessageDto({
              id: "full-auto-customer",
              seq: 20,
              text: "第一条",
              createdAt: Date.now(),
            }),
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              fullAutoAuth: true,
              fullAutoSwitch: true,
            }
          : account,
      ),
      conversationListsByScope: {
        ...state.conversationListsByScope,
        drc: (state.conversationListsByScope.drc ?? []).map((conversation) =>
          conversation.id === "conv-001"
            ? {
                ...conversation,
                agentMode: "full",
              }
            : conversation,
        ),
      },
    }));

    await useWorkbenchStore.getState().syncFullAutoAgentStatus();
    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("sent");

    latestCustomerSeq = 21;
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          adaptMessage(
            createSmartReplyTextMessageDto({
              id: "full-auto-customer-2",
              seq: 21,
              text: "第二条",
              createdAt: Date.now(),
            }),
            state.customerProfilesById,
            Object.fromEntries(state.accounts.map((account) => [account.id, account])),
            state.me,
          ),
        ],
      },
    }));

    await useWorkbenchStore.getState().syncFullAutoAgentStatus();

    expect(observedStatusRequests).toEqual(["conv-001", "conv-001"]);
    expect(
      useWorkbenchStore.getState().fullAutoStatusByConversationId["conv-001"]?.status,
    ).toBe("sent");

    vi.useRealTimers();
  });

  it("auto-generates a smart reply task for a newly loaded customer message", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        const response = await baseService.poll(request);

        if (request.activeConversationId !== "conv-001") {
          return response;
        }

        return {
          ...response,
          activeConversationMessages: [
            createSmartReplyTextMessageDto({
              id: "msg-new-customer",
              seq: 11,
              text: "新客户问题",
            }),
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    observedAutoRequests.length = 0;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 11,
      },
    ]);
  });

  it("keeps polled active conversation messages in message time order", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        const response = await baseService.poll(request);

        if (request.activeConversationId !== "conv-001") {
          return response;
        }

        return {
          ...response,
          activeConversationMessages: [
            {
              ...createSmartReplyTextMessageDto({
                id: "poll-late",
                seq: 12,
                text: "后到的消息",
              }),
              createdAt: 1_778_400_030_000,
            },
            {
              ...createSmartReplyTextMessageDto({
                id: "poll-early",
                seq: 13,
                text: "先到的消息",
              }),
              createdAt: 1_778_400_020_000,
            },
          ],
        };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].slice(-2).map(
        (message) => message.uiMessageKey,
      ),
    ).toEqual(["13", "12"]);
  });

  it("waits for a customer image download to finish before auto-generating smart reply", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            ...page.messages,
            {
              content: {
                alt: "产品图片",
                downloadStatus: "ing",
                fileUrl: "https://b5.bokr.com.cn/chat-images/product.png",
              },
              contentType: "image",
              conversationId: "conv-001",
              createdAt: 1_778_400_011_000,
              customerId: "cust-001",
              msgid: "img-11",
              rawMsgtype: "image",
              seatId: "drc",
              senderType: "customer",
              seq: 11,
              status: "sent",
            },
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(observedAutoRequests).toEqual([]);

    useWorkbenchStore.getState().updateMessageDownloadContent("conv-001", "11", {
      downloadStatus: "finished",
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 11,
      },
    ]);
  });

  it("does not auto-generate smart reply for a polled customer image before its url is ready", async () => {
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        const response = await baseService.poll(request);

        if (request.activeConversationId !== "conv-001") {
          return response;
        }

        return {
          ...response,
          activeConversationMessages: [
            {
              content: {
                alt: "图片",
                downloadStatus: "ing",
                fileUrl: "",
              },
              contentType: "image",
              conversationId: "conv-001",
              createdAt: 1_778_400_011_000,
              customerId: "cust-001",
              msgid: "img-11",
              rawMsgtype: "image",
              seatId: "drc",
              senderType: "customer",
              seq: 11,
              status: "sent",
            },
          ],
        };
      },
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    observedAutoRequests.length = 0;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedAutoRequests).toEqual([]);
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "11",
      )?.content,
    ).toMatchObject({
      downloadStatus: "ing",
      imageUrl: "",
      type: "image",
    });
  });

  it("shows the skipped smart reply card after auto preview detects incomplete content", async () => {
    vi.setSystemTime(new Date("2026-05-29T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    const observedAutoRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedGeneralAnswerRequests: Array<{
      conversationId: string;
      msgId: number;
    }> = [];

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer(request) {
        observedAutoRequests.push(request);

        throw {
          code: "WORKBENCH_INTERNAL_API_BUSINESS_FAILED",
          details: {
            error: 999,
            errorMsg: "content_incomplete_skip",
          },
          message: "对话语意未完整",
          status: 200,
        };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return { suggestion: null };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "9"
      ],
    ).toMatchObject({
      failReason: "这条消息信息不足，已跳过话术推荐",
      pollComplete: true,
      status: undefined,
    });
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");
    expect(
      useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).not.toHaveProperty("9");
    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).not.toHaveProperty("9");

    const skippedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 9,
      );

    expect(skippedMessage).toBeDefined();

    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedAutoRequests).toEqual([
      {
        conversationId: "conv-001",
        msgId: 9,
      },
    ]);

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "9"
      ],
    ).toMatchObject({
      failReason: "这条消息信息不足，已跳过话术推荐",
      pollComplete: true,
    });
    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).not.toHaveProperty("9");

    await useWorkbenchStore
      .getState()
      .requestSmartReplyGeneralAnswer(skippedMessage!);

    expect(observedGeneralAnswerRequests).toEqual([]);
  });

  it("keeps visible smart replies when an ordinary agent reply arrives", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        const response = await baseService.poll(request);

        if (request.activeConversationId !== "conv-001") {
          return response;
        }

        return {
          ...response,
          activeConversationMessages: [
            createSmartReplyTextMessageDto({
              id: "msg-agent-reply",
              senderType: "agent",
              seq: 11,
              text: "客服回复",
            }),
          ],
        };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "9": {
            assistantName: "智能助手",
            content: "旧推荐",
            status: "ready",
          },
        },
      },
      smartReplyPendingMessageKeysByConversationId: {
        ...state.smartReplyPendingMessageKeysByConversationId,
        "conv-001": {
          "9": true,
        },
      },
    }));

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.smartReplyByMessageIdByConversationId["conv-001"]).toMatchObject({
      "9": {
        content: "旧推荐",
      },
    });
    expect(state.smartReplyHiddenMessageKeysByConversationId["conv-001"]).toEqual(
      {},
    );
    expect(state.smartReplyPendingMessageKeysByConversationId["conv-001"]).toEqual({
      "9": true,
    });
  });

  it("keeps manually triggered processing smart replies in the poll candidates", async () => {
    const baseService = createMockWorkbenchService();
    const observedGeneralAnswerRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "已存在的最新推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return {
          suggestion: {
            assistantName: "智能助手",
            content: "",
            messageId: String(request.msgId),
            status: "processing",
          },
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedGeneralAnswerRequests.length = 0;
    observedSmartReplyRequests.length = 0;

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 8,
      );

    expect(message).toBeDefined();

    await useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toMatchObject({
      "8": true,
    });
    expect(observedGeneralAnswerRequests).toEqual([
      expect.objectContaining({
        conversationId: "conv-001",
        msgId: 8,
      }),
    ]);
    expect(observedSmartReplyRequests.at(-1)).toEqual({
      conversationId: "conv-001",
      msgIds: [8],
    });
  });

  it("reveals an existing hidden smart reply without requesting generation", async () => {
    const baseService = createMockWorkbenchService();
    const observedGeneralAnswerRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户问题",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-agent-8",
              senderType: "agent",
              seq: 8,
              text: "客服回复",
            }),
            createSmartReplyTextMessageDto({
              id: "msg-customer-9",
              seq: 9,
              text: "最新客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "旧问题推荐",
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
            {
              assistantName: "智能助手",
              content: "最新问题推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return { suggestion: null };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedSmartReplyRequests.length = 0;
    observedGeneralAnswerRequests.length = 0;

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 7,
      );

    expect(message).toBeDefined();

    await useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({});
    expect(observedSmartReplyRequests).toEqual([]);
    expect(observedGeneralAnswerRequests).toEqual([]);
  });

  it("does not continue polling a revealed suggestion after switching conversations", async () => {
    const baseService = createMockWorkbenchService();
    const deferredPoll = createDeferred<{
      suggestions: Array<{
        assistantName: string;
        content: string;
        generateStatus: number;
        messageId: string;
        pollComplete: boolean;
        status: "processing";
      }>;
    }>();
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);
        return deferredPoll.promise;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 8,
      );

    expect(message).toBeDefined();

    const requestPromise =
      useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    deferredPoll.resolve({
      suggestions: [
        {
          assistantName: "智能助手",
          content: "",
          generateStatus: 1,
          messageId: "8",
          pollComplete: false,
          status: "processing",
        },
      ],
    });
    await requestPromise;

    const state = useWorkbenchStore.getState();

    expect(state.activeConversationId).toBe("conv-002");
    expect(observedSmartReplyRequests).toEqual([
      {
        conversationId: "conv-001",
        msgIds: [8],
      },
    ]);
    expect(
      state.smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toBeUndefined();
    expect(state.smartReplyLastPolledAtByConversationId["conv-001"]).toBeUndefined();
  });

  it("hides a dismissed smart reply while preserving the suggestion for later reveal", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "推荐话术",
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 7,
      );

    expect(message).toBeDefined();

    useWorkbenchStore.getState().dismissSmartReply(message!);

    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({ "7": true });
    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId[
        "conv-001"
      ]?.["7"],
    ).toEqual(
      expect.objectContaining({
        content: "推荐话术",
        status: "ready",
      }),
    );
  });

  it("hides a dismissed smart reply for a revoked message", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              isRevoked: true,
              seq: 7,
              text: "客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "推荐话术",
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 7,
      );

    expect(message).toMatchObject({ isRevoked: true });

    useWorkbenchStore.getState().dismissSmartReply(message!);

    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({ "7": true });
  });

  it("hides a dismissed smart reply without chat send permission", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            createSmartReplyTextMessageDto({
              id: "msg-customer-7",
              seq: 7,
              text: "客户问题",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "推荐话术",
              messageId: "7",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    useWorkbenchStore.getState().setChatSendPermission(false);
    await useWorkbenchStore.getState().initializeWorkbench();

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 7,
      );

    expect(message).toBeDefined();

    useWorkbenchStore.getState().dismissSmartReply(message!);

    expect(
      useWorkbenchStore.getState().smartReplyHiddenMessageKeysByConversationId[
        "conv-001"
      ],
    ).toEqual({ "7": true });
  });

  it("checks smart reply history once before generating manually", async () => {
    const baseService = createMockWorkbenchService();
    const observedGeneralAnswerRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "已存在的最新推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return {
          suggestions: [
            {
              assistantName: "智能助手",
              content: "单次历史推荐",
              messageId: String(request.msgIds[0]),
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return { suggestion: null };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedSmartReplyRequests.length = 0;
    observedGeneralAnswerRequests.length = 0;

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 8,
      );

    expect(message).toBeDefined();

    await useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    expect(observedSmartReplyRequests).toEqual([
      {
        conversationId: "conv-001",
        msgIds: [8],
      },
    ]);
    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"],
    ).toMatchObject({
      "8": {
        content: "单次历史推荐",
      },
    });
    expect(observedGeneralAnswerRequests).toEqual([]);
  });

  it("requests generation after manual smart reply history lookup returns empty", async () => {
    const baseService = createMockWorkbenchService();
    const observedGeneralAnswerRequests: Array<{ conversationId: string; msgId: number }> = [];
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "已存在的最新推荐",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        return { suggestions: [] };
      },
      async requestSmartReplyGeneralAnswer(request) {
        observedGeneralAnswerRequests.push(request);

        return {
          suggestion: {
            assistantName: "智能助手",
            content: "",
            messageId: String(request.msgId),
            status: "processing",
          },
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedSmartReplyRequests.length = 0;
    observedGeneralAnswerRequests.length = 0;

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 8,
      );

    expect(message).toBeDefined();

    await useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    expect(observedSmartReplyRequests[0]).toEqual(
      {
        conversationId: "conv-001",
        msgIds: [8],
      },
    );
    expect(observedGeneralAnswerRequests).toEqual([
      expect.objectContaining({
        conversationId: "conv-001",
        msgId: 8,
      }),
    ]);
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toMatchObject({
      "8": true,
    });
  });

  it("keeps pending smart replies when poll omits the requested message id", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      smartReplyPendingMessageKeysByConversationId: {
        ...state.smartReplyPendingMessageKeysByConversationId,
        "conv-001": {
          "9": true,
        },
      },
    }));

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toMatchObject({
      "9": true,
    });
  });

  it("hides only the sent smart reply after sending its answer", async () => {
    const baseService = createMockWorkbenchService();
    const sendSmartReplyAnswer = vi.fn(baseService.sendSmartReplyAnswer);

    setWorkbenchService({
      ...baseService,
      sendSmartReplyAnswer,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];
    const firstMessage = messages.find((message) => message.seq === 9);
    const secondMessage = messages.find((message) => message.seq === 8);

    if (!isChatMessage(firstMessage) || !isChatMessage(secondMessage)) {
      throw new Error("Expected smart reply test messages to be chat messages");
    }

    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "9": {
            assistantName: "智能助手",
            content: "第一条推荐",
            recordId: "record-9",
            status: "ready",
          },
          "8": {
            assistantName: "智能助手",
            content: "第二条推荐",
            recordId: "record-10",
            status: "ready",
          },
        },
      },
      smartReplyPendingMessageKeysByConversationId: {
        ...state.smartReplyPendingMessageKeysByConversationId,
        "conv-001": {
          "9": true,
          "8": true,
        },
      },
    }));

    const result = await useWorkbenchStore.getState().sendSmartReply(firstMessage, {
      content: "发送第一条推荐",
      recommendedAttachments: [],
      selectedAttachmentIds: [],
    });

    const state = useWorkbenchStore.getState();

    expect(result.ok).toBe(true);
    expect(sendSmartReplyAnswer).toHaveBeenCalledWith({
      conversationId: "conv-001",
      realAnswer: "发送第一条推荐",
      realAttachIds: [],
      recordId: "record-9",
    });
    expect(state.smartReplyHiddenMessageKeysByConversationId["conv-001"]).toEqual({
      "9": true,
    });
    expect(state.smartReplyByMessageIdByConversationId["conv-001"]).toMatchObject({
      "9": {
        content: "发送第一条推荐",
      },
      "8": {
        content: "第二条推荐",
      },
    });
    expect(state.smartReplyPendingMessageKeysByConversationId["conv-001"]).toEqual({
      "8": true,
    });
  });

  it("continues polling smart replies after a transient poll failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    const observedSmartReplyRequests: WorkbenchSmartReplyPollRequest[] = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              messageId: "9",
              status: "processing",
            },
          ],
        };
      },
      async pollSmartReplies(request) {
        observedSmartReplyRequests.push(request);

        if (observedSmartReplyRequests.length === 1) {
          throw new Error("network jitter");
        }

        return {
          suggestions: [
            {
              assistantName: "智能助手",
              content: "可以这样回复",
              messageId: "9",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await Promise.resolve();

    expect(observedSmartReplyRequests).toHaveLength(1);

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(observedSmartReplyRequests).toHaveLength(2);
    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "9"
      ],
    ).toMatchObject({
      content: "可以这样回复",
      pollComplete: true,
    });
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");

    vi.useRealTimers();
  });

  it("clears stale smart reply runtime state when switching conversations", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-002": {
          "11": {
            assistantName: "智能助手",
            content: "",
            status: "processing",
          },
        },
      },
      smartReplyPendingMessageKeysByConversationId: {
        ...state.smartReplyPendingMessageKeysByConversationId,
        "conv-002": {
          "11": true,
        },
      },
    }));

    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-002"],
    ).toEqual({});
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-002"],
    ).toEqual({});
  });

  it("marks smart reply generation failed after the local timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer() {
        return { id: "88" };
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(30_000);

    const suggestion =
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "9"
      ];

    expect(suggestion).toMatchObject({
      failReason: "智能回复生成超时，请稍后重试",
      generateStatus: 3,
      pollComplete: true,
    });
    expect(
      useWorkbenchStore.getState().smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");

    vi.useRealTimers();
  });

  it("marks auto smart reply preview failed when auto request never returns", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    const autoRequest = createDeferred<{ id: string }>();

    setWorkbenchService({
      ...baseService,
      async requestSmartReplyAutoGeneralAnswer() {
        return autoRequest.promise;
      },
      async pollSmartReplies() {
        return { suggestions: [] };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore.getState().smartReplyAutoPendingMessageKeysByConversationId[
        "conv-001"
      ],
    ).toMatchObject({
      "9": true,
    });

    await vi.advanceTimersByTimeAsync(30_000);

    const state = useWorkbenchStore.getState();
    const suggestion = state.smartReplyByMessageIdByConversationId["conv-001"]?.[
      "9"
    ];

    expect(suggestion).toMatchObject({
      failReason: "智能回复生成超时，请稍后重试",
      generateStatus: 3,
      pollComplete: true,
    });
    expect(
      state.smartReplyAutoPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");
    expect(
      state.smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).not.toHaveProperty("9");

    vi.useRealTimers();
  });

  it("keeps polling other pending smart replies after one item times out", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-29T12:00:00+08:00"));
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        const page = await baseService.getMessages(conversationId, options);

        if (conversationId !== "conv-001") {
          return page;
        }

        return {
          ...page,
          messages: [
            ...page.messages,
            createSmartReplyTextMessageDto({
              id: "msg-customer-11",
              seq: 11,
              text: "第二条手动推荐",
            }),
          ],
          smartReplies: [
            {
              assistantName: "智能助手",
              content: "",
              messageId: "8",
              status: "processing",
            },
            {
              assistantName: "智能助手",
              content: "已有最新结果",
              messageId: "10",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
      async requestSmartReplyGeneralAnswer(request) {
        return {
          suggestion: {
            assistantName: "智能助手",
            content: "",
            messageId: String(request.msgId),
            status: "processing",
          },
        };
      },
      async pollSmartReplies(request) {
        if (Date.now() < new Date("2026-05-29T12:00:30+08:00").getTime()) {
          return { suggestions: [] };
        }

        return {
          suggestions: [
            {
              assistantName: "智能助手",
              content: "第二条结果",
              messageId: "11",
              pollComplete: true,
              status: "ready",
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_000);

    const message = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (item): item is Message & { role: "customer" } =>
          item.role === "customer" && item.seq === 11,
      );

    expect(message).toBeDefined();

    await useWorkbenchStore.getState().requestSmartReplyGeneralAnswer(message!);

    await vi.advanceTimersByTimeAsync(29_000);

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "8"
      ],
    ).toMatchObject({
      failReason: "智能回复生成超时，请稍后重试",
      pollComplete: true,
    });

    expect(
      useWorkbenchStore.getState().smartReplyByMessageIdByConversationId["conv-001"]?.[
        "11"
      ],
    ).toMatchObject({
      content: "第二条结果",
      pollComplete: true,
    });

    vi.useRealTimers();
  });

  it("keeps the opposite history cursor when prepending older pages", async () => {
    const baseService = createMockWorkbenchService();
    const observedHistoryCursors: Array<string | undefined> = [];

    setWorkbenchService({
      ...baseService,
      async getHistoryMessages(conversationId, options) {
        observedHistoryCursors.push(options?.cursor);

        if (conversationId !== "conv-001") {
          return baseService.getHistoryMessages(conversationId, options);
        }

        if (options?.cursor === "before-2") {
          return {
            hasNext: true,
            hasPrev: false,
            messages: [
              createHistoryMessageDto("history-0", 0, "更早 0"),
              createHistoryMessageDto("history-1", 1, "更早 1"),
            ],
            nextCursor: "after-1",
            prevCursor: undefined,
          };
        }

        if (options?.cursor === "after-3") {
          return {
            hasNext: false,
            hasPrev: true,
            messages: [createHistoryMessageDto("history-4", 4, "更新 4")],
            nextCursor: undefined,
            prevCursor: "before-4",
          };
        }

        return {
          hasNext: true,
          hasPrev: true,
          messages: [
            createHistoryMessageDto("history-2", 2, "当前 2"),
            createHistoryMessageDto("history-3", 3, "当前 3"),
          ],
          nextCursor: "after-3",
          prevCursor: "before-2",
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().openHistoryPanel("conv-001");
    await useWorkbenchStore.getState().loadHistoryMessages({
      cursor:
        useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]
          ?.prevCursor,
      direction: "prev",
    });
    await useWorkbenchStore.getState().loadHistoryMessages({
      cursor:
        useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]
          ?.nextCursor,
      direction: "next",
    });

    expect(observedHistoryCursors).toEqual([undefined, "before-2", "after-3"]);
    const messageKeys =
      useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]
        ?.messages.map((message) => message.uiMessageKey) ?? [];
    expect(messageKeys[0]).toMatch(/^invalid-message:/);
    expect(messageKeys.slice(1)).toEqual(["1", "2", "3", "4"]);
  });

  it("clears history panel messages immediately when changing scope", async () => {
    const baseService = createMockWorkbenchService();
    const pendingHistoryPage = createDeferred<WorkbenchHistoryMessagePageDto>();

    setWorkbenchService({
      ...baseService,
      async getHistoryMessages(conversationId, options) {
        if (options?.scope === "file") {
          return pendingHistoryPage.promise;
        }

        return {
          hasNext: false,
          hasPrev: false,
          messages: [createHistoryMessageDto("history-text", 1, "旧文本")],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().openHistoryPanel("conv-001");

    const switchScopePromise = useWorkbenchStore.getState().setHistoryPanelScope("file");
    const stateWhileLoading = useWorkbenchStore.getState();

    expect(
      stateWhileLoading.historyPanelByConversationId["conv-001"]?.messages,
    ).toEqual([]);
    expect(stateWhileLoading.historyPanelLoadingByConversationId["conv-001"]).toBe(true);

    pendingHistoryPage.resolve({
      hasNext: false,
      hasPrev: false,
      messages: [createHistoryMessageDto("history-file", 2, "文件")],
    });
    await switchScopePromise;

    expect(
      useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]
        ?.messages.map((message) => message.uiMessageKey),
    ).toEqual(["2"]);
  });

  it("keeps history scroll pinned to the end only for all-scope filters without a day", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().openHistoryPanel("conv-001");

    expect(
      useWorkbenchStore.getState().historyPanelScrollModeByConversationId["conv-001"],
    ).toBe("end");

    await useWorkbenchStore.getState().setHistoryPanelSenderId("customer-1");

    expect(
      useWorkbenchStore.getState().historyPanelScrollModeByConversationId["conv-001"],
    ).toBe("end");

    await useWorkbenchStore.getState().setHistoryPanelDay("2026-05-20");

    expect(
      useWorkbenchStore.getState().historyPanelScrollModeByConversationId["conv-001"],
    ).toBeUndefined();

    await useWorkbenchStore.getState().setHistoryPanelDay(undefined);

    expect(
      useWorkbenchStore.getState().historyPanelScrollModeByConversationId["conv-001"],
    ).toBe("end");

    await useWorkbenchStore.getState().setHistoryPanelScope("file");

    expect(
      useWorkbenchStore.getState().historyPanelScrollModeByConversationId["conv-001"],
    ).toBeUndefined();
  });

  it("starts polling from the conversation snapshot baseline after bootstrap", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getConversations(seatId, options) {
        const response = await baseService.getConversations(seatId, options);

        return {
          ...response,
          snapshotAt: options?.mode === "single" ? 1_778_840_010_000 : 1_778_840_020_000,
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(useWorkbenchStore.getState().sinceVersion).toBe(1_778_840_010_000);
    expect(useWorkbenchStore.getState().isPollBaselineFresh).toBe(true);
  });

  it("sends fresh baseline only for the first poll after bootstrap", async () => {
    const baseService = createMockWorkbenchService();
    const observedFreshBaselines: Array<boolean | undefined> = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        observedFreshBaselines.push(request.freshBaseline);

        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedFreshBaselines).toEqual([true, false]);
    expect(useWorkbenchStore.getState().isPollBaselineFresh).toBe(false);
  });

  it("preserves business state references when poll has no business changes", async () => {
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

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.getState().clearActiveConversation();

    const beforePoll = useWorkbenchStore.getState();
    const references = {
      accounts: beforePoll.accounts,
      conversationListsByScope: beforePoll.conversationListsByScope,
      groupMembersByConversationId: beforePoll.groupMembersByConversationId,
      groupMembersLoadingByConversationId:
        beforePoll.groupMembersLoadingByConversationId,
      hasMoreHistoryByConversationId: beforePoll.hasMoreHistoryByConversationId,
      historyPanelByConversationId: beforePoll.historyPanelByConversationId,
      historyStatusByConversationId: beforePoll.historyStatusByConversationId,
      messagePaginationByConversationId:
        beforePoll.messagePaginationByConversationId,
      messagesByConversationId: beforePoll.messagesByConversationId,
      pendingMessages: beforePoll.pendingMessages,
      smartReplyByMessageIdByConversationId:
        beforePoll.smartReplyByMessageIdByConversationId,
      smartReplyHiddenMessageKeysByConversationId:
        beforePoll.smartReplyHiddenMessageKeysByConversationId,
      smartReplyPendingMessageKeysByConversationId:
        beforePoll.smartReplyPendingMessageKeysByConversationId,
    };

    await useWorkbenchStore.getState().pollWorkbench();

    const afterPoll = useWorkbenchStore.getState();

    expect(afterPoll.accounts).toBe(references.accounts);
    expect(afterPoll.conversationListsByScope).toBe(
      references.conversationListsByScope,
    );
    expect(afterPoll.groupMembersByConversationId).toBe(
      references.groupMembersByConversationId,
    );
    expect(afterPoll.groupMembersLoadingByConversationId).toBe(
      references.groupMembersLoadingByConversationId,
    );
    expect(afterPoll.hasMoreHistoryByConversationId).toBe(
      references.hasMoreHistoryByConversationId,
    );
    expect(afterPoll.historyPanelByConversationId).toBe(
      references.historyPanelByConversationId,
    );
    expect(afterPoll.historyStatusByConversationId).toBe(
      references.historyStatusByConversationId,
    );
    expect(afterPoll.messagePaginationByConversationId).toBe(
      references.messagePaginationByConversationId,
    );
    expect(afterPoll.messagesByConversationId).toBe(
      references.messagesByConversationId,
    );
    expect(afterPoll.pendingMessages).toBe(references.pendingMessages);
    expect(afterPoll.smartReplyByMessageIdByConversationId).toBe(
      references.smartReplyByMessageIdByConversationId,
    );
    expect(afterPoll.smartReplyHiddenMessageKeysByConversationId).toBe(
      references.smartReplyHiddenMessageKeysByConversationId,
    );
    expect(afterPoll.smartReplyPendingMessageKeysByConversationId).toBe(
      references.smartReplyPendingMessageKeysByConversationId,
    );
    expect(afterPoll.sinceVersion).toBe(beforePoll.sinceVersion + 1);
    expect(afterPoll.isPollBaselineFresh).toBe(false);
  });

  it("preserves accounts reference when poll account changes do not target loaded accounts", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [
            {
              avatar: "",
              description: "私域客户管理",
              loginStatus: "online",
              name: "未加载账号",
              operatorName: "小可",
              phone: "13296712905",
              seatId: "missing-seat",
              unreadCount: 3,
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.getState().clearActiveConversation();

    const beforePoll = useWorkbenchStore.getState();
    const accountsBeforePoll = beforePoll.accounts;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().accounts).toBe(accountsBeforePoll);
  });

  it("refreshes full account metadata from poll account changes", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [
            {
              accountId: "drc",
              avatar: "https://example.test/offline-seat.png",
              bizStatus: 0,
              description: "账号已更新",
              expireTime: 1,
              hostSubUserId: "sub-user-002",
              lastMessageTime: 1_778_840_020_000,
              loginStatus: "offline",
              name: "德瑞可更新",
              operatorName: "小可更新",
              phone: "13296712906",
              seatId: "drc",
              thirdUserId: "third-drc-updated",
              unreadCount: 3,
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().accounts.find((account) => account.id === "drc")).toMatchObject({
      avatarUrl: "https://example.test/offline-seat.png",
      bizStatus: 0,
      description: "账号已更新",
      expireTime: 1,
      lastMessageTime: 1_778_840_020_000,
      loginStatus: "offline",
      name: "德瑞可更新",
      operator: "小可更新",
      phone: "13296712906",
      takenOverEmployeeId: "sub-user-002",
      unreadCount: 3,
    });
  });

  it("clears optional account metadata from full poll snapshots", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [
            {
              avatar: "https://example.test/active-seat.png",
              bizStatus: 1,
              description: "账号恢复",
              expireTime: undefined,
              hostSubUserId: undefined,
              lastMessageTime: 1_778_840_030_000,
              loginStatus: "online",
              name: "德瑞可",
              operatorName: "小可",
              phone: "13296712905",
              seatId: "drc",
              unreadCount: 0,
            },
          ],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              expireTime: 1,
              takenOverEmployeeId: "sub-user-002",
            }
          : account,
      ),
    }));

    await useWorkbenchStore.getState().pollWorkbench();

    const account = useWorkbenchStore.getState().accounts.find((item) => item.id === "drc");
    expect(account).toMatchObject({
      bizStatus: 1,
      loginStatus: "online",
      unreadCount: 0,
    });
    expect(account?.expireTime).toBeUndefined();
    expect(account?.takenOverEmployeeId).toBeUndefined();
  });

  it("preserves pending messages reference when poll messages do not resolve pending items", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [
            createSmartReplyTextMessageDto({
              id: "remote-unrelated-message",
              seq: 999,
              text: "服务端新消息",
            }),
          ],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      pendingMessages: [
        ...state.pendingMessages,
        {
          author: "客服一号",
          content: { text: "本地待发送消息", type: "text" },
          conversationId: "conv-001",
          uiMessageKey: "pending-001",
          role: "agent",
          sender: { id: "agent-001", name: "客服一号" },
          sentAt: "2026-05-25T10:00:00+08:00",
          status: "sending",
        } satisfies ChatMessage,
      ],
    }));

    const pendingBeforePoll = useWorkbenchStore.getState().pendingMessages;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().pendingMessages).toBe(
      pendingBeforePoll,
    );
  });

  it("omits active conversation parameters from poll when no conversation is bound", async () => {
    const baseService = createMockWorkbenchService();
    const observedPollRequests: Parameters<typeof baseService.poll>[0][] = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        observedPollRequests.push(request);

        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.getState().clearActiveConversation();

    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedPollRequests[0]).not.toHaveProperty("activeConversationId");
    expect(observedPollRequests[0]).not.toHaveProperty("activeMessageSeq");
  });

  it("clears removed conversation resources from poll changes", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [
            {
              accountId: "drc",
              conversationId: "conv-003",
              seatId: "drc",
              type: "remove",
            },
          ],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      groupMembersByConversationId: {
        ...state.groupMembersByConversationId,
        "conv-003": [],
      },
      groupMembersLoadingByConversationId: {
        ...state.groupMembersLoadingByConversationId,
        "conv-003": true,
      },
      hasMoreHistoryByConversationId: {
        ...state.hasMoreHistoryByConversationId,
        "conv-003": true,
      },
      historyStatusByConversationId: {
        ...state.historyStatusByConversationId,
        "conv-003": "loading",
      },
      messagePaginationByConversationId: {
        ...state.messagePaginationByConversationId,
        "conv-003": {
          hasMore: true,
          nextBeforeSeq: 12,
          skippedHiddenCount: 0,
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-003": seedMessages["conv-003"],
      },
    }));

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-003"]).toBeUndefined();
    expect(state.messagePaginationByConversationId["conv-003"]).toBeUndefined();
    expect(state.hasMoreHistoryByConversationId["conv-003"]).toBeUndefined();
    expect(state.historyStatusByConversationId["conv-003"]).toBeUndefined();
    expect(state.groupMembersByConversationId["conv-003"]).toBeUndefined();
    expect(state.groupMembersLoadingByConversationId["conv-003"]).toBeUndefined();
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

  it("reuses fresh group member cache within five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    let requestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        requestCount += 1;

        return baseService.getGroupMembers(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveMode("single");
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 - 1);
    await useWorkbenchStore.getState().setActiveMode("group");

    expect(requestCount).toBe(1);

    vi.useRealTimers();
  });

  it("reloads expired group member cache after five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T10:00:00+08:00"));
    const baseService = createMockWorkbenchService();
    let requestCount = 0;

    setWorkbenchService({
      ...baseService,
      async getGroupMembers(conversationId) {
        requestCount += 1;

        return baseService.getGroupMembers(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveMode("single");
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    await useWorkbenchStore.getState().setActiveMode("group");

    expect(requestCount).toBe(2);

    vi.useRealTimers();
  });

  it("clears group member cache when bootstrapping a fresh workbench snapshot", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");

    let state = useWorkbenchStore.getState();
    expect(state.groupMembersByConversationId["conv-004"]).toBeDefined();

    await useWorkbenchStore.getState().setActiveMode("single");
    await useWorkbenchStore.getState().initializeWorkbench();

    state = useWorkbenchStore.getState();
    expect(state.activeConversationId).toBe("conv-001");
    expect(state.groupMembersByConversationId).toEqual({});
    expect(state.groupMembersLoadingByConversationId).toEqual({});
  });

  it("clears previous conversation message state while preserving cached group members", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");

    let state = useWorkbenchStore.getState();
    expect(state.activeConversationId).toBe("conv-004");
    expect(state.messagesByConversationId["conv-004"]).toBeDefined();
    expect(state.messagePaginationByConversationId["conv-004"]).toBeDefined();
    expect(state.hasMoreHistoryByConversationId["conv-004"]).toBeDefined();
    expect(state.groupMembersByConversationId["conv-004"]).toBeDefined();

    await useWorkbenchStore.getState().setActiveConversation("conv-001");

    state = useWorkbenchStore.getState();
    expect(state.activeConversationId).toBe("conv-001");
    expect(state.messagesByConversationId["conv-004"]).toBeUndefined();
    expect(state.messagePaginationByConversationId["conv-004"]).toBeUndefined();
    expect(state.hasMoreHistoryByConversationId["conv-004"]).toBeUndefined();
    expect(state.historyStatusByConversationId["conv-004"]).toBeUndefined();
    expect(state.groupMembersByConversationId["conv-004"]).toBeDefined();
  });

  it("keeps previous conversation message state when it has pending messages", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      smartReplyByMessageIdByConversationId: {
        ...state.smartReplyByMessageIdByConversationId,
        "conv-001": {
          "9": {
            assistantName: "智能助手",
            content: "",
            status: "processing",
          },
        },
      },
      smartReplyPendingMessageKeysByConversationId: {
        ...state.smartReplyPendingMessageKeysByConversationId,
        "conv-001": {
          "9": true,
        },
      },
    }));
    await useWorkbenchStore.getState().sendAgentTextMessage("待确认消息");

    let state = useWorkbenchStore.getState();
    expect(state.pendingMessages.map((message) => message.conversationId)).toContain(
      "conv-001",
    );

    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    state = useWorkbenchStore.getState();
    expect(state.activeConversationId).toBe("conv-002");
    expect(state.messagesByConversationId["conv-001"]).toBeDefined();
    expect(state.smartReplyByMessageIdByConversationId["conv-001"]).toBeUndefined();
    expect(
      state.smartReplyPendingMessageKeysByConversationId["conv-001"],
    ).toBeUndefined();
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
    const latestUiMessageKeys = latestMessages.map((message) => message.uiMessageKey);
    const latestOptNos = latestMessages.map((message) =>
      isChatMessage(message) ? message.optNo : undefined,
    );

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
    expect(new Set(latestUiMessageKeys).size).toBe(3);
    expect(new Set(latestOptNos).size).toBe(3);
    expect(latestOptNos.every(Boolean)).toBe(true);
    expect(state.pendingMessages).toHaveLength(3);
    expect(state.conversationListsByScope[state.activeAccountId][0].preview).toBe(
      "第二段[强]",
    );
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

  it("keeps quote payload off image-only sends", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockResolvedValue([
      {
        alt: "截图",
        fileId: "chat-images/conv-001/a.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
      },
    ]);

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments(
      [
        {
          alt: "截图",
          localUrl: "data:image/png;base64,aaa",
          type: "image",
        },
      ],
      {
        quote: {
          quoteMsgId: "538",
        },
      },
    );

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        quote: undefined,
        segment: {
          alt: "截图",
          fileId: "chat-images/conv-001/a.png",
          type: "image",
          url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
        },
      }),
    );
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        type: "image",
      },
    });
  });

  it("applies quote payload to the first outgoing text segment", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockResolvedValue([
      {
        alt: "截图",
        fileId: "chat-images/conv-001/a.png",
        type: "image",
        url: "https://mock-bucket.cos.ap-guangzhou.myqcloud.com/chat-images/conv-001/a.png",
      },
      {
        text: "补充文字",
        type: "text",
      },
    ]);

    await useWorkbenchStore.getState().initializeWorkbench();
    const result = await useWorkbenchStore.getState().sendAgentMessageSegments(
      [
        {
          alt: "截图",
          localUrl: "data:image/png;base64,aaa",
          type: "image",
        },
        {
          text: "补充文字",
          type: "text",
        },
      ],
      {
        quote: {
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "text",
            senderName: "客户",
            text: "原消息",
          },
        },
      },
    );

    expect(result).toMatchObject({
      didConsumeQuote: true,
      ok: true,
    });
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        quote: undefined,
        segment: expect.objectContaining({
          type: "image",
        }),
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        quote: {
          quoteMsgId: "538",
          quotedMessage: {
            contentType: "text",
            senderName: "客户",
            text: "原消息",
          },
        },
        segment: {
          text: "补充文字",
          type: "text",
        },
      }),
    );
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1),
    ).toMatchObject({
      content: {
        quoteMsgId: "538",
        text: "补充文字",
        type: "quote",
      },
    });
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1)
        ?.content,
    ).not.toHaveProperty("quotedMessageId");
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

  it("sends collected material API payloads by collection id only while keeping optimistic display content", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        imageUrl: "https://cdn.example.com/expression.gif",
        materialCollectionId: "material-expression-001",
        type: "emotion",
      },
      {
        alt: "商品图",
        imageUrl: "https://cdn.example.com/product.png",
        materialCollectionId: "material-image-001",
        type: "image",
      },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "2 KB",
        materialCollectionId: "material-file-001",
        msgInfoId: "9101",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
      {
        coverUrl: "https://cdn.example.com/link-cover.png",
        desc: "活动说明",
        href: "https://example.com/activity",
        materialCollectionId: "material-h5-001",
        msgInfoId: "9102",
        title: "活动链接",
        type: "h5",
      },
      {
        appName: "客户助手",
        coverImageUrl: "https://cdn.example.com/weapp-cover.png",
        materialCollectionId: "material-weapp-001",
        msgInfoId: "9103",
        title: "小程序标题",
        type: "weapp",
      },
      {
        coverUrl: "s5/msg/20260514/272/video-cover.jpg",
        materialCollectionId: "material-video-001",
        msgInfoId: "9104",
        title: "讲解视频",
        type: "video",
        url: "s5/msg/20260514/272/video.mp4",
      },
    ]);

    expect(sendMessage).toHaveBeenCalledTimes(6);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        segment: {
          materialCollectionId: "material-expression-001",
          type: "emotion",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        segment: {
          alt: "商品图",
          materialCollectionId: "material-image-001",
          type: "image",
        },
      }),
    );
    expect(sendMessage.mock.calls[1]?.[0].segment).not.toHaveProperty("imageUrl");
    expect(sendMessage.mock.calls[1]?.[0].segment).not.toHaveProperty("url");
    expect(sendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        segment: {
          materialCollectionId: "material-file-001",
          type: "file",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        segment: {
          materialCollectionId: "material-h5-001",
          type: "h5",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        segment: {
          materialCollectionId: "material-weapp-001",
          type: "weapp",
        },
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        segment: {
          materialCollectionId: "material-video-001",
          type: "video",
        },
      }),
    );
    const latestMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].slice(-6);

    expect(latestMessages).toMatchObject([
      {
        content: {
          imageUrl: "https://cdn.example.com/expression.gif",
          type: "image",
          variant: "emotion",
        },
      },
      {
        content: {
          imageUrl: "https://cdn.example.com/product.png",
          type: "image",
        },
      },
      {
        content: {
          fileName: "报价单.pdf",
          type: "file",
        },
      },
      {
        content: {
          title: "活动链接",
          type: "h5",
          url: "https://example.com/activity",
        },
      },
      {
        content: {
          title: "小程序标题",
          type: "mini-program",
        },
      },
      {
        content: {
          alt: "讲解视频",
          coverImageUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video-cover.jpg",
          downloadStatus: "finished",
          type: "video",
          videoUrl: "https://b5.bokr.com.cn/s5/msg/20260514/272/video.mp4",
        },
      },
    ]);
  });

  it("sends sphfeed composer segments through the send API", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        description: "视频号简介",
        imageUrl: "https://cdn.example.com/sphfeed-cover.png",
        materialCollectionId: "material-sphfeed-001",
        title: "视频号标题",
        type: "sphfeed",
        url: "https://channels.example.com/feed",
      },
    ]);

    expect(result).toEqual({
      didConsumeQuote: false,
      ok: true,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      conversationId: expect.any(String),
      seatId: expect.any(String),
      segment: {
        materialCollectionId: "material-sphfeed-001",
        type: "sphfeed",
      },
    });
  });

  it("keeps quick reply snapshot fields when a material segment has msgInfoId", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "2 KB",
        msgInfoId: "9101",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
      {
        coverUrl: "https://cdn.example.com/link-cover.png",
        desc: "活动说明",
        href: "https://example.com/activity",
        msgInfoId: "9102",
        title: "活动链接",
        type: "h5",
      },
      {
        appName: "客户助手",
        coverImageUrl: "https://cdn.example.com/weapp-cover.png",
        msgInfoId: "9103",
        title: "小程序标题",
        type: "weapp",
      },
    ]);

    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        segment: expect.objectContaining({
          fileName: "报价单.pdf",
          msgInfoId: "9101",
          type: "file",
          url: "https://cdn.example.com/quote.pdf",
        }),
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        segment: expect.objectContaining({
          desc: "活动说明",
          href: "https://example.com/activity",
          msgInfoId: "9102",
          title: "活动链接",
          type: "h5",
        }),
      }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        segment: expect.objectContaining({
          msgInfoId: "9103",
          type: "weapp",
        }),
      }),
    );

    const latestMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].slice(-3);

    expect(latestMessages).toMatchObject([
      {
        content: {
          fileName: "报价单.pdf",
          type: "file",
        },
      },
      {
        content: {
          title: "活动链接",
          type: "h5",
          url: "https://example.com/activity",
        },
      },
      {
        content: {
          appName: "客户助手",
          title: "小程序标题",
          type: "mini-program",
        },
      },
    ]);
  });

  it("does not send messages from an inactive conversation", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      conversationListsByScope: {
        ...state.conversationListsByScope,
        drc: state.conversationListsByScope.drc.map((conversation) =>
          conversation.id === "conv-001"
            ? {
                ...conversation,
                bizStatus: 2,
              }
            : conversation,
        ),
      },
    }));

    const result = await useWorkbenchStore.getState().sendAgentTextMessage(
      "失效会话不能发送",
    );

    expect(result).toEqual({
      errorCode: "UNAVAILABLE",
      errorMessage: "当前无法发送消息",
      reason: "unavailable",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not send messages from an inactive account seat", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              bizStatus: 0,
            }
          : account,
      ),
    }));

    expect(useWorkbenchStore.getState().activeAccountId).toBe("drc");
    expect(useWorkbenchStore.getState().activeConversationId).toBe("conv-001");

    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        text: "失效席位不能发送",
        type: "text",
      },
    ]);

    expect(result).toEqual({
      errorCode: "UNAVAILABLE",
      errorMessage: "当前无法发送消息",
      reason: "unavailable",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
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

  it("returns a specific image upload error when the upload SDK chunk cannot load", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });
    vi.mocked(resolveImageSegmentsForSend).mockRejectedValue({
      code: "MEDIA_UPLOAD_SDK_LOAD_FAILED",
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const result = await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "截图",
        localUrl: "data:image/png;base64,aaa",
        type: "image",
      },
    ]);

    expect(result).toEqual({
      errorCode: "MEDIA_UPLOAD_SDK_LOAD_FAILED",
      errorMessage: "上传组件加载失败，请刷新页面后重试",
      reason: "image-upload",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
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

    useWorkbenchStore.setState((state) => ({
      ...state,
      seatUpdateCursor: 1_778_840_020_000,
    }));

    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeMode).toBe("single");
    expect(state.activeConversationId).toBe("conv-005");
    expect(state.conversationListsByScope.ndt[0].unread).toBe(1);
    expect(state.seatUpdateCursor).toBe(1_778_840_020_000);
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

    await useWorkbenchStore.getState().retryFailedMessage(failedMessage!.uiMessageKey);

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
    expect(latestMessage?.uiMessageKey).not.toBe(failedMessage?.uiMessageKey);
  });

  it("passes the failed message id when retrying a failed text message", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const failedMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

    expect(failedMessage).toMatchObject({
      msgid: expect.any(String),
      status: "failed",
    });
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": state.messagesByConversationId["conv-001"].map((message) =>
          message.uiMessageKey === failedMessage!.uiMessageKey
            ? {
                ...message,
                msgid: "remote-msgid-001",
                seq: 538,
              }
            : message,
        ),
      },
    }));

    await useWorkbenchStore.getState().retryFailedMessage(failedMessage!.uiMessageKey);

    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failMsgId: "538",
        segment: {
          text: "这条消息会失败 [fail]",
          type: "text",
        },
      }),
    );
  });

  it("retries a reconciled failed message when called with the previous optNo key", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              text: "已落库失败消息",
              type: "text",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            optNo: "opt-failed-538",
            uiMessageKey: "538",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            seq: 538,
            status: "failed",
          },
        ],
      },
    }));

    const beforeRetryCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    await useWorkbenchStore.getState().retryFailedMessage("opt-failed-538");

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    expect(messages).toHaveLength(beforeRetryCount);
    expect(messages.some((message) => message.uiMessageKey === "538")).toBe(false);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failMsgId: "538",
        segment: {
          text: "已落库失败消息",
          type: "text",
        },
      }),
    );
    expect(messages.at(-1)).toMatchObject({
      content: {
        text: "已落库失败消息",
        type: "text",
      },
      role: "agent",
      status: "accepted",
    });
  });

  it("omits failMsgId when retrying a failed message without seq", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const failedMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

    expect(failedMessage).toMatchObject({
      status: "failed",
    });
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": state.messagesByConversationId["conv-001"].map((message) =>
          message.uiMessageKey === failedMessage!.uiMessageKey
            ? {
                ...message,
                msgid: "remote-msgid-001",
                seq: undefined,
              }
            : message,
        ),
      },
    }));

    await useWorkbenchStore.getState().retryFailedMessage(failedMessage!.uiMessageKey);

    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failMsgId: undefined,
      }),
    );
  });

  it("does not invent fileSize when retrying a failed file message", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSizeLabel: "2 KB",
              fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
              type: "file",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-file-message",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            seq: 539,
            status: "failed",
          },
        ],
      },
    }));

    await useWorkbenchStore.getState().retryFailedMessage("failed-file-message");

    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        segment: expect.not.objectContaining({
          fileSize: expect.any(Number),
        }),
      }),
    );
  });

  it("keeps the failed message visible until retry send is accepted", async () => {
    const baseService = createMockWorkbenchService();
    const sendGate = createDeferred<Awaited<ReturnType<typeof baseService.sendMessage>>>();
    let sendCount = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        sendCount += 1;

        if (sendCount === 2) {
          return sendGate.promise;
        }

        return baseService.sendMessage(payload);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const failedMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

    const retryPromise = useWorkbenchStore.getState().retryFailedMessage(failedMessage!.uiMessageKey);

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].some((message) => message.uiMessageKey === failedMessage!.uiMessageKey),
    ).toBe(true);

    sendGate.resolve({
      optNo: "retry-opt-001",
      status: "accepted",
    });
    await retryPromise;

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    expect(messages.some((message) => message.uiMessageKey === failedMessage!.uiMessageKey)).toBe(false);
    expect(messages.at(-1)).toMatchObject({
      optNo: "retry-opt-001",
      status: "accepted",
    });
    expect(messages.at(-1)?.msgid).toBeUndefined();
  });

  it("keeps pending messages when poll has no server receipt", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          nextVersion: Date.now(),
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会成功");
    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(1);
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) => message.content.type === "text" && message.content.text === "这条消息会成功",
      ),
    ).toBe(true);
  });

  it("clears pending messages when poll returns a matching server receipt", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService(baseService);

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会成功");
    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(0);
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) => message.content.type === "text" && message.content.text === "这条消息会成功",
      ),
    ).toBe(true);
  });

  it("keeps the failed message when retry send is rejected", async () => {
    const baseService = createMockWorkbenchService();
    let sendCount = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        sendCount += 1;

        if (sendCount === 2) {
          throw new Error("重试接口失败");
        }

        return baseService.sendMessage(payload);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("这条消息会失败 [fail]");
    await useWorkbenchStore.getState().pollWorkbench();

    const failedMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);
    const beforeRetryCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    const result = await useWorkbenchStore.getState().retryFailedMessage(failedMessage!.uiMessageKey);
    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    expect(result).toMatchObject({
      errorMessage: "重试接口失败",
      ok: false,
      reason: "send",
    });
    expect(messages).toHaveLength(beforeRetryCount);
    expect(messages.at(-1)).toMatchObject({
      uiMessageKey: failedMessage!.uiMessageKey,
      status: "failed",
    });
  });

  it("does not retry unsupported failed message types", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              audioUrl: "https://cdn.example.com/voice.amr",
              durationLabel: "0:05",
              type: "voice",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-voice-message",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    const result = await useWorkbenchStore
      .getState()
      .retryFailedMessage("failed-voice-message");

    expect(result).toEqual({
      errorCode: "UNSUPPORTED_RETRY_MESSAGE",
      errorMessage: "暂不支持重发该消息",
      reason: "unavailable",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].some(
          (message) => message.uiMessageKey === "failed-voice-message",
        ),
    ).toBe(true);
  });

  it("does not crash when retrying a failed image message without imageUrl", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              alt: "发送失败的图片",
              type: "image",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-image-without-url",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          } as Message,
        ],
      },
    }));

    const result = await useWorkbenchStore
      .getState()
      .retryFailedMessage("failed-image-without-url");

    expect(result).toEqual({
      errorCode: "UNSUPPORTED_RETRY_MESSAGE",
      errorMessage: "暂不支持重发该消息",
      reason: "unavailable",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not retry failed file messages without a sendable url", async () => {
    const baseService = createMockWorkbenchService();
    const sendMessage = vi.fn(baseService.sendMessage);

    setWorkbenchService({
      ...baseService,
      sendMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客服一号",
            content: {
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSizeLabel: "2 KB",
              type: "file",
            },
            conversationId: "conv-001",
            failReason: "模拟发送失败",
            uiMessageKey: "failed-file-without-url",
            role: "agent",
            sender: {
              id: "agent-001",
              name: "客服一号",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "failed",
          },
        ],
      },
    }));

    const result = await useWorkbenchStore
      .getState()
      .retryFailedMessage("failed-file-without-url");

    expect(result).toEqual({
      errorCode: "UNSUPPORTED_RETRY_MESSAGE",
      errorMessage: "暂不支持重发该消息",
      reason: "unavailable",
      ok: false,
    });
    expect(sendMessage).not.toHaveBeenCalled();
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
    expect(state.sinceVersion).toBeGreaterThan(0);
  });

  it("reloads message details in batch for poll message update events", async () => {
    const baseService = createMockWorkbenchService();
    const observedMessageSeqBatches: Array<number[]> = [];

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: request.activeConversationId ?? "conv-001",
              eventId: 4,
              messageSeq: 829,
            },
          ],
          nextMessageUpdateCursor: 1_778_840_010_000,
          nextSeatUpdateCursor: 1_778_840_020_000,
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.conversationId === "conv-001" && input.messageSeqs.includes(829)) {
          observedMessageSeqBatches.push([829]);
          return {
            messages: [
              {
                content: { text: "更新后的消息" },
                contentType: "text",
                conversationId: "conv-001",
                createdAt: 1_778_840_010_000,
                customerId: "cust-001",
                msgid: "829",
                rawMsgtype: "text",
                seatId: "drc",
                senderType: "customer",
                seq: 829,
                status: "sent",
              },
            ],
          };
        }

        return baseService.getMessagesBySeqs(input);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(observedMessageSeqBatches).toEqual([[829]]);
    expect(useWorkbenchStore.getState().seatUpdateCursor).toBe(1_778_840_020_000);
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) => message.uiMessageKey === "829",
      ),
    ).toBe(false);
  });

  it("patches refreshed message details into optimistic messages by optNo", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return {
          optNo: "opt-refresh-001",
          status: "accepted",
        };
      },
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: "conv-001",
              eventId: 11,
              messageSeq: 902,
            },
          ],
          nextMessageUpdateCursor: 1_778_840_030_000,
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.conversationId === "conv-001" && input.messageSeqs.includes(902)) {
          return {
            messages: [
              {
                content: {
                  text: "服务端刷新后的文本",
                },
                contentType: "text",
                conversationId: "conv-001",
                createdAt: 1_778_840_030_000,
                customerId: "cust-001",
                msgid: "remote-refresh-001",
                optNo: "opt-refresh-001",
                rawMsgtype: "text",
                seatId: "drc",
                senderType: "agent",
                seq: 902,
                status: "sent",
              },
            ],
          };
        }

        return baseService.getMessagesBySeqs(input);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("本地刷新前文本");

    const optimisticMessage =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].at(-1);

    expect(optimisticMessage).toMatchObject({
      optNo: "opt-refresh-001",
      status: "accepted",
    });
    expect(optimisticMessage?.uiMessageKey).not.toBe("902");

    await useWorkbenchStore.getState().pollWorkbench();

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];
    const patchedMatches = messages.filter(
      (message) =>
        message.optNo === "opt-refresh-001" ||
        message.uiMessageKey === optimisticMessage?.uiMessageKey ||
        message.uiMessageKey === "902",
    );

    expect(patchedMatches).toHaveLength(1);
    expect(patchedMatches[0]).toMatchObject({
      content: {
        text: "服务端刷新后的文本",
        type: "text",
      },
      msgid: "remote-refresh-001",
      optNo: "opt-refresh-001",
      seq: 902,
      status: "sent",
      uiMessageKey: "902",
    });
  });

  it("does not merge distinct messages only because both ui message keys are synthetic fallbacks", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [
            {
              content: { text: "远端空 key 消息" },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: 1_778_840_050_000,
              customerId: "cust-001",
              msgid: undefined,
              optNo: undefined,
              rawMsgtype: "text",
              seatId: "drc",
              senderType: "customer",
              seq: 0,
              status: "sent",
            } as unknown as WorkbenchMessageDto,
          ],
          conversationChanges: [],
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "客户",
            content: {
              text: "本地空 key 消息",
              type: "text",
            },
            conversationId: "conv-001",
            role: "customer",
            sender: {
              id: "customer-local-invalid-key",
              name: "客户",
            },
            sentAt: "2026-05-20 10:00:00",
            status: "sent",
            uiMessageKey: "invalid-message:local",
          },
        ],
      },
    }));

    const beforeCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    await useWorkbenchStore.getState().pollWorkbench();

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];
    expect(messages).toHaveLength(beforeCount + 1);
    expect(
      messages.filter(
        (message) =>
          message.uiMessageKey.startsWith("invalid-message:") &&
          message.role !== "system",
      ),
    ).toHaveLength(2);
  });

  it("patches poll media updates into the history panel without inserting missing messages", async () => {
    const baseService = createMockWorkbenchService();
    const originalMessage = createDownloadFileMessageDto({
      downloadStatus: "ing",
      fileUrl: "https://b5.bokr.com.cn/chat-files/old.pdf",
      id: "history-file-1",
      seq: 901,
    });

    setWorkbenchService({
      ...baseService,
      async getHistoryMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.scope === "file") {
          return {
            hasNext: false,
            hasPrev: false,
            messages: [originalMessage],
          };
        }

        return baseService.getHistoryMessages(conversationId, options);
      },
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: "conv-001",
              eventId: 8,
              messageSeq: 901,
            },
          ],
          nextMessageUpdateCursor: 1_778_840_010_000,
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.messageSeqs.includes(901)) {
          return {
            messages: [
              createDownloadFileMessageDto({
                downloadStatus: "finished",
                fileUrl: "https://b5.bokr.com.cn/chat-files/new.pdf",
                id: "history-file-1",
                seq: 901,
              }),
            ],
          };
        }

        return baseService.getMessagesBySeqs(input);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().openHistoryPanel("conv-001");
    await useWorkbenchStore.getState().setHistoryPanelScope("file");

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) => message.uiMessageKey === "901",
      ),
    ).toBe(false);

    await useWorkbenchStore.getState().pollWorkbench();

    const historyMessage =
      useWorkbenchStore.getState().historyPanelByConversationId["conv-001"]
        ?.messages[0];

    expect(historyMessage?.content).toMatchObject({
      downloadStatus: "finished",
      fileUrl: "https://b5.bokr.com.cn/chat-files/new.pdf",
      type: "file",
    });
    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) => message.uiMessageKey === "901",
      ),
    ).toBe(false);
  });

  it("does not clear existing download fields when a partial patch omits them", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          {
            author: "客户",
            content: {
              downloadStatus: "finished",
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSerialNo: "serial-file-1",
              fileSizeLabel: "2 KB",
              fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
              type: "file",
            },
            conversationId: "conv-001",
            msgid: "local-file-1",
            uiMessageKey: "local-file-1",
            role: "customer",
            sender: {
              id: "cust-001",
              name: "客户",
            },
            sentAt: "2026-05-21 12:00",
            status: "sent",
          },
        ],
      },
    }));

    useWorkbenchStore.getState().updateMessageDownloadContent(
      "conv-001",
      "local-file-1",
      {
        downloadStatus: "ing",
      },
    );

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "local-file-1",
      );

    expect(patchedMessage?.content).toMatchObject({
      downloadStatus: "ing",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      type: "file",
    });
  });

  it("patches media downloads by optNo after the message key is reconciled to seq", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          {
            author: "客户",
            content: {
              downloadStatus: "ing",
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSerialNo: "serial-file-902",
              fileSizeLabel: "2 KB",
              fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
              type: "file",
            },
            conversationId: "conv-001",
            msgid: "remote-file-902",
            optNo: "opt-file-902",
            uiMessageKey: "902",
            role: "customer",
            sender: {
              id: "cust-001",
              name: "客户",
            },
            sentAt: "2026-05-21 12:00",
            seq: 902,
            status: "sent",
          },
        ],
      },
    }));

    useWorkbenchStore.getState().updateMessageDownloadContent(
      "conv-001",
      "opt-file-902",
      {
        downloadStatus: "failed",
      },
    );

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "902",
      );

    expect(patchedMessage?.content).toMatchObject({
      downloadStatus: "failed",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      type: "file",
    });
  });

  it("does not patch media downloads when the provided message key is empty", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          {
            author: "客户",
            content: {
              downloadStatus: "ing",
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSerialNo: "serial-file-empty",
              fileSizeLabel: "2 KB",
              fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
              type: "file",
            },
            conversationId: "conv-001",
            msgid: undefined,
            uiMessageKey: "",
            role: "customer",
            sender: {
              id: "cust-001",
              name: "客户",
            },
            sentAt: "2026-05-21 12:00",
            status: "sent",
          },
        ],
      },
    }));

    useWorkbenchStore.getState().updateMessageDownloadContent("conv-001", "", {
      downloadStatus: "failed",
    });

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.role !== "system" && message.uiMessageKey === "",
      );

    expect(patchedMessage?.content).toMatchObject({
      downloadStatus: "ing",
      type: "file",
    });
  });

  it("does not patch media downloads by synthetic fallback ui message keys", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          {
            author: "客户",
            content: {
              downloadStatus: "ing",
              extension: "pdf",
              fileName: "报价单.pdf",
              fileSerialNo: "serial-file-invalid",
              fileSizeLabel: "2 KB",
              fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
              type: "file",
            },
            conversationId: "conv-001",
            msgid: undefined,
            uiMessageKey: "invalid-message:file",
            role: "customer",
            sender: {
              id: "cust-001",
              name: "客户",
            },
            sentAt: "2026-05-21 12:00",
            status: "sent",
          },
        ],
      },
    }));

    useWorkbenchStore.getState().updateMessageDownloadContent(
      "conv-001",
      "invalid-message:file",
      {
        downloadStatus: "failed",
      },
    );

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "invalid-message:file",
      );

    expect(patchedMessage?.content).toMatchObject({
      downloadStatus: "ing",
      type: "file",
    });
  });

  it("confirms unpersisted voice playback with message seq and patches local content", async () => {
    const baseService = createMockWorkbenchService();
    const confirmVoicePlaybackReady = vi.fn(async (input) => ({
      messageSeq: input.messageSeq,
      playbackUrl: input.playbackUrl,
      transFileUrlPersisted: true as const,
    }));

    setWorkbenchService({
      ...baseService,
      confirmVoicePlaybackReady,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const voiceMessage = {
      author: "客户",
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
        durationLabel: "11\"",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
        transFileUrlPersisted: false,
        type: "voice" as const,
      },
      conversationId: "conv-001",
      msgid: "msgid-should-not-be-used",
      uiMessageKey: "voice-local-1",
      role: "customer" as const,
      sender: {
        id: "cust-001",
        name: "客户",
      },
      sentAt: "2026-05-25 17:32",
      seq: 538,
      status: "sent" as const,
    };

    useWorkbenchStore.setState((state) => ({
      historyPanelByConversationId: {
        ...state.historyPanelByConversationId,
        "conv-001": {
          hasNext: false,
          hasPrev: false,
          messages: [voiceMessage],
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          voiceMessage,
        ],
      },
    }));

    await useWorkbenchStore.getState().confirmVoicePlaybackReady(
      "conv-001",
      "voice-local-1",
      "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    );

    expect(confirmVoicePlaybackReady).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 538,
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    });

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "voice-local-1",
      );
    const patchedHistoryMessage = useWorkbenchStore
      .getState()
      .historyPanelByConversationId["conv-001"]
      ?.messages.find((message) => message.uiMessageKey === "voice-local-1");

    expect(patchedMessage?.content).toMatchObject({
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
      transFileUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
      transFileUrlPersisted: true,
      type: "voice",
    });
    expect(patchedHistoryMessage?.content).toMatchObject({
      transFileUrlPersisted: true,
      type: "voice",
    });
  });

  it("confirms voice playback for history-only messages", async () => {
    const baseService = createMockWorkbenchService();
    const confirmVoicePlaybackReady = vi.fn(async (input) => ({
      messageSeq: input.messageSeq,
      playbackUrl: input.playbackUrl,
      transFileUrlPersisted: true as const,
    }));

    setWorkbenchService({
      ...baseService,
      confirmVoicePlaybackReady,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const voiceMessage = {
      author: "客户",
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/history-voice.amr",
        durationLabel: "11\"",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/history-voice.wav",
        transFileUrlPersisted: false,
        type: "voice" as const,
      },
      conversationId: "conv-001",
      uiMessageKey: "history-voice-1",
      role: "customer" as const,
      sender: {
        id: "cust-001",
        name: "客户",
      },
      sentAt: "2026-05-25 17:32",
      seq: 539,
      status: "sent" as const,
    };

    useWorkbenchStore.setState((state) => ({
      historyPanelByConversationId: {
        ...state.historyPanelByConversationId,
        "conv-001": {
          hasNext: false,
          hasPrev: false,
          messages: [voiceMessage],
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": state.messagesByConversationId["conv-001"].filter(
          (message) => message.uiMessageKey !== "history-voice-1",
        ),
      },
    }));

    await useWorkbenchStore.getState().confirmVoicePlaybackReady(
      "conv-001",
      "history-voice-1",
      "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/history-voice.wav",
    );

    expect(confirmVoicePlaybackReady).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 539,
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/history-voice.wav",
    });

    const patchedHistoryMessage = useWorkbenchStore
      .getState()
      .historyPanelByConversationId["conv-001"]
      ?.messages.find((message) => message.uiMessageKey === "history-voice-1");

    expect(patchedHistoryMessage?.content).toMatchObject({
      transFileUrlPersisted: true,
      type: "voice",
    });
  });

  it("transcribes a voice message with message seq and patches local content", async () => {
    const baseService = createMockWorkbenchService();
    const transcribeVoiceMessage = vi.fn(async (input) => ({
      messageSeq: input.messageSeq,
      transVoiceText: "识别后的文本",
      transVoiceTextPersisted: true as const,
    }));

    setWorkbenchService({
      ...baseService,
      transcribeVoiceMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const voiceMessage = {
      author: "客户",
      content: {
        audioUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
        durationLabel: "11\"",
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
        transFileUrlPersisted: false,
        transVoiceText: "",
        type: "voice" as const,
      },
      conversationId: "conv-001",
      msgid: "msgid-should-not-be-used",
      uiMessageKey: "voice-transcribe-1",
      role: "customer" as const,
      sender: {
        id: "cust-001",
        name: "客户",
      },
      sentAt: "2026-05-25 17:32",
      seq: 538,
      status: "sent" as const,
    };

    useWorkbenchStore.setState((state) => ({
      historyPanelByConversationId: {
        ...state.historyPanelByConversationId,
        "conv-001": {
          hasNext: false,
          hasPrev: false,
          messages: [voiceMessage],
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          voiceMessage,
        ],
      },
    }));

    await useWorkbenchStore.getState().transcribeVoiceMessage(
      "conv-001",
      "voice-transcribe-1",
    );

    expect(transcribeVoiceMessage).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 538,
    });

    const patchedMessage = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].find(
        (message) => message.uiMessageKey === "voice-transcribe-1",
      );
    const patchedHistoryMessage = useWorkbenchStore
      .getState()
      .historyPanelByConversationId["conv-001"]
      ?.messages.find((message) => message.uiMessageKey === "voice-transcribe-1");

    expect(patchedMessage?.content).toMatchObject({
      transVoiceText: "识别后的文本",
      type: "voice",
    });
    expect(patchedHistoryMessage?.content).toMatchObject({
      transVoiceText: "识别后的文本",
      type: "voice",
    });
  });

  it("ignores refreshed message details when the message is not already in store", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll(request) {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: request.activeConversationId ?? "conv-001",
              eventId: 6,
              messageSeq: 999999,
            },
          ],
          nextMessageUpdateCursor: 1_778_840_010_000,
          nextVersion: request.sinceVersion + 1,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.messageSeqs.includes(999999)) {
          return {
            messages: [
              {
                content: { text: "不会被插入" },
                contentType: "text",
                conversationId: input.conversationId,
                createdAt: 1_778_410_200_000,
                customerId: "cust-001",
                msgid: "999999",
                rawMsgtype: "text",
                seatId: "drc",
                senderAvatar: "",
                senderName: "幽灵消息",
                senderType: "customer",
                seq: 999999,
                status: "sent",
                thirdExternalUserId: "external-1",
                thirdFromId: "sender-cust-001",
                thirdUserId: "third-user-drc",
              },
            ],
          };
        }

        return baseService.getMessagesBySeqs(input);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const beforeLength = useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().messagesByConversationId["conv-001"]).toHaveLength(
      beforeLength,
    );
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
    expect(state.sinceVersion).toBeGreaterThan(0);
  });

  it("drops stale cursor recovery results after the active account changes", async () => {
    const baseService = createMockWorkbenchService();
    let shouldInvalidateCursor = true;
    const recoveryGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        if (accountId === "drc" && !shouldInvalidateCursor) {
          await recoveryGate.promise;
        }

        return baseService.getConversations(accountId, options);
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
    useWorkbenchStore.setState((state) => ({
      ...state,
      seatUpdateCursor: 1_778_840_030_000,
    }));

    const recoveryPromise = useWorkbenchStore.getState().pollWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    recoveryGate.resolve();
    await recoveryPromise;

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeConversationId).toBe("conv-005");
    expect(state.seatUpdateCursor).toBe(1_778_840_030_000);
  });

  it("loads the full seed page when the default message page covers all history", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-001"]).toHaveLength(
      seedMessages["conv-001"].length,
    );
    expect(state.messagesByConversationId["conv-001"][0]).toMatchObject({
      uiMessageKey: getSeedMessageIdAt("conv-001", 0),
      seq: 1,
    });
    expect(state.hasMoreHistoryByConversationId["conv-001"]).toBe(false);

    await useWorkbenchStore.getState().loadOlderMessages();

    expect(
      useWorkbenchStore.getState().hasMoreHistoryByConversationId["conv-001"],
    ).toBe(false);
  });

  it("does not auto-loop when older history only contains revoke signals", async () => {
    const baseService = createMockWorkbenchService();
    const calls: Array<{ beforeSeq?: number; conversationId: string }> = [];

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        calls.push({ beforeSeq: options?.beforeSeq, conversationId });

        if (conversationId === "conv-001" && options?.beforeSeq != null) {
          const beforeSeq = options.beforeSeq;

          return {
            filteredCount: 0,
            hasMore: true,
            messages: Array.from({ length: 50 }, (_, index) => ({
              content: {
                revokeMsgId: `older-message-${index}`,
                revokeOriginMsgId: `older-message-${index}`,
                type: "revoke",
              },
              contentType: "revoke",
              conversationId,
              createdAt: Date.now() - index,
              customerId: "cust-001",
              msgid: `revoke-older-message-${index}`,
              rawMsgtype: "revoke",
              seatId: "drc",
              senderType: "system" as const,
              seq: beforeSeq - index - 1,
              status: "sent",
            })),
            nextBeforeSeq: Math.max(beforeSeq - 50, 1),
            scannedCount: 50,
          };
        }

        if (conversationId === "conv-001") {
          const page = await baseService.getMessages(conversationId, options);

          return {
            ...page,
            hasMore: true,
            nextBeforeSeq: page.nextBeforeSeq ?? 5,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().loadOlderMessages();

    const state = useWorkbenchStore.getState();

    expect(calls.filter((call) => call.beforeSeq != null)).toHaveLength(1);
    expect(state.hasMoreHistoryByConversationId["conv-001"]).toBe(true);
    expect(state.historyStatusByConversationId["conv-001"]).toBe("idle");
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

  it("selects the target account immediately while loading its conversations", async () => {
    const baseService = createMockWorkbenchService();
    const accountSwitchConversationsStarted = createDeferred();
    const accountSwitchConversationsGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        if (accountId === "ndt" && options?.mode === "single") {
          accountSwitchConversationsStarted.resolve();
          await accountSwitchConversationsGate.promise;
        }

        return baseService.getConversations(accountId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const accountSwitchPromise = useWorkbenchStore.getState().setActiveAccount("ndt");
    await accountSwitchConversationsStarted.promise;

    const loadingState = useWorkbenchStore.getState();
    expect(loadingState.activeAccountId).toBe("ndt");
    expect(loadingState.activeConversationId).toBe("");
    expect(loadingState.isConversationLoading).toBe(true);

    accountSwitchConversationsGate.resolve();
    await accountSwitchPromise;

    const loadedState = useWorkbenchStore.getState();
    expect(loadedState.activeAccountId).toBe("ndt");
    expect(loadedState.activeConversationId).toBe("conv-005");
    expect(loadedState.isConversationLoading).toBe(false);
  });

  it("shows the switched account conversation list before the first message page finishes loading", async () => {
    const baseService = createMockWorkbenchService();
    let ndtConversationRequestCount = 0;
    const firstMessagePageStarted = createDeferred();
    const firstMessagePageGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        const response = await baseService.getConversations(accountId, options);

        if (accountId === "ndt") {
          ndtConversationRequestCount += 1;
        }

        return response;
      },
      async getMessages(conversationId, options) {
        if (conversationId === "conv-005" && options?.beforeSeq == null) {
          firstMessagePageStarted.resolve();
          await firstMessagePageGate.promise;
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const accountSwitchPromise = useWorkbenchStore.getState().setActiveAccount("ndt");
    await firstMessagePageStarted.promise;

    const loadingState = useWorkbenchStore.getState();
    expect(ndtConversationRequestCount).toBe(2);
    expect(loadingState.activeAccountId).toBe("ndt");
    expect(loadingState.activeConversationId).toBe("conv-005");
    expect(loadingState.conversationListsByScope.ndt.map((item) => item.id)).toEqual([
      "conv-005",
      "conv-006",
    ]);
    expect(loadingState.messagesByConversationId["conv-005"]).toBeUndefined();
    expect(loadingState.isConversationLoading).toBe(true);

    firstMessagePageGate.resolve();
    await accountSwitchPromise;

    const loadedState = useWorkbenchStore.getState();
    expect(loadedState.messagesByConversationId["conv-005"]).toBeDefined();
    expect(loadedState.isConversationLoading).toBe(false);
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

    expect(state.historyStatusByConversationId["conv-001"]).toBeUndefined();
    expect(state.historyStatusByConversationId["conv-002"] ?? "idle").toBe("idle");

    historyGate.resolve();
    await historyPromise;

    state = useWorkbenchStore.getState();

    expect(state.historyStatusByConversationId["conv-001"]).toBeUndefined();
  });

  it("preserves pending conversation messages when a stale history load resolves", async () => {
    const baseService = createMockWorkbenchService();
    const historyGate = createDeferred();

    setWorkbenchService({
      ...baseService,
      async getMessages(conversationId, options) {
        if (conversationId === "conv-001" && options?.beforeSeq == null) {
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
    await useWorkbenchStore.getState().sendAgentTextMessage("历史加载期间发送");
    useWorkbenchStore.setState((state) => ({
      hasMoreHistoryByConversationId: {
        ...state.hasMoreHistoryByConversationId,
        "conv-001": true,
      },
    }));

    const historyPromise = useWorkbenchStore.getState().loadOlderMessages();
    await useWorkbenchStore.getState().setActiveConversation("conv-002");

    historyGate.resolve();
    await historyPromise;

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages.map((message) => message.conversationId)).toContain(
      "conv-001",
    );
    expect(state.messagesByConversationId["conv-001"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: {
            text: "历史加载期间发送",
            type: "text",
          },
        }),
      ]),
    );
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

  it("patches only takeover owner after account takeover succeeds", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async takeOverSeat(seatId) {
        return {
          hostSubUserId: "sub-user-001",
          seatId,
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const beforeAccount = useWorkbenchStore
      .getState()
      .accounts.find((account) => account.id === "ndt");

    await useWorkbenchStore.getState().takeOverAccount("ndt");

    const afterAccount = useWorkbenchStore
      .getState()
      .accounts.find((account) => account.id === "ndt");

    expect(afterAccount).toEqual({
      ...beforeAccount,
      takenOverEmployeeId: "sub-user-001",
    });
  });

  it("returns the API error message when takeover fails", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async takeOverSeat() {
        throw {
          code: "FORBIDDEN",
          message: "无权限访问",
          status: 403,
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    await expect(useWorkbenchStore.getState().takeOverAccount("ndt")).resolves.toEqual({
      errorMessage: "无权限访问",
      ok: false,
    });
    expect(useWorkbenchStore.getState().takeoverStatusByAccountId.ndt).toBeUndefined();
  });

  it("keeps unread counts when switching into an untaken account", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();

    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const state = useWorkbenchStore.getState();

    expect(state.accounts.find((account) => account.id === "ndt")?.unreadCount).toBe(1);
    expect(state.conversationListsByScope.ndt[0].unread).toBe(1);
  });

  it("refreshes non-active seat summaries without changing the selected seat", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async getSeats() {
        return baseService.getSeats().then((seats) =>
          seats.map((seat) =>
            seat.seatId === "drc"
              ? {
                  ...seat,
                  unreadCount: 15,
                }
              : seat,
          ),
        );
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");
    await useWorkbenchStore.getState().refreshSeatSummaries();

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("ndt");
    expect(state.accounts.find((account) => account.id === "ndt")?.unreadCount).toBe(1);
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(15);
    expect(state.conversationListsByScope.ndt[0].unread).toBe(1);
  });

  it("evicts old seat conversation list caches while keeping recent and active seats", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    useWorkbenchStore.setState((state) => ({
      conversationListCacheSeatOrder: ["ndt", "drc", "seat-c", "seat-d"],
      conversationListsByScope: {
        ...state.conversationListsByScope,
        "seat-c": [createCachedConversation("seat-c")],
        "seat-d": [createCachedConversation("seat-d")],
      },
      conversationModeLoadedAtByScope: {
        ...state.conversationModeLoadedAtByScope,
        "seat-c": { single: 1 },
        "seat-d": { single: 1 },
      },
    }));

    await useWorkbenchStore.getState().setActiveAccount("drc");

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("drc");
    expect(state.conversationListCacheSeatOrder).toHaveLength(
      MAX_CONVERSATION_LIST_CACHE_SEATS,
    );
    expect(Object.keys(state.conversationListsByScope).sort()).toEqual([
      "drc",
      "ndt",
      "seat-c",
    ]);
    expect(state.conversationListsByScope["seat-d"]).toBeUndefined();
    expect(state.conversationModeLoadedAtByScope["seat-d"]).toBeUndefined();
  });

  it("clears resources for conversations whose seat list cache is evicted", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    const seatDConversation = createCachedConversation("seat-d");

    useWorkbenchStore.setState((state) => ({
      conversationListCacheSeatOrder: ["ndt", "drc", "seat-c", "seat-d"],
      conversationListsByScope: {
        ...state.conversationListsByScope,
        "seat-c": [createCachedConversation("seat-c")],
        "seat-d": [seatDConversation],
      },
      conversationModeLoadedAtByScope: {
        ...state.conversationModeLoadedAtByScope,
        "seat-c": { single: 1 },
        "seat-d": { single: 1 },
      },
      groupMembersByConversationId: {
        ...state.groupMembersByConversationId,
        [seatDConversation.id]: [],
      },
      groupMembersLoadingByConversationId: {
        ...state.groupMembersLoadingByConversationId,
        [seatDConversation.id]: true,
      },
      hasMoreHistoryByConversationId: {
        ...state.hasMoreHistoryByConversationId,
        [seatDConversation.id]: true,
      },
      historyStatusByConversationId: {
        ...state.historyStatusByConversationId,
        [seatDConversation.id]: "loading",
      },
      messagePaginationByConversationId: {
        ...state.messagePaginationByConversationId,
        [seatDConversation.id]: {
          hasMore: true,
          nextBeforeSeq: 12,
          skippedHiddenCount: 0,
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [seatDConversation.id]: [],
      },
    }));

    await useWorkbenchStore.getState().setActiveAccount("drc");

    const state = useWorkbenchStore.getState();
    expect(state.conversationListsByScope["seat-d"]).toBeUndefined();
    expect(state.messagesByConversationId[seatDConversation.id]).toBeUndefined();
    expect(state.messagePaginationByConversationId[seatDConversation.id]).toBeUndefined();
    expect(state.hasMoreHistoryByConversationId[seatDConversation.id]).toBeUndefined();
    expect(state.historyStatusByConversationId[seatDConversation.id]).toBeUndefined();
    expect(state.groupMembersByConversationId[seatDConversation.id]).toBeUndefined();
    expect(state.groupMembersLoadingByConversationId[seatDConversation.id]).toBeUndefined();
  });

  it("clears previous seat message cache when switching accounts within the seat cache", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");

    let state = useWorkbenchStore.getState();
    expect(state.activeAccountId).toBe("drc");
    expect(state.activeConversationId).toBe("conv-004");
    expect(state.messagesByConversationId["conv-004"]).toBeDefined();
    expect(state.groupMembersByConversationId["conv-004"]).toBeDefined();

    await useWorkbenchStore.getState().setActiveAccount("ndt");

    state = useWorkbenchStore.getState();
    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeConversationId).toBe("conv-005");
    expect(state.messagesByConversationId["conv-004"]).toBeUndefined();
    expect(state.messagePaginationByConversationId["conv-004"]).toBeUndefined();
    expect(state.hasMoreHistoryByConversationId["conv-004"]).toBeUndefined();
    expect(state.historyStatusByConversationId["conv-004"]).toBeUndefined();
    expect(state.groupMembersByConversationId["conv-004"]).toBeDefined();
    expect(state.groupMembersLoadingByConversationId["conv-004"]).toBe(false);
    expect(state.messagesByConversationId["conv-005"]).toBeDefined();
  });

  it("keeps recent seat conversation list caches when bootstrapping again", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    useWorkbenchStore.setState((state) => ({
      conversationListCacheSeatOrder: ["ndt", "drc"],
      conversationListsByScope: {
        ...state.conversationListsByScope,
        ndt: [createCachedConversation("ndt")],
      },
      conversationModeLoadedAtByScope: {
        ...state.conversationModeLoadedAtByScope,
        ndt: { single: 1, group: 1 },
      },
    }));

    await useWorkbenchStore.getState().initializeWorkbench();

    const state = useWorkbenchStore.getState();

    expect(state.activeAccountId).toBe("drc");
    expect(state.conversationListsByScope.ndt).toEqual([
      createCachedConversation("ndt"),
    ]);
    expect(state.conversationModeLoadedAtByScope.ndt).toEqual({
      group: 1,
      single: 1,
    });
    expect(state.conversationListCacheSeatOrder).toEqual(["drc", "ndt"]);
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

  it("skips conversation writes when the active account is offline", async () => {
    const baseService = createMockWorkbenchService();
    const markUnread = vi.fn(baseService.markConversationUnread);

    setWorkbenchService({
      ...baseService,
      markConversationUnread: markUnread,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === "drc"
          ? {
              ...account,
              loginStatus: "offline",
            }
          : account,
      ),
      hasChatSendPermission: true,
    }));

    await useWorkbenchStore.getState().markConversationUnread("conv-002");

    expect(markUnread).not.toHaveBeenCalled();
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
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(12);
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
    const observedConversationRequests: Array<{ accountId: string; mode?: string }> = [];

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        observedConversationRequests.push({ accountId, mode: options?.mode });

        return baseService.getConversations(accountId, options);
      },
      async pinConversation(conversationId) {
        observedPinnedConversationIds.push(conversationId);

        return baseService.pinConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationRequests.length = 0;

    await useWorkbenchStore.getState().pinConversation("conv-002");

    const state = useWorkbenchStore.getState();

    expect(observedPinnedConversationIds).toEqual(["conv-002"]);
    expect(observedConversationRequests).toEqual([
      { accountId: "drc", mode: "single" },
      { accountId: "drc", mode: "group" },
    ]);
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
      async getConversations(accountId, options) {
        if (deferDrcReload && accountId === "drc") {
          reloadRequested.resolve();

          return deferredReload.promise;
        }

        return baseService.getConversations(accountId, options);
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
    const observedConversationRequests: Array<{ accountId: string; mode?: string }> = [];

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        observedConversationRequests.push({ accountId, mode: options?.mode });

        return baseService.getConversations(accountId, options);
      },
      async unpinConversation(conversationId) {
        observedUnpinnedConversationIds.push(conversationId);

        return baseService.unpinConversation(conversationId);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationRequests.length = 0;

    await useWorkbenchStore.getState().unpinConversation("conv-001");

    const state = useWorkbenchStore.getState();

    expect(observedUnpinnedConversationIds).toEqual(["conv-001"]);
    expect(observedConversationRequests).toEqual([
      { accountId: "drc", mode: "single" },
      { accountId: "drc", mode: "group" },
    ]);
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
      async getConversations(accountId, options) {
        observedConversationScopes.push(accountId);

        return baseService.getConversations(accountId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    observedConversationScopes.length = 0;
    const beforeDelete = useWorkbenchStore.getState();
    const unreadBeforeDelete = beforeDelete.accounts.find((account) => account.id === "drc")?.unreadCount ?? 0;
    const deletedConversationUnread =
      beforeDelete.conversationListsByScope.drc.find((conversation) => conversation.id === "conv-003")?.unread ?? 0;

    await useWorkbenchStore.getState().deleteConversation("conv-003");

    const state = useWorkbenchStore.getState();
    expect(observedDeletedConversationIds).toEqual(["conv-003"]);
    expect(observedConversationScopes).toEqual([]);
    expect(state.conversationListsByScope.drc.map((conversation) => conversation.id)).not.toContain("conv-003");
    expect(state.accounts.find((account) => account.id === "drc")?.unreadCount).toBe(
      Math.max(0, unreadBeforeDelete - deletedConversationUnread),
    );
  });

  it("clears deleted conversation message and group member state", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveMode("group");
    await useWorkbenchStore.getState().setActiveConversation("conv-001");

    useWorkbenchStore.setState((state) => ({
      groupMembersByConversationId: {
        ...state.groupMembersByConversationId,
        "conv-003": [],
      },
      groupMembersLoadingByConversationId: {
        ...state.groupMembersLoadingByConversationId,
        "conv-003": true,
      },
      hasMoreHistoryByConversationId: {
        ...state.hasMoreHistoryByConversationId,
        "conv-003": true,
      },
      historyStatusByConversationId: {
        ...state.historyStatusByConversationId,
        "conv-003": "loading",
      },
      messagePaginationByConversationId: {
        ...state.messagePaginationByConversationId,
        "conv-003": {
          hasMore: true,
          nextBeforeSeq: 12,
          skippedHiddenCount: 0,
        },
      },
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-003": seedMessages["conv-003"],
      },
    }));

    await useWorkbenchStore.getState().deleteConversation("conv-003");

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-003"]).toBeUndefined();
    expect(state.messagePaginationByConversationId["conv-003"]).toBeUndefined();
    expect(state.hasMoreHistoryByConversationId["conv-003"]).toBeUndefined();
    expect(state.historyStatusByConversationId["conv-003"]).toBeUndefined();
    expect(state.groupMembersByConversationId["conv-003"]).toBeUndefined();
    expect(state.groupMembersLoadingByConversationId["conv-003"]).toBeUndefined();
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

  it("hydrates and caches an existing search result before selecting it", async () => {
    const baseService = createMockWorkbenchService();
    const hydratedConversation: WorkbenchConversationSummaryDto = {
      conversationId: "conv-search-001",
      seatId: "drc",
      customerId: "cust-search-001",
      customerName: "搜索客户",
      customerAvatar: "",
      lastMessage: "来自搜索",
      lastMessageTime: 1_778_999_000_000,
      unreadCount: 0,
      mode: "single",
      priority: "medium",
      thirdExternalUserId: "external-search-001",
      thirdUserId: "third-user-drc",
      agentMode: "semi",
    };
    const observedPayloads: unknown[] = [];

    setWorkbenchService({
      ...baseService,
      async getOrCreateConversation(payload) {
        observedPayloads.push(payload);
        return hydratedConversation;
      },
      async getMessages(conversationId, options) {
        if (conversationId === hydratedConversation.conversationId) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [
              {
                content: { text: "来自搜索" },
                contentType: "text",
                conversationId,
                createdAt: 1_778_999_000_000,
                customerId: hydratedConversation.customerId,
                msgid: "msg-search-001",
                rawMsgtype: "text",
                seatId: hydratedConversation.seatId,
                senderType: "customer",
                seq: 1,
                status: "sent",
              },
            ],
            scannedCount: 1,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    expect(
      useWorkbenchStore.getState().conversationListsByScope.drc.some(
        (conversation) => conversation.id === hydratedConversation.conversationId,
      ),
    ).toBe(false);

    await useWorkbenchStore.getState().setActiveMode("single", {
      preserveConversation: {
        accountId: "drc",
        customerAvatarUrl: "",
        customerId: "external-search-001",
        customerName: "搜索客户",
        id: hydratedConversation.conversationId,
        mode: "single",
        preview: "来自搜索",
        priority: "medium",
        quietFor: "",
        unread: 0,
        updatedAt: "",
        agentMode: "semi",
      },
    });

    const state = useWorkbenchStore.getState();
    expect(state.activeConversationId).toBe("conv-001");
    expect(
      state.conversationListsByScope.drc.find(
        (conversation) => conversation.id === hydratedConversation.conversationId,
      ),
    ).toMatchObject({
      customerName: "搜索客户",
      id: hydratedConversation.conversationId,
    });
  });

  it("does not apply hydrated search results after switching accounts", async () => {
    const baseService = createMockWorkbenchService();
    const deferredConversation = createDeferred<WorkbenchConversationSummaryDto>();

    setWorkbenchService({
      ...baseService,
      getOrCreateConversation() {
        return deferredConversation.promise;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const selectPromise = useWorkbenchStore.getState().selectOrCreateAndSelectConversation({
      avatar: "",
      conversationId: "conv-search-stale",
      name: "搜索客户",
      realName: "搜索客户",
      thirdExternalUserId: "external-search-stale",
    });

    await useWorkbenchStore.getState().setActiveAccount("ndt");
    deferredConversation.resolve({
      conversationId: "conv-search-stale",
      customerAvatar: "",
      customerId: "cust-search-stale",
      customerName: "搜索客户",
      lastMessage: "来自搜索",
      lastMessageTime: 1_778_999_000_000,
      mode: "single",
      priority: "medium",
      seatId: "drc",
      thirdExternalUserId: "external-search-stale",
      thirdUserId: "third-user-drc",
      unreadCount: 0,
      agentMode: "semi",
    });
    await selectPromise;

    const state = useWorkbenchStore.getState();
    expect(state.activeAccountId).toBe("ndt");
    expect(state.activeConversationId).not.toBe("conv-search-stale");
    expect(
      state.conversationListsByScope.drc.some(
        (conversation) => conversation.id === "conv-search-stale",
      ),
    ).toBe(false);
    expect(state.isConversationLoading).toBe(false);
  });

  it("keeps search input and results when opening a search conversation fails", async () => {
    const baseService = createMockWorkbenchService();
    const searchResults = {
      contacts: [
        {
          avatar: "",
          conversationId: "conv-search-failed",
          name: "搜索客户",
          realName: "搜索客户",
          thirdExternalUserId: "external-search-failed",
        },
      ],
      groups: [],
    };

    setWorkbenchService({
      ...baseService,
      async getOrCreateConversation() {
        throw new Error("开启失败");
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState({
      isSearchLoading: false,
      searchKeyword: "搜索客户",
      searchResults,
    });

    await useWorkbenchStore
      .getState()
      .selectOrCreateAndSelectConversation(searchResults.contacts[0]);

    const state = useWorkbenchStore.getState();
    expect(state.searchKeyword).toBe("搜索客户");
    expect(state.searchResults).toBe(searchResults);
    expect(state.isSearchLoading).toBe(false);
    expect(state.conversationOpenError).toBe("开启失败");
  });

  it("does not show stale search open errors after switching accounts", async () => {
    const baseService = createMockWorkbenchService();
    const deferredConversation = createDeferred<WorkbenchConversationSummaryDto>();

    setWorkbenchService({
      ...baseService,
      getOrCreateConversation() {
        return deferredConversation.promise;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const selectPromise = useWorkbenchStore.getState().selectOrCreateAndSelectConversation({
      avatar: "",
      conversationId: "conv-search-stale",
      name: "搜索客户",
      realName: "搜索客户",
      thirdExternalUserId: "external-search-stale",
    });

    await useWorkbenchStore.getState().setActiveAccount("ndt");
    deferredConversation.reject(new Error("旧账号开启失败"));
    await selectPromise;

    const state = useWorkbenchStore.getState();
    expect(state.activeAccountId).toBe("ndt");
    expect(state.conversationOpenError).toBeUndefined();
  });

  it("merges preserved same-mode conversations into their own account scope", async () => {
    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().setActiveAccount("ndt");

    await useWorkbenchStore.getState().setActiveMode("single", {
      preserveConversation: {
        accountId: "drc",
        customerAvatarUrl: "",
        customerId: "drc-preserved-customer",
        customerName: "跨账号保留客户",
        id: "drc-preserved-conversation",
        mode: "single",
        preview: "来自搜索",
        priority: "medium",
        quietFor: "",
        unread: 0,
        updatedAt: "",
        agentMode: "semi",
      },
    });

    const state = useWorkbenchStore.getState();
    expect(
      state.conversationListsByScope.drc.some(
        (conversation) => conversation.id === "drc-preserved-conversation",
      ),
    ).toBe(true);
    expect(
      state.conversationListsByScope.ndt.some(
        (conversation) => conversation.id === "drc-preserved-conversation",
      ),
    ).toBe(false);
  });

  it("keeps a hydrated search conversation when switching modes reloads stale lists", async () => {
    const baseService = createMockWorkbenchService();
    const hydratedConversation: WorkbenchConversationSummaryDto = {
      conversationId: "conv-search-group-001",
      seatId: "drc",
      customerId: "group-search-001",
      customerName: "搜索群聊",
      customerAvatar: "",
      lastMessage: "来自搜索",
      lastMessageTime: 1_778_999_000_000,
      mode: "group",
      priority: "medium",
      thirdGroupId: "group-search-001",
      thirdUserId: "third-user-drc",
      unreadCount: 0,
      agentMode: "semi",
    };

    setWorkbenchService({
      ...baseService,
      async getConversations(accountId, options) {
        const result = await baseService.getConversations(accountId, options);

        if (accountId === "drc" && options?.mode === "group") {
          return {
            ...result,
            items: result.items.filter(
              (conversation) => conversation.conversationId !== hydratedConversation.conversationId,
            ),
          };
        }

        return result;
      },
      async getGroupMembers(conversationId) {
        if (conversationId === hydratedConversation.conversationId) {
          return {
            conversationId,
            groupSeatId: "group-seat-search-001",
            thirdGroupId: "group-search-001",
            items: [],
          };
        }

        return baseService.getGroupMembers(conversationId);
      },
      async getMessages(conversationId, options) {
        if (conversationId === hydratedConversation.conversationId) {
          return {
            filteredCount: 0,
            hasMore: false,
            messages: [],
            scannedCount: 0,
          };
        }

        return baseService.getMessages(conversationId, options);
      },
      async getOrCreateConversation() {
        return hydratedConversation;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      conversationModeLoadedAtByScope: {
        ...state.conversationModeLoadedAtByScope,
        drc: {
          ...state.conversationModeLoadedAtByScope.drc,
          group: 0,
        },
      },
    }));

    await useWorkbenchStore.getState().setActiveMode("group", {
      preserveConversation: {
        accountId: "drc",
        customerAvatarUrl: "",
        customerId: "group-search-001",
        customerName: "搜索群聊",
        id: hydratedConversation.conversationId,
        mode: "group",
        preview: "来自搜索",
        priority: "medium",
        quietFor: "",
        unread: 0,
        updatedAt: "",
        agentMode: "semi",
      },
    });

    const state = useWorkbenchStore.getState();
    expect(state.activeMode).toBe("group");
    expect(
      state.conversationListsByScope.drc.find(
        (conversation) => conversation.id === hydratedConversation.conversationId,
      ),
    ).toMatchObject({
      customerName: "搜索群聊",
      id: hydratedConversation.conversationId,
      mode: "group",
    });
    expect(state.activeConversationId).toBe("conv-004");
  });

});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkbenchConversationChangeDto,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { notifyPulledCustomerMessage } from "@/pages/chat/lib/new-message-title-alert";
import { seedMessages } from "@/pages/chat/mock-data";
import { useWorkbenchStore } from "@/store/workbench-store";
import { resetWorkbenchStoreTestState } from "./workbench-store-test-utils";

vi.mock("@/pages/chat/api/media-upload-service", () => ({
  resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
}));

vi.mock("@/pages/chat/lib/new-message-title-alert", () => ({
  notifyPulledCustomerMessage: vi.fn(),
}));

describe("workbench message merge state", () => {
  beforeEach(() => {
    resetWorkbenchStoreTestState();
    vi.mocked(notifyPulledCustomerMessage).mockClear();
    vi.mocked(resolveImageSegmentsForSend).mockImplementation(
      async (_conversationId, segments) => segments,
    );
  });

  it("merges optimistic and remote messages into one stable feed item", async () => {
    const baseService = createMockWorkbenchService();
    let observedClientMessageId = "";

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        observedClientMessageId = payload.clientMessageId;

        return {
          clientMessageId: payload.clientMessageId,
          messageId: "opt-stable-001",
          optNo: "opt-stable-001",
          status: "accepted",
        };
      },
      async poll() {
        const remoteMessage = {
          clientMessageId: undefined,
          content: {
            text: "服务端确认文本",
          },
          contentType: "text",
          conversationId: "conv-001",
          createdAt: Date.now(),
          customerId: "cust-001",
          messageId: "remote-stable-001",
          optNo: "opt-stable-001",
          seatId: "drc",
          senderType: "agent",
          seq: 999,
          status: "sent",
        } satisfies WorkbenchMessageDto;
        return {
          activeConversationMessages: [remoteMessage],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const initialCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    await useWorkbenchStore.getState().sendAgentTextMessage("本地待确认文本");

    const optimisticMessages =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"];
    const optimisticMessage = optimisticMessages.at(-1);

    expect(optimisticMessages).toHaveLength(initialCount + 1);
    expect(optimisticMessage).toMatchObject({
      clientMessageId: observedClientMessageId,
      id: observedClientMessageId,
      optNo: "opt-stable-001",
      remoteMessageId: "opt-stable-001",
      status: "accepted",
    });
    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(1);

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const mergedMessages = state.messagesByConversationId["conv-001"];
    const mergedMatches = mergedMessages.filter(
      (message) =>
        message.optNo === "opt-stable-001" ||
        message.remoteMessageId === "remote-stable-001" ||
        message.id === observedClientMessageId,
    );

    expect(mergedMessages).toHaveLength(initialCount + 1);
    expect(mergedMatches).toHaveLength(1);
    expect(mergedMatches[0]).toMatchObject({
      clientMessageId: observedClientMessageId,
      content: {
        text: "服务端确认文本",
        type: "text",
      },
      id: "remote-stable-001",
      optNo: "opt-stable-001",
      remoteMessageId: "remote-stable-001",
      status: "sent",
    });
    expect(state.pendingMessages).toHaveLength(0);
    expect(state.conversationListsByScope[state.activeAccountId][0]).toMatchObject({
      id: "conv-001",
      preview: "本地待确认文本",
    });
    expect(state.messagePaginationByConversationId["conv-001"]).toMatchObject({
      hasMore: false,
      skippedHiddenCount: 0,
    });
    expect(state.historyStatusByConversationId["conv-001"]).toBeUndefined();
  });

  it("marks optimistic messages failed when polled audit messages match by optNo", async () => {
    const baseService = createMockWorkbenchService();
    let observedClientMessageId = "";

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        observedClientMessageId = payload.clientMessageId;

        return {
          clientMessageId: payload.clientMessageId,
          messageId: "opt-failed-001",
          optNo: "opt-failed-001",
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              clientMessageId: undefined,
              content: {
                text: "发送失败文本",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              messageId: "remote-failed-001",
              optNo: "opt-failed-001",
              seatId: "drc",
              senderType: "agent",
              seq: 999,
              status: "failed",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const initialCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;

    await useWorkbenchStore.getState().sendAgentTextMessage("本地失败文本");
    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(1);

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const mergedMessages = state.messagesByConversationId["conv-001"];
    const failedMatches = mergedMessages.filter(
      (message) =>
        message.optNo === "opt-failed-001" ||
        message.remoteMessageId === "remote-failed-001" ||
        message.id === observedClientMessageId,
    );

    expect(mergedMessages).toHaveLength(initialCount + 1);
    expect(failedMatches).toHaveLength(1);
    expect(failedMatches[0]).toMatchObject({
      clientMessageId: observedClientMessageId,
      id: "remote-failed-001",
      optNo: "opt-failed-001",
      remoteMessageId: "remote-failed-001",
      status: "failed",
    });
    expect(state.pendingMessages).toHaveLength(0);
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
              status: "sent",
            },
          ],
          conversationChanges: [],
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

    const state = useWorkbenchStore.getState();
    latestMessages = state.messagesByConversationId["conv-001"].slice(-3);

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
        status: "sent",
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
    expect(
      state.messagesByConversationId["conv-001"].filter((message) => message.optNo === "opt-2"),
    ).toHaveLength(1);
    expect(state.messagePaginationByConversationId["conv-001"]).toMatchObject({
      hasMore: false,
    });
  });

  it("keeps seed and pagination state untouched while reconciling message content", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "服务端补充消息",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              messageId: "remote-extra-001",
              seatId: "drc",
              senderType: "customer",
              seq: 999,
              status: "sent",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const initialSeedIds = seedMessages["conv-001"].map((message) => message.id);

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];

    expect(messages.slice(0, initialSeedIds.length).map((message) => message.id)).toEqual(
      initialSeedIds,
    );
    expect(messages.at(-1)).toMatchObject({
      content: {
        text: "服务端补充消息",
        type: "text",
      },
      id: "remote-extra-001",
    });
    expect(state.activeMessageSeq).toBe(999);
    expect(state.messagePaginationByConversationId["conv-001"]).toMatchObject({
      hasMore: false,
      skippedHiddenCount: 0,
    });
  });

  it("marks optimistic and polled appended chat messages as new without touching initial history", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage(payload) {
        return {
          clientMessageId: payload.clientMessageId,
          messageId: "opt-new-001",
          optNo: "opt-new-001",
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "轮询新客户消息",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              messageId: "remote-new-customer-001",
              seatId: "drc",
              senderType: "customer",
              seq: 1000,
              status: "sent",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].some((message) => message.isNew),
    ).toBe(false);

    await useWorkbenchStore.getState().sendAgentTextMessage("本地新客服消息");
    await useWorkbenchStore.getState().pollWorkbench();

    const messages = useWorkbenchStore.getState().messagesByConversationId["conv-001"];

    expect(messages.find((message) => message.optNo === "opt-new-001")).toMatchObject({
      isNew: true,
      role: "agent",
    });
    expect(messages.find((message) => message.id === "remote-new-customer-001"))
      .toMatchObject({
        isNew: true,
        role: "customer",
      });
  });

  it("triggers the title alert only for newly appended customer messages from polling", async () => {
    const baseService = createMockWorkbenchService();
    let pollIndex = 0;

    setWorkbenchService({
      ...baseService,
      async poll() {
        pollIndex += 1;

        if (pollIndex === 1) {
          return {
            activeConversationMessages: [
              createPolledMessage({
                messageId: "remote-title-alert-customer-001",
                senderType: "customer",
                text: "后台客户新消息",
              }),
            ],
            conversationChanges: [],
            nextVersion: 9999,
            seatChanges: [],
          };
        }

        return {
          activeConversationMessages: [
            createPolledMessage({
              messageId: "remote-title-alert-customer-001",
              senderType: "customer",
              text: "后台客户新消息",
            }),
          ],
          conversationChanges: [],
          nextVersion: 10000,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(notifyPulledCustomerMessage).toHaveBeenCalledTimes(1);
  });

  it("triggers the title alert when polling reports a conversation unread increase", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [],
          conversationChanges: [
            createPolledConversation({
              conversationId: "conv-002",
              lastMessage: "非当前会话客户新消息",
              lastMessageTime: Date.now(),
              unreadCount: 1,
            }),
          ],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    expect(
      useWorkbenchStore
        .getState()
        .conversationListsByScope.drc.find((conversation) => conversation.id === "conv-002")
        ?.unread,
    ).toBe(0);

    await useWorkbenchStore.getState().pollWorkbench();

    expect(notifyPulledCustomerMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps the title alert when an unread increase is followed by non-customer active messages", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            createPolledMessage({
              messageId: "remote-title-alert-agent-001",
              senderType: "agent",
              text: "客服消息",
            }),
          ],
          conversationChanges: [
            createPolledConversation({
              conversationId: "conv-002",
              lastMessage: "非当前会话客户新消息",
              lastMessageTime: Date.now(),
              unreadCount: 1,
            }),
          ],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(notifyPulledCustomerMessage).toHaveBeenCalledTimes(1);
  });

  it("does not trigger the title alert for polled system or agent messages", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            createPolledMessage({
              messageId: "remote-title-alert-system-001",
              senderType: "system",
              text: "系统提示",
            }),
            createPolledMessage({
              messageId: "remote-title-alert-agent-001",
              senderType: "agent",
              text: "客服消息",
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    expect(notifyPulledCustomerMessage).not.toHaveBeenCalled();
  });
});

function createPolledMessage({
  messageId,
  senderType,
  text,
}: {
  messageId: string;
  senderType: WorkbenchMessageDto["senderType"];
  text: string;
}) {
  return {
    content: {
      text,
    },
    contentType: senderType === "system" ? "system" : "text",
    conversationId: "conv-001",
    createdAt: Date.now(),
    customerId: "cust-001",
    messageId,
    seatId: "drc",
    senderType,
    seq: 1000,
    status: "sent",
  } satisfies WorkbenchMessageDto;
}

function createPolledConversation({
  conversationId,
  lastMessage,
  lastMessageTime,
  unreadCount,
}: {
  conversationId: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
}) {
  return {
    conversationId,
    custodyMode: "semi",
    seatId: "drc",
    thirdUserId: "seat-third-user-id",
    thirdExternalUserId: `external-${conversationId}`,
    createdAt: 1_778_400_000_000,
    customerId: `customer-${conversationId}`,
    customerName: `客户 ${conversationId}`,
    customerAvatar: "",
    lastMessage,
    lastMessageTime,
    unreadCount,
    mode: "single",
    priority: "medium",
    type: "upsert" as const,
  } satisfies WorkbenchConversationChangeDto;
}

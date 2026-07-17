import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkbenchConversationChangeDto,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { WORKBENCH_MESSAGE_SOURCE } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { notifyPulledCustomerMessage } from "@/pages/chat/lib/new-message-title-alert";
import { seedMessages } from "@/pages/chat/mock-data";
import { useWorkbenchStore } from "@/store/workbench-store";
import { resetWorkbenchStoreTestState } from "./workbench-store-test-utils";

vi.mock("@/pages/chat/api/media-upload-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pages/chat/api/media-upload-service")>();

  return {
    ...actual,
    resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
  };
});

vi.mock("@/pages/chat/lib/new-message-title-alert", () => ({
  notifyPulledCustomerMessage: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

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

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return {
          optNo: "opt-stable-001",
          status: "accepted",
        };
      },
      async poll() {
        const remoteMessage = {
          content: {
            text: "服务端确认文本",
          },
          contentType: "text",
          conversationId: "conv-001",
          createdAt: Date.now(),
          customerId: "cust-001",
          msgid: "remote-stable-001",
          optNo: "opt-stable-001",
          rawMsgtype: "text",
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
      uiMessageKey: "opt-stable-001",
      optNo: "opt-stable-001",
      status: "accepted",
    });
    expect(optimisticMessage?.msgid).toBeUndefined();
    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(1);

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const mergedMessages = state.messagesByConversationId["conv-001"];
    const mergedMatches = mergedMessages.filter(
      (message) =>
        message.optNo === "opt-stable-001" ||
        message.msgid === "remote-stable-001",
    );

    expect(mergedMessages).toHaveLength(initialCount + 1);
    expect(mergedMatches).toHaveLength(1);
    expect(mergedMatches[0]).toMatchObject({
      content: {
        text: "服务端确认文本",
        type: "text",
      },
      uiMessageKey: "999",
      optNo: "opt-stable-001",
      msgid: "remote-stable-001",
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

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return {
          optNo: "opt-failed-001",
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "发送失败文本",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              msgid: "remote-failed-001",
              optNo: "opt-failed-001",
              rawMsgtype: "text",
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
        message.msgid === "remote-failed-001",
    );

    expect(mergedMessages).toHaveLength(initialCount + 1);
    expect(failedMatches).toHaveLength(1);
    expect(failedMatches[0]).toMatchObject({
      uiMessageKey: "999",
      optNo: "opt-failed-001",
      msgid: "remote-failed-001",
      status: "failed",
    });
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("reconciles polled messages by optNo while keeping unmatched optimistic messages", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;

        return {
          optNo: `opt-${sendIndex}`,
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "服务端文本",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              msgid: "remote-text-001",
              optNo: "opt-2",
              rawMsgtype: "text",
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
        status: "accepted",
      },
      {
        content: {
          text: "服务端文本",
          type: "text",
        },
        uiMessageKey: "999",
        optNo: "opt-2",
        msgid: "remote-text-001",
        status: "sent",
      },
      {
        content: {
          type: "image",
        },
        optNo: "opt-3",
        status: "accepted",
      },
    ]);
    expect(latestMessages[0]?.msgid).toBeUndefined();
    expect(latestMessages[2]?.msgid).toBeUndefined();
    expect(
      state.messagesByConversationId["conv-001"].filter((message) => message.optNo === "opt-2"),
    ).toHaveLength(1);
    expect(state.messagePaginationByConversationId["conv-001"]).toMatchObject({
      hasMore: false,
    });
  });

  it("reconciles optimistic own text when the polled echo has seq but no optNo", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return {
          optNo: "opt-shadow-text-001",
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "影子群回写文本",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              msgid: "remote-shadow-text-001",
              rawMsgtype: "text",
              seatId: "drc",
              senderType: "agent",
              seq: 1201,
              source: WORKBENCH_MESSAGE_SOURCE.WORKBENCH,
              status: "sent",
              thirdFromId: "reception-seat-001",
              thirdGroupId: "group-1",
              thirdUserId: "opening-seat-001",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        text: "影子群回写文本",
        type: "text",
      },
    ]);

    expect(
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].some(
        (message) =>
          message.optNo === "opt-shadow-text-001" && message.status === "accepted",
      ),
    ).toBe(true);

    await useWorkbenchStore.getState().pollWorkbench();

    const matched = useWorkbenchStore
      .getState()
      .messagesByConversationId["conv-001"].filter(
        (message) =>
          message.content.type === "text" &&
          message.content.text === "影子群回写文本",
      );

    expect(matched).toHaveLength(1);
    expect(matched[0]).toMatchObject({
      msgid: "remote-shadow-text-001",
      optNo: "opt-shadow-text-001",
      seq: 1201,
      status: "sent",
    });
    expect(useWorkbenchStore.getState().pendingMessages).toHaveLength(0);
  });

  it("reconciles an already-polled text message when the send ACK arrives later", async () => {
    const baseService = createMockWorkbenchService();
    const sendStarted = createDeferred<void>();
    const sendAck = createDeferred<{ optNo: string; status: "accepted" }>();
    const createdAt = Date.now();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendStarted.resolve();
        return sendAck.promise;
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { text: "ACK 竞态文本" },
              contentType: "text",
              createdAt,
              msgid: "remote-ack-race-text",
              rawMsgtype: "text",
              seq: 1251,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
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
    const sendPromise = useWorkbenchStore
      .getState()
      .sendAgentTextMessage("ACK 竞态文本");

    await sendStarted.promise;
    await useWorkbenchStore.getState().pollWorkbench();
    sendAck.resolve({ optNo: "opt-ack-race-text", status: "accepted" });
    await sendPromise;

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];

    expect(messages).toHaveLength(initialCount + 1);
    expect(
      messages.filter(
        (message) =>
          message.msgid === "remote-ack-race-text" ||
          message.optNo === "opt-ack-race-text",
      ),
    ).toEqual([
      expect.objectContaining({
        msgid: "remote-ack-race-text",
        optNo: "opt-ack-race-text",
        seq: 1251,
        status: "sent",
      }),
    ]);
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("reconciles an already-polled image by fallback when the send ACK arrives later", async () => {
    const baseService = createMockWorkbenchService();
    const sendStarted = createDeferred<void>();
    const sendAck = createDeferred<{ optNo: string; status: "accepted" }>();
    const createdAt = Date.now();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendStarted.resolve();
        return sendAck.promise;
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { fileUrl: "https://poll.example.com/rendered/race.png" },
              contentType: "image",
              createdAt,
              msgid: "remote-ack-race-image",
              rawMsgtype: "image",
              seq: 1261,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
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
    const sendPromise = useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "ACK 竞态图片",
        imageUrl: "https://local.example.com/race.png",
        type: "image",
        url: "https://local.example.com/race.png",
      },
    ]);

    await sendStarted.promise;
    await useWorkbenchStore.getState().pollWorkbench();
    sendAck.resolve({ optNo: "opt-ack-race-image", status: "accepted" });
    await sendPromise;

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];

    expect(messages).toHaveLength(initialCount + 1);
    expect(
      messages.filter(
        (message) =>
          message.msgid === "remote-ack-race-image" ||
          message.optNo === "opt-ack-race-image",
      ),
    ).toEqual([
      expect.objectContaining({
        msgid: "remote-ack-race-image",
        optNo: "opt-ack-race-image",
        seq: 1261,
        status: "sent",
      }),
    ]);
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("does not reconcile a same-type message that existed before sending started", async () => {
    const baseService = createMockWorkbenchService();
    const sendAck = createDeferred<{ optNo: string; status: "accepted" }>();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return sendAck.promise;
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      activeMessageSeq: 1241,
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...state.messagesByConversationId["conv-001"],
          {
            author: "客服",
            content: { text: "本次发送文本", type: "text" },
            conversationId: "conv-001",
            isOwnMessage: true,
            msgid: "remote-before-send",
            role: "agent",
            sender: { id: "agent", name: "客服" },
            sentAt: "2026-07-17 13:00:00",
            seq: 1241,
            source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            status: "sent",
            uiMessageKey: "1241",
          },
        ],
      },
    }));
    const initialCount =
      useWorkbenchStore.getState().messagesByConversationId["conv-001"].length;
    const sendPromise = useWorkbenchStore
      .getState()
      .sendAgentTextMessage("本次发送文本");

    sendAck.resolve({ optNo: "opt-after-existing-message", status: "accepted" });
    await sendPromise;

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-001"]).toHaveLength(initialCount + 1);
    expect(
      state.messagesByConversationId["conv-001"].find(
        (message) => message.msgid === "remote-before-send",
      ),
    ).not.toHaveProperty("optNo");
    expect(state.pendingMessages).toEqual([
      expect.objectContaining({ optNo: "opt-after-existing-message" }),
    ]);
  });

  it("does not overwrite a newer conversation preview when a send ACK arrives later", async () => {
    const baseService = createMockWorkbenchService();
    const sendStarted = createDeferred<void>();
    const sendAck = createDeferred<{ optNo: string; status: "accepted" }>();
    const sentAt = Date.now();
    const newerPreviewAt = sentAt + 10_000;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendStarted.resolve();
        return sendAck.promise;
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { text: "较早发送文本" },
              contentType: "text",
              createdAt: sentAt,
              msgid: "remote-ack-preview-agent",
              rawMsgtype: "text",
              seq: 1271,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
          ],
          conversationChanges: [
            createPolledConversation({
              conversationId: "conv-001",
              lastMessage: "更新的会话预览",
              lastMessageTime: newerPreviewAt,
              unreadCount: 0,
            }),
          ],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    const sendPromise = useWorkbenchStore
      .getState()
      .sendAgentTextMessage("较早发送文本");

    await sendStarted.promise;
    await useWorkbenchStore.getState().pollWorkbench();
    sendAck.resolve({ optNo: "opt-ack-preview", status: "accepted" });
    await sendPromise;

    expect(
      useWorkbenchStore
        .getState()
        .conversationListsByScope.drc.find(
          (conversation) => conversation.id === "conv-001",
        ),
    ).toMatchObject({
      preview: "更新的会话预览",
      updatedAtMs: newerPreviewAt,
    });
  });

  it("reconciles supported optimistic message types when optNo is absent", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;
    const createdAt = Date.now();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return {
          optNo: `opt-fingerprint-${sendIndex}`,
          status: "accepted",
        };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { text: "  指纹文本  " },
              contentType: "text",
              createdAt,
              msgid: "remote-fingerprint-text",
              rawMsgtype: "text",
              seq: 1301,
            }),
            createOwnPolledMessage({
              content: { fileUrl: "https://poll.example.com/rendered/image-001.png" },
              contentType: "image",
              createdAt,
              msgid: "remote-fingerprint-image",
              rawMsgtype: "image",
              seq: 1302,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
            createOwnPolledMessage({
              content: { fileUrl: "https://poll.example.com/rendered/emotion-001.gif" },
              contentType: "emotion",
              createdAt,
              msgid: "remote-fingerprint-emotion",
              rawMsgtype: "emotion",
              seq: 1303,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
            createOwnPolledMessage({
              content: {
                fileName: "报价单.pdf",
                fileUrl: "https://cdn-b.example.com/assets/quote.pdf?token=remote",
              },
              contentType: "file",
              createdAt,
              msgid: "remote-fingerprint-file",
              rawMsgtype: "file",
              seq: 1304,
            }),
            createOwnPolledMessage({
              content: { videoUrl: "https://cdn-b.example.com/assets/video.mp4?token=remote" },
              contentType: "video",
              createdAt,
              msgid: "remote-fingerprint-video",
              rawMsgtype: "video",
              seq: 1305,
            }),
            createOwnPolledMessage({
              content: {
                title: "活动链接",
                url: "https://poll.example.com/rendered/activity-link",
              },
              contentType: "h5",
              createdAt,
              msgid: "remote-fingerprint-h5",
              rawMsgtype: "link",
              seq: 1306,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
            createOwnPolledMessage({
              content: {
                appName: "luckincoffee瑞幸咖啡",
                coverImageUrl: "",
                logoUrl: "https://b5.bokr.com.cn/s5/msg/mini-program.png",
                sourceLabel: "小程序",
                title: "  大西瓜生椰冷萃  ",
              },
              contentType: "mini-program",
              createdAt,
              msgid: "remote-fingerprint-weapp",
              rawMsgtype: "weapp",
              seq: 1307,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
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

    await useWorkbenchStore.getState().sendAgentMessageSegments([
      { text: "指纹文本", type: "text" },
      {
        alt: "图片",
        imageUrl: "https://cdn-a.example.com/assets/image.png?token=local",
        type: "image",
        url: "https://cdn-a.example.com/assets/image.png?token=local",
      },
      {
        imageUrl: "https://cdn-a.example.com/assets/emotion.gif?token=local",
        materialCollectionId: "emotion-001",
        type: "emotion",
      },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        type: "file",
        url: "https://cdn-a.example.com/assets/quote.pdf?token=local",
      },
      {
        coverUrl: "https://cdn-a.example.com/assets/cover.jpg",
        materialCollectionId: "",
        msgInfoId: "video-001",
        title: "视频",
        type: "video",
        url: "https://cdn-a.example.com/assets/video.mp4?token=local",
      },
      {
        href: "https://example.com/activity?campaign=1#local",
        title: "活动链接",
        type: "h5",
      },
      {
        appName: "客户助手",
        msgInfoId: "weapp-001",
        title: "大西瓜生椰冷萃",
        type: "weapp",
      },
    ]);

    expect(
      useWorkbenchStore
        .getState()
        .pendingMessages.filter((message) => message.content.type === "image")
        .map((message) => message.reconcileFingerprint),
    ).toEqual([undefined, undefined]);

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];

    expect(messages).toHaveLength(initialCount + 7);
    expect(messages.slice(-7).map((message) => message.optNo)).toEqual([
      "opt-fingerprint-1",
      undefined,
      undefined,
      "opt-fingerprint-4",
      "opt-fingerprint-5",
      undefined,
      "opt-fingerprint-7",
    ]);
    expect(messages.slice(-7).map((message) => message.status)).toEqual(
      Array.from({ length: 7 }, () => "sent"),
    );
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("retires unmatched optimistic messages in same-type server order", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-quote-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { quoteMsgId: "901", text: "服务端引用一" },
              contentType: "quote",
              msgid: "remote-quote-1",
              rawMsgtype: "quote",
              seq: 1401,
            }),
            createOwnPolledMessage({
              content: { quoteMsgId: "902", text: "服务端引用二" },
              contentType: "quote",
              msgid: "remote-quote-2",
              rawMsgtype: "quote",
              seq: 1402,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments(
      [{ text: "本地引用一", type: "text" }],
      { quote: { quoteMsgId: "101" } },
    );
    await useWorkbenchStore.getState().sendAgentMessageSegments(
      [{ text: "本地引用二", type: "text" }],
      { quote: { quoteMsgId: "102" } },
    );

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const quoteMessages = state.messagesByConversationId["conv-001"].filter(
      (message) => message.content.type === "quote" && message.seq != null,
    );

    expect(quoteMessages.map((message) => message.seq)).toEqual([1401, 1402]);
    expect(
      state.messagesByConversationId["conv-001"].some(
        (message) => message.optNo?.startsWith("opt-quote-") && message.seq == null,
      ),
    ).toBe(false);
    expect(state.pendingMessages).toHaveLength(0);
  });

  it("retires a same-type optimistic message when its fingerprint does not match", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return { optNo: "opt-unmatched-image", status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { fileUrl: "https://cdn.example.com/server-image.png" },
              contentType: "image",
              msgid: "remote-unmatched-image",
              rawMsgtype: "image",
              seq: 1451,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "本地图片",
        imageUrl: "https://cdn.example.com/local-image.png",
        type: "image",
        url: "https://cdn.example.com/local-image.png",
      },
    ]);
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(0);
    expect(
      state.messagesByConversationId["conv-001"].some(
        (message) => message.optNo === "opt-unmatched-image",
      ),
    ).toBe(false);
    expect(
      state.messagesByConversationId["conv-001"].find(
        (message) => message.msgid === "remote-unmatched-image",
      ),
    ).toMatchObject({ seq: 1451, status: "sent" });
  });

  it("retires at most one optimistic message for each unlinked server message", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-one-to-one-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { fileUrl: "https://cdn.example.com/server.png" },
              contentType: "image",
              msgid: "remote-one-to-one",
              rawMsgtype: "image",
              seq: 1471,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "本地图片一",
        imageUrl: "https://cdn.example.com/local-1.png",
        type: "image",
        url: "https://cdn.example.com/local-1.png",
      },
      {
        alt: "本地图片二",
        imageUrl: "https://cdn.example.com/local-2.png",
        type: "image",
        url: "https://cdn.example.com/local-2.png",
      },
    ]);
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(1);
    expect(state.pendingMessages[0]).toMatchObject({
      optNo: "opt-one-to-one-2",
      status: "accepted",
    });
    expect(
      state.messagesByConversationId["conv-001"].some(
        (message) => message.optNo === "opt-one-to-one-1",
      ),
    ).toBe(false);
    expect(
      state.messagesByConversationId["conv-001"].find(
        (message) => message.msgid === "remote-one-to-one",
      ),
    ).toMatchObject({ seq: 1471, status: "sent" });
  });

  it("keeps earlier same-type pending messages when only a later fingerprint matches", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-later-match-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: {
                fileName: "文件二.pdf",
                fileUrl: "https://cdn.example.com/file-2.pdf",
              },
              contentType: "file",
              msgid: "remote-later-match",
              rawMsgtype: "file",
              seq: 1481,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        extension: "pdf",
        fileName: "文件一.pdf",
        type: "file",
        url: "https://cdn.example.com/file-1.pdf",
      },
      {
        extension: "pdf",
        fileName: "文件二.pdf",
        type: "file",
        url: "https://cdn.example.com/file-2.pdf",
      },
    ]);
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toEqual([
      expect.objectContaining({
        optNo: "opt-later-match-1",
        status: "accepted",
      }),
    ]);
    expect(
      state.messagesByConversationId["conv-001"].some(
        (message) => message.optNo === "opt-later-match-1",
      ),
    ).toBe(true);
    expect(
      state.messagesByConversationId["conv-001"].find(
        (message) => message.msgid === "remote-later-match",
      ),
    ).toMatchObject({
      optNo: "opt-later-match-2",
      seq: 1481,
      status: "sent",
    });
  });

  it("keeps server sequence order when fallback retirement precedes a fingerprint match", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-mixed-order-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: {
                fileName: "未知文件.pdf",
                fileUrl: "https://cdn.example.com/unknown.pdf",
              },
              contentType: "file",
              msgid: "remote-mixed-order-1",
              rawMsgtype: "file",
              seq: 1491,
            }),
            createOwnPolledMessage({
              content: {
                fileName: "文件二.pdf",
                fileUrl: "https://cdn.example.com/file-2.pdf",
              },
              contentType: "file",
              msgid: "remote-mixed-order-2",
              rawMsgtype: "file",
              seq: 1492,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        extension: "pdf",
        fileName: "文件一.pdf",
        type: "file",
        url: "https://cdn.example.com/file-1.pdf",
      },
      {
        extension: "pdf",
        fileName: "文件二.pdf",
        type: "file",
        url: "https://cdn.example.com/file-2.pdf",
      },
    ]);
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(0);
    expect(
      state.messagesByConversationId["conv-001"]
        .filter((message) => message.msgid?.startsWith("remote-mixed-order-"))
        .map((message) => message.seq),
    ).toEqual([1491, 1492]);
  });

  it("keeps server sequence order when a fingerprint match precedes fallback retirement", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;
    const createdAt = Date.now();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-reverse-order-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: {
                fileName: "文件二.pdf",
                fileUrl: "https://cdn.example.com/file-2.pdf",
              },
              contentType: "file",
              createdAt,
              msgid: "remote-reverse-order-1",
              rawMsgtype: "file",
              seq: 1493,
            }),
            createOwnPolledMessage({
              content: {
                fileName: "未知文件.pdf",
                fileUrl: "https://cdn.example.com/unknown.pdf",
              },
              contentType: "file",
              createdAt,
              msgid: "remote-reverse-order-2",
              rawMsgtype: "file",
              seq: 1494,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        extension: "pdf",
        fileName: "文件一.pdf",
        type: "file",
        url: "https://cdn.example.com/file-1.pdf",
      },
      {
        extension: "pdf",
        fileName: "文件二.pdf",
        type: "file",
        url: "https://cdn.example.com/file-2.pdf",
      },
    ]);
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(0);
    expect(
      state.messagesByConversationId["conv-001"]
        .filter((message) => message.msgid?.startsWith("remote-reverse-order-"))
        .map((message) => message.seq),
    ).toEqual([1493, 1494]);
  });

  it("orders new polled messages across an unresolved optimistic message", async () => {
    const baseService = createMockWorkbenchService();
    let sendIndex = 0;
    const firstSentAt = 1_784_261_400_000;
    const customerSentAt = firstSentAt + 10_000;
    const secondSentAt = firstSentAt + 20_000;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        sendIndex += 1;
        return { optNo: `opt-partial-order-${sendIndex}`, status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { text: "第一条发送" },
              contentType: "text",
              createdAt: firstSentAt,
              msgid: "remote-partial-order-agent",
              rawMsgtype: "text",
              seq: 1511,
            }),
            {
              content: { text: "中间客户消息" },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: customerSentAt,
              customerId: "cust-001",
              msgid: "remote-partial-order-customer",
              rawMsgtype: "text",
              seatId: "drc",
              senderType: "customer",
              seq: 1512,
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
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(firstSentAt);
    await useWorkbenchStore.getState().sendAgentTextMessage("第一条发送");
    nowSpy.mockReturnValue(secondSentAt);
    await useWorkbenchStore.getState().sendAgentTextMessage("第二条发送");
    nowSpy.mockRestore();

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toEqual([
      expect.objectContaining({ optNo: "opt-partial-order-2" }),
    ]);
    expect(
      state.messagesByConversationId["conv-001"]
        .filter(
          (message) =>
            message.msgid?.startsWith("remote-partial-order-") ||
            message.optNo === "opt-partial-order-2",
        )
        .map((message) => message.msgid ?? message.optNo),
    ).toEqual([
      "remote-partial-order-agent",
      "remote-partial-order-customer",
      "opt-partial-order-2",
    ]);
  });

  it("does not retire optimistic messages for another type or source", async () => {
    const baseService = createMockWorkbenchService();
    let pollIndex = 0;

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return { optNo: "opt-guarded-image", status: "accepted" };
      },
      async poll() {
        pollIndex += 1;
        return {
          activeConversationMessages: [
            pollIndex === 1
              ? createOwnPolledMessage({
                  content: { text: "不同类型" },
                  contentType: "text",
                  msgid: "remote-other-type",
                  rawMsgtype: "text",
                  seq: 1501,
                })
              : createOwnPolledMessage({
                  content: { fileUrl: "https://cdn.example.com/guarded.png" },
                  contentType: "image",
                  msgid: "remote-other-source",
                  rawMsgtype: "image",
                  seq: 1502,
                  source: WORKBENCH_MESSAGE_SOURCE.SIDEBAR,
                }),
          ],
          conversationChanges: [],
          nextVersion: 9999 + pollIndex,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "待确认图片",
        imageUrl: "https://cdn.example.com/guarded.png",
        type: "image",
        url: "https://cdn.example.com/guarded.png",
      },
    ]);

    await useWorkbenchStore.getState().pollWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(1);
    expect(
      state.messagesByConversationId["conv-001"].find(
        (message) => message.optNo === "opt-guarded-image",
      ),
    ).toMatchObject({ status: "accepted" });
  });

  it("does not use fingerprint fallback when the server message has another optNo", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return { optNo: "opt-local", status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            {
              ...createOwnPolledMessage({
                content: { text: "相同内容" },
                contentType: "text",
                msgid: "remote-other-opt",
                rawMsgtype: "text",
                seq: 1601,
              }),
              optNo: "opt-remote",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentTextMessage("相同内容");
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    expect(state.pendingMessages).toHaveLength(1);
    expect(
      state.messagesByConversationId["conv-001"].filter(
        (message) => message.optNo === "opt-local" || message.optNo === "opt-remote",
      ),
    ).toHaveLength(2);
  });

  it("does not clear pending messages in another conversation with the same server identity", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            {
              ...createOwnPolledMessage({
                content: { text: "当前会话消息" },
                contentType: "text",
                msgid: "shared-message-id",
                rawMsgtype: "text",
                seq: 1701,
              }),
              optNo: "shared-opt-no",
            },
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      pendingMessages: [
        ...state.pendingMessages,
        {
          author: "客服",
          content: { text: "其他会话消息", type: "text" },
          conversationId: "conv-002",
          isOwnMessage: true,
          msgid: "shared-message-id",
          optNo: "shared-opt-no",
          role: "agent",
          sender: { id: "agent", name: "客服" },
          sentAt: "2026-07-17 10:00:00",
          status: "accepted",
          uiMessageKey: "shared-opt-no",
        },
      ],
    }));

    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().pendingMessages).toEqual([
      expect.objectContaining({ conversationId: "conv-002", optNo: "shared-opt-no" }),
    ]);
  });

  it("does not clear a same-key pending message in another conversation after fallback", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async sendMessage() {
        return { optNo: "shared-fallback-opt", status: "accepted" };
      },
      async poll() {
        return {
          activeConversationMessages: [
            createOwnPolledMessage({
              content: { fileUrl: "https://poll.example.com/rendered/image.png" },
              contentType: "image",
              msgid: "remote-fallback-image",
              rawMsgtype: "image",
              seq: 1711,
              source: WORKBENCH_MESSAGE_SOURCE.DEFAULT,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().sendAgentMessageSegments([
      {
        alt: "本地图片",
        imageUrl: "https://local.example.com/image.png",
        type: "image",
        url: "https://local.example.com/image.png",
      },
    ]);
    useWorkbenchStore.setState((state) => ({
      pendingMessages: [
        ...state.pendingMessages,
        {
          author: "客服",
          content: {
            alt: "其他会话图片",
            imageUrl: "https://other.example.com/image.png",
            type: "image",
          },
          conversationId: "conv-002",
          isOwnMessage: true,
          optNo: "shared-fallback-opt",
          role: "agent",
          sender: { id: "agent", name: "客服" },
          sentAt: "2026-07-17 10:00:00",
          status: "accepted",
          uiMessageKey: "shared-fallback-opt",
        },
      ],
    }));

    await useWorkbenchStore.getState().pollWorkbench();

    expect(useWorkbenchStore.getState().pendingMessages).toEqual([
      expect.objectContaining({
        conversationId: "conv-002",
        optNo: "shared-fallback-opt",
      }),
    ]);
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
              msgid: "remote-extra-001",
              rawMsgtype: "text",
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

    const initialSeedIds = seedMessages["conv-001"].map((_, index) => String(index + 1));

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];

    expect(messages.slice(0, initialSeedIds.length).map((message) => message.uiMessageKey)).toEqual(
      initialSeedIds,
    );
    expect(messages.at(-1)).toMatchObject({
      content: {
        text: "服务端补充消息",
        type: "text",
      },
      uiMessageKey: "999",
      msgid: "remote-extra-001",
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
      async sendMessage() {
        return {
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
              msgid: "remote-new-customer-001",
              rawMsgtype: "text",
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
    expect(messages.find((message) => message.uiMessageKey === "1000"))
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
    msgid: messageId,
    rawMsgtype: senderType === "system" ? "system" : "text",
    seatId: "drc",
    senderType,
    seq: 1000,
    status: "sent",
  } satisfies WorkbenchMessageDto;
}

function createOwnPolledMessage({
  content,
  contentType,
  createdAt = Date.now(),
  msgid,
  rawMsgtype,
  seq,
  source = WORKBENCH_MESSAGE_SOURCE.WORKBENCH,
}: {
  content: Record<string, unknown>;
  contentType: WorkbenchMessageDto["contentType"];
  createdAt?: number;
  msgid: string;
  rawMsgtype: string;
  seq: number;
  source?: number;
}) {
  return {
    content,
    contentType,
    conversationId: "conv-001",
    createdAt,
    customerId: "cust-001",
    msgid,
    rawMsgtype,
    seatId: "drc",
    senderType: "agent",
    seq,
    source,
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
    conversationAIHostingSwitch: false,
    handoffMsgId: "0",
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

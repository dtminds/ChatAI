import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  WorkbenchMessageDto,
  WorkbenchMessageStatusChangeDto,
} from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { seedMessages } from "@/pages/chat/mock-data";
import { useWorkbenchStore } from "@/store/workbench-store";
import { resetWorkbenchStoreTestState } from "./workbench-store-test-utils";

vi.mock("@/pages/chat/api/media-upload-service", () => ({
  resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
}));

describe("workbench message merge state", () => {
  beforeEach(() => {
    resetWorkbenchStoreTestState();
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
        const statusChange = {
          clientMessageId: observedClientMessageId,
          conversationId: "conv-001",
          messageId: "remote-stable-001",
          status: "sent",
        } satisfies WorkbenchMessageStatusChangeDto;

        return {
          activeConversationMessages: [remoteMessage],
          conversationChanges: [],
          messageStatusChanges: [statusChange],
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
          messageStatusChanges: [],
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
          messageStatusChanges: [],
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
});

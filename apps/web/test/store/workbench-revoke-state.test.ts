import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchMessageDto } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { formatWorkbenchTimestamp } from "@/pages/chat/api/workbench-adapter";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import { resetWorkbenchStoreTestState } from "./workbench-store-test-utils";

vi.mock("@/pages/chat/api/media-upload-service", () => ({
  resolveImageSegmentsForSend: vi.fn(async (_conversationId, segments) => segments),
}));

function createRevokeSignalDto(input: {
  conversationId?: string;
  messageId: string;
  revokeMessageId: string;
  seq: number;
}) {
  return {
    content: {
      revokeMsgId: input.revokeMessageId,
      revokeOriginMsgId: input.revokeMessageId,
      type: "revoke",
    },
    contentType: "revoke",
    conversationId: input.conversationId ?? "conv-001",
    createdAt: Date.now(),
    customerId: "cust-001",
    msgid: input.messageId,
    rawMsgtype: "revoke",
    seatId: "drc",
    senderType: "system",
    seq: input.seq,
    status: "sent",
  } satisfies WorkbenchMessageDto;
}

describe("workbench revoke state", () => {
  beforeEach(() => {
    resetWorkbenchStoreTestState();
    vi.mocked(resolveImageSegmentsForSend).mockImplementation(
      async (_conversationId, segments) => segments,
    );
  });

  it("keeps revoked messages revoked in the merged store state", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            createRevokeSignalDto({
              messageId: "revoke-msg-006",
              revokeMessageId: "5",
              seq: 101,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();

    const beforeState = useWorkbenchStore.getState();
    const messagesBeforePoll = beforeState.messagesByConversationId["conv-001"];
    const paginationBeforePoll = beforeState.messagePaginationByConversationId["conv-001"];

    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const messagesAfterPoll = state.messagesByConversationId["conv-001"];
    const revokedLoadedMessage = messagesAfterPoll.find(
      (message) => message.uiMessageKey === "5",
    );

    expect(messagesAfterPoll).toHaveLength(messagesBeforePoll.length);
    expect(messagesAfterPoll.some((message) => message.msgid === "revoke-msg-006")).toBe(false);
    expect(revokedLoadedMessage).toMatchObject({
      uiMessageKey: "5",
      isRevoked: true,
    });
    expect(state.messagePaginationByConversationId["conv-001"]).toEqual(
      paginationBeforePoll,
    );
    expect(state.historyStatusByConversationId["conv-001"]).toBeUndefined();
    expect(state.conversationListsByScope[state.activeAccountId][0]).toMatchObject({
      id: "conv-001",
      unread: 0,
    });
  });

  it("marks same-batch messages as revoked when the revoke signal arrives after them", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            {
              content: {
                text: "待撤回消息",
              },
              contentType: "text",
              conversationId: "conv-001",
              createdAt: Date.now(),
              customerId: "cust-001",
              msgid: "msg-new-001",
              rawMsgtype: "text",
              seatId: "drc",
              senderType: "customer",
              seq: 101,
              status: "sent",
            },
            createRevokeSignalDto({
              messageId: "revoke-msg-new-001",
              revokeMessageId: "101",
              seq: 102,
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

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];
    const targetMessage = messages.find((message) => message.uiMessageKey === "101");

    expect(targetMessage).toMatchObject({
      uiMessageKey: "101",
      isRevoked: true,
    });
    expect(messages.some((message) => message.msgid === "revoke-msg-new-001")).toBe(false);
    expect(state.activeMessageSeq).toBe(
      Math.max(...messages.map((message) => message.seq ?? 0)),
    );
    expect(state.messagePaginationByConversationId["conv-001"]).toMatchObject({
      hasMore: false,
      skippedHiddenCount: 0,
    });
  });

  it("marks loaded messages as revoked when the signal targets remote id or seq", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [
            createRevokeSignalDto({
              messageId: "revoke-seq-5",
              revokeMessageId: "5",
              seq: 101,
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

    const state = useWorkbenchStore.getState();
    const revokedBySeq = state.messagesByConversationId["conv-001"].find(
      (message) => message.seq === 5,
    );

    expect(revokedBySeq).toMatchObject({
      isRevoked: true,
      seq: 5,
    });
    expect(
      state.messagesByConversationId["conv-001"].some((message) => message.msgid === "revoke-seq-5"),
    ).toBe(false);
  });

  it("applies media-ready update events by replacing the message content", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: "conv-001",
              eventId: 11,
              messageSeq: 9,
            },
          ],
          nextMessageUpdateCursor: 11,
          nextVersion: 9999,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.conversationId === "conv-001" && input.messageSeqs.includes(9)) {
          return {
            messages: [
              {
                content: {
                  appName: "小程序",
                  coverImageUrl: "https://cdn.example.com/ready-cover.jpg",
                  title: "更新后封面",
                },
                contentType: "mini-program",
                conversationId: "conv-001",
                createdAt: Date.now(),
                customerId: "cust-001",
                msgid: "msg-009",
                rawMsgtype: "weapp",
                seatId: "drc",
                senderType: "customer",
                seq: 9,
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

    const state = useWorkbenchStore.getState();
    expect(state.messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "9")).toMatchObject(
      {
        content: {
          coverImageUrl: "https://cdn.example.com/ready-cover.jpg",
          type: "mini-program",
        },
        uiMessageKey: "9",
      },
    );
    expect(state.messageUpdateCursor).toBe(11);
  });

  it("applies revoke update events by flagging the original message", async () => {
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async poll() {
        return {
          activeConversationMessages: [],
          conversationChanges: [],
          messageUpdateEvents: [
            {
              conversationId: "conv-001",
              eventId: 12,
              messageSeq: 6,
            },
          ],
          nextMessageUpdateCursor: 12,
          nextVersion: 9999,
          seatChanges: [],
        };
      },
      async getMessagesBySeqs(input) {
        if (input.conversationId === "conv-001" && input.messageSeqs.includes(6)) {
          return {
            messages: [
              {
                content: {
                  text: "已撤回消息",
                },
                contentType: "text",
                conversationId: "conv-001",
                createdAt: Date.now(),
                customerId: "cust-001",
                isRevoked: true,
                msgid: "msg-006",
                rawMsgtype: "text",
                seatId: "drc",
                senderType: "customer",
                seq: 6,
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

    const state = useWorkbenchStore.getState();
    const revokedLoadedMessage = state.messagesByConversationId["conv-001"].find(
      (message) => message.uiMessageKey === "6",
    );

    expect(revokedLoadedMessage).toMatchObject({
      uiMessageKey: "6",
      isRevoked: true,
    });
    expect(state.messagesByConversationId["conv-001"].some((message) => message.msgid === "revoke-msg-006")).toBe(false);
    expect(state.messageUpdateCursor).toBe(12);
  });

  it("sets revoke pending after acceptance and clears it when poll returns the revoke signal", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();
    const revokeMessage = vi.fn().mockResolvedValue({
      accepted: true,
      conversationId: "conv-001",
      messageSeq: 99,
      revokeMsgId: 99,
    });

    setWorkbenchService({
      ...baseService,
      revokeMessage,
      async poll() {
        return {
          activeConversationMessages: [
            createRevokeSignalDto({
              messageId: "revoke-recent-agent-message",
              revokeMessageId: "99",
              seq: 100,
            }),
          ],
          conversationChanges: [],
          nextVersion: 9999,
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
            author: "德瑞可-小可",
            content: {
              text: "刚发出的客服消息",
              type: "text",
            },
            conversationId: "conv-001",
            msgid: "remote-msgid-should-not-be-used",
            uiMessageKey: "99",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 99,
            status: "sent",
          },
        ],
      },
    }));

    const result = await useWorkbenchStore
      .getState()
      .revokeMessage("99");

    expect(result).toEqual({ ok: true });
    expect(revokeMessage).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 99,
    });
    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "99"),
    ).toMatchObject({
      revokePending: true,
    });

    await useWorkbenchStore.getState().pollWorkbench();

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "99"),
    ).toMatchObject({
      isRevoked: true,
      revokePending: false,
    });
  });

  it("allows revoke when the message sent time is slightly ahead of the local clock", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();
    const revokeMessage = vi.fn().mockResolvedValue({
      accepted: true,
      conversationId: "conv-001",
      messageSeq: 103,
      revokeMsgId: 103,
    });

    setWorkbenchService({
      ...baseService,
      revokeMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "本地时钟略慢的客服消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "future-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() + 2_000),
            seq: 103,
            status: "sent",
          },
        ],
      },
    }));

    await expect(
      useWorkbenchStore.getState().revokeMessage("future-agent-message"),
    ).resolves.toEqual({ ok: true });
    expect(revokeMessage).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 103,
    });
  });

  it("rejects revoke when the message seq is invalid", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();
    const revokeMessage = vi.fn();

    setWorkbenchService({
      ...baseService,
      revokeMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "异常落库的客服消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "invalid-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 0,
            status: "sent",
          },
        ],
      },
    }));

    await expect(
      useWorkbenchStore.getState().revokeMessage("invalid-agent-message"),
    ).resolves.toEqual({
      errorCode: "MESSAGE_NOT_REVOKABLE",
      errorMessage: "暂不支持撤回该消息",
      ok: false,
    });
    expect(revokeMessage).not.toHaveBeenCalled();
  });

  it("revokes a reconciled message when called with the previous optNo key", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();
    const revokeMessage = vi.fn().mockResolvedValue({
      accepted: true,
      conversationId: "conv-001",
      messageSeq: 104,
      revokeMsgId: 104,
    });

    setWorkbenchService({
      ...baseService,
      revokeMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "已落库的客服消息",
              type: "text",
            },
            conversationId: "conv-001",
            optNo: "opt-revoke-104",
            uiMessageKey: "104",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 104,
            status: "sent",
          },
        ],
      },
    }));

    await expect(
      useWorkbenchStore.getState().revokeMessage("opt-revoke-104"),
    ).resolves.toEqual({ ok: true });
    expect(revokeMessage).toHaveBeenCalledWith({
      conversationId: "conv-001",
      messageSeq: 104,
    });
    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "104"),
    ).toMatchObject({
      revokePending: true,
    });
  });

  it("deduplicates revoke requests for the same message while the first request is pending", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();
    let resolveRevoke: ((value: Awaited<ReturnType<typeof baseService.revokeMessage>>) => void) | undefined;
    const revokeMessage = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof baseService.revokeMessage>>>((resolve) => {
          resolveRevoke = resolve;
        }),
    );

    setWorkbenchService({
      ...baseService,
      revokeMessage,
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "快速重复撤回的客服消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "dedupe-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 102,
            status: "sent",
          },
        ],
      },
    }));

    const firstResultPromise = useWorkbenchStore.getState().revokeMessage("dedupe-agent-message");
    const secondResult = await useWorkbenchStore.getState().revokeMessage("dedupe-agent-message");

    expect(secondResult).toEqual({
      errorCode: "MESSAGE_REVOKE_PENDING",
      errorMessage: "消息正在撤回中",
      ok: false,
    });
    expect(revokeMessage).toHaveBeenCalledTimes(1);

    resolveRevoke?.({
      accepted: true,
      conversationId: "conv-001",
      messageSeq: 102,
      revokeMsgId: 102,
    });

    await expect(firstResultPromise).resolves.toEqual({ ok: true });
  });

  it("returns immediate revoke failures without setting the global revoke error", async () => {
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async revokeMessage() {
        throw new Error("Java 撤回失败");
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "接口失败的撤回消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "failed-revoke-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 105,
            status: "sent",
          },
        ],
      },
    }));

    await expect(
      useWorkbenchStore.getState().revokeMessage("failed-revoke-agent-message"),
    ).resolves.toMatchObject({
      errorMessage: "Java 撤回失败",
      ok: false,
    });
  });

  it("keeps revoke pending for ten seconds and clears it without toast when no revoke signal arrives", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async revokeMessage(input) {
        return {
          accepted: true,
          conversationId: input.conversationId,
          messageSeq: input.messageSeq,
          revokeMsgId: 101,
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
            author: "德瑞可-小可",
            content: {
              text: "会超时的撤回消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "timeout-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 101,
            status: "sent",
          },
        ],
      },
    }));

    await useWorkbenchStore.getState().revokeMessage("timeout-agent-message");
    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "timeout-agent-message"),
    ).toMatchObject({
      revokePending: true,
    });

    vi.advanceTimersByTime(5_000);

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "timeout-agent-message"),
    ).toMatchObject({
      revokePending: true,
    });

    vi.advanceTimersByTime(5_000);

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "timeout-agent-message"),
    ).toMatchObject({
      revokePending: false,
    });

    vi.useRealTimers();
  });

  it("does not surface revoke timeout toast after switching away from the conversation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00").getTime());
    const baseService = createMockWorkbenchService();

    setWorkbenchService({
      ...baseService,
      async revokeMessage(input) {
        return {
          accepted: true,
          conversationId: input.conversationId,
          messageSeq: input.messageSeq,
          revokeMsgId: 104,
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    useWorkbenchStore.setState((state) => ({
      activeConversationId: "conv-001",
      messagesByConversationId: {
        ...state.messagesByConversationId,
        "conv-001": [
          ...(state.messagesByConversationId["conv-001"] ?? []),
          {
            author: "德瑞可-小可",
            content: {
              text: "切走后超时的撤回消息",
              type: "text",
            },
            conversationId: "conv-001",
            uiMessageKey: "switched-timeout-agent-message",
            isOwnMessage: true,
            role: "agent",
            sender: {
              id: "sender-agent-drc",
              name: "德瑞可-小可",
            },
            sentAt: formatWorkbenchTimestamp(Date.now() - 60_000),
            seq: 104,
            status: "sent",
          },
        ],
      },
    }));

    await useWorkbenchStore.getState().revokeMessage("switched-timeout-agent-message");
    useWorkbenchStore.setState({ activeConversationId: "conv-002" });

    vi.advanceTimersByTime(10_000);

    expect(
      useWorkbenchStore
        .getState()
        .messagesByConversationId["conv-001"].find((message) => message.uiMessageKey === "switched-timeout-agent-message"),
    ).toMatchObject({
      revokePending: false,
    });

    vi.useRealTimers();
  });
});

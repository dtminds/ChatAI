import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchMessageDto } from "@chatai/contracts";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import { resolveImageSegmentsForSend } from "@/pages/chat/api/media-upload-service";
import { useWorkbenchStore } from "@/store/workbench-store";
import { resetChatWorkbenchTestState } from "../pages/chat/workbench-test-utils";

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
    messageId: input.messageId,
    seatId: "drc",
    senderType: "system",
    seq: input.seq,
    status: "read",
  } satisfies WorkbenchMessageDto;
}

describe("workbench revoke state", () => {
  beforeEach(() => {
    resetChatWorkbenchTestState();
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
              revokeMessageId: "msg-006",
              seq: 7,
            }),
          ],
          conversationChanges: [],
          messageStatusChanges: [],
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
      (message) => message.id === "msg-006",
    );

    expect(messagesAfterPoll).toHaveLength(messagesBeforePoll.length);
    expect(messagesAfterPoll.some((message) => message.id === "revoke-msg-006")).toBe(false);
    expect(revokedLoadedMessage).toMatchObject({
      id: "msg-006",
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
              messageId: "msg-new-001",
              seatId: "drc",
              senderType: "customer",
              seq: 7,
              status: "read",
            },
            createRevokeSignalDto({
              messageId: "revoke-msg-new-001",
              revokeMessageId: "msg-new-001",
              seq: 8,
            }),
          ],
          conversationChanges: [],
          messageStatusChanges: [],
          nextVersion: 9999,
          seatChanges: [],
        };
      },
    });

    await useWorkbenchStore.getState().initializeWorkbench();
    await useWorkbenchStore.getState().pollWorkbench();

    const state = useWorkbenchStore.getState();
    const messages = state.messagesByConversationId["conv-001"];
    const targetMessage = messages.find((message) => message.id === "msg-new-001");

    expect(targetMessage).toMatchObject({
      id: "msg-new-001",
      isRevoked: true,
    });
    expect(messages.some((message) => message.id === "revoke-msg-new-001")).toBe(false);
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
              seq: 7,
            }),
          ],
          conversationChanges: [],
          messageStatusChanges: [],
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
      state.messagesByConversationId["conv-001"].some((message) => message.id === "revoke-seq-5"),
    ).toBe(false);
  });
});

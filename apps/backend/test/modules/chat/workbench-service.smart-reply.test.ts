import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import {
  createJavaClient,
  createMessageDto,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService smart reply facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates an automatic smart reply generation task through Java", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.requestAutoGeneralAnswer).mockResolvedValue({ id: "567" });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 1,
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.requestSmartReplyAutoGeneralAnswer("101", {
        conversationId: "88",
        msgId: 321,
      }),
    ).resolves.toEqual({ id: "567" });
    expect(javaClient.requestAutoGeneralAnswer).toHaveBeenCalledWith({
      chatType: 1,
      msgId: 321,
      thirdExternalId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("polls smart replies for group conversations with thirdGroupId", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.listUserHistoryAnswers).mockResolvedValue({
      suggestions: [
        {
          assistantName: "智能助手",
          content: "群聊推荐",
          messageId: "321",
          pollComplete: true,
        },
      ],
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 2,
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.pollSmartReplies("101", {
        conversationId: "88",
        msgIds: [],
      }),
    ).resolves.toEqual({ suggestions: [] });
    await expect(
      service.pollSmartReplies("101", {
        conversationId: "88",
        msgIds: [321],
      }),
    ).resolves.toMatchObject({
      suggestions: [{ messageId: "321" }],
    });
    expect(javaClient.listUserHistoryAnswers).toHaveBeenCalledWith({
      chatType: 2,
      msgIds: [321],
      thirdExternalId: "",
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("requests manual smart reply generation for group conversations with thirdGroupId", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.requestGeneralAnswer).mockResolvedValue({
      suggestion: {
        assistantName: "智能助手",
        content: "群聊推荐",
        messageId: "321",
        status: "thinking",
      },
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 2,
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.requestSmartReplyGeneralAnswer("101", {
        conversationId: "88",
        msgId: 321,
      }),
    ).resolves.toMatchObject({
      suggestion: { messageId: "321" },
    });
    expect(javaClient.requestGeneralAnswer).toHaveBeenCalledWith({
      chatType: 2,
      msgId: 321,
      questionImgs: [],
      thirdExternalId: "",
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects automatic smart reply generation for group conversations", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 2,
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.requestSmartReplyAutoGeneralAnswer("101", {
        conversationId: "88",
        msgId: 321,
      }),
    ).rejects.toMatchObject({
      code: "SMART_REPLY_AUTO_GENERAL_ANSWER_UNSUPPORTED",
      message: "群聊不支持自动生成智能回复",
      statusCode: 400,
    });
    expect(javaClient.requestAutoGeneralAnswer).not.toHaveBeenCalled();
  });

  it("allows smart reply auxiliary actions for group conversations", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.getAiHelperTemplate).mockResolvedValue(11);
    vi.mocked(javaClient.submitAiHelperGenerateAsk).mockResolvedValue({
      generateId: "gen-1",
    });
    vi.mocked(javaClient.streamAiHelperAsk).mockResolvedValue("简短回复");
    vi.mocked(javaClient.sendRecommendAnswer).mockResolvedValue(undefined);
    vi.mocked(javaClient.listAttachments).mockResolvedValue({ attachments: [] });
    vi.mocked(javaClient.checkTextModerationPlus).mockResolvedValue({ result: null });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 2,
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.requestSmartReplyMakeShorter("101", {
        content: "请简短一点",
        conversationId: "88",
      }),
    ).resolves.toEqual({ content: "简短回复" });
    await expect(
      service.sendSmartReplyAnswer("101", {
        conversationId: "88",
        optNos: ["opt-1"],
        recordId: "record-1",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.listSmartReplyAttachments("101", {
        conversationId: "88",
        ids: ["1"],
      }),
    ).resolves.toEqual({ attachments: [] });
    await expect(
      service.checkSmartReplyTextModeration("101", {
        content: "待检测内容",
        conversationId: "88",
      }),
    ).resolves.toEqual({ result: null });
    await expect(
      service.listKnowledgePage("101", {
        conversationId: "88",
      }),
    ).resolves.toEqual({ list: [], total: 0 });
    await expect(
      service.getKnowledgeConfig("101", {
        conversationId: "88",
      }),
    ).resolves.toEqual({});
    await expect(
      service.listKnowledgeDocPage("101", {
        conversationId: "88",
        knowledgeId: "1",
      }),
    ).resolves.toEqual({ list: [], total: 0 });
    await expect(
      service.addKnowledgeFaq("101", {
        conversationId: "88",
        docId: "1",
        list: [
          {
            answer: "答案",
            attachIds: "",
            question: "问题",
            similarQuestion: "",
          },
        ],
      }),
    ).resolves.toEqual({ success: true });

    expect(javaClient.getAiHelperTemplate).toHaveBeenCalled();
    expect(javaClient.sendRecommendAnswer).toHaveBeenCalledWith({
      optNos: ["opt-1"],
      recordId: "record-1",
      uid: 9001,
    });
    expect(javaClient.listAttachments).toHaveBeenCalled();
    expect(javaClient.checkTextModerationPlus).toHaveBeenCalled();
    expect(javaClient.listKnowledgePage).toHaveBeenCalled();
    expect(javaClient.getKnowledgeConfig).toHaveBeenCalled();
    expect(javaClient.listKnowledgeDocPage).toHaveBeenCalled();
    expect(javaClient.addKnowledgeFaq).toHaveBeenCalled();
  });

  it("loads smart reply reference messages after checking conversation access", async () => {
    const javaClient = createJavaClient();
    const listSmartReplyReferenceMessages = vi.fn().mockResolvedValue({
      messages: [createMessageDto({ senderType: "agent", seq: 3050 })],
    });
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          chatType: 1,
          id: "144",
          messageSourceThirdUserId: "seat-user-001",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          seatUnreadCount: 0,
          thirdExternalUserId: "current-customer",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
        listSmartReplyReferenceMessages,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getSmartReplyReferenceMessages("101", {
        conversationId: "144",
        messageSeqs: [3050, 3051],
      }),
    ).resolves.toMatchObject({ messages: [{ seq: 3050 }] });
    expect(listSmartReplyReferenceMessages).toHaveBeenCalledWith({
      conversation: expect.objectContaining({ id: "144", seatId: "12" }),
      messageSeqs: [3050, 3051],
      platform: 5,
      uid: 9001,
    });
  });

  it("forwards smart heartbeat for an operable single chat conversation", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          seatUnreadCount: 0,
          thirdExternalUserId: "external-customer-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendSmartHeartbeat("101", { conversationId: "88" }),
    ).resolves.toEqual({ ok: true });

    expect(javaClient.sendSmartHeartbeat).toHaveBeenCalledWith({
      platform: 5,
      thirdExternalUserId: "external-customer-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects smart heartbeat for group conversations", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          seatUnreadCount: 0,
          thirdExternalUserId: "external-customer-001",
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendSmartHeartbeat("101", { conversationId: "88" }),
    ).rejects.toMatchObject({
      code: "SMART_HEARTBEAT_GROUP_UNSUPPORTED",
      statusCode: 400,
    });
    expect(javaClient.sendSmartHeartbeat).not.toHaveBeenCalled();
  });

  it("rejects smart heartbeat when customer external id is missing", async () => {
    const javaClient = createJavaClient();
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          seatUnreadCount: 0,
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendSmartHeartbeat("101", { conversationId: "88" }),
    ).rejects.toMatchObject({
      code: "SMART_HEARTBEAT_CUSTOMER_MISSING",
      statusCode: 400,
    });
    expect(javaClient.sendSmartHeartbeat).not.toHaveBeenCalled();
  });
});

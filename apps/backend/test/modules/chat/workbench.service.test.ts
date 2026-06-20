import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  QUICK_REPLY_SCOPE_TYPE,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import {
  JAVA_INTERNAL_API_USER_MESSAGE,
  WORKBENCH_INTERNAL_API_FAILED_CODE,
} from "../../../src/modules/chat/workbench-java-client.js";
import type { WorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";
import { MysqlWorkbenchService } from "../../../src/modules/chat/workbench.service.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import { BadGatewayError } from "../../../src/shared/errors.js";

describe("MysqlWorkbenchService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists my customers with visible seat filters", async () => {
    const javaClient = createJavaClient();
    const listCustomers = vi.fn().mockResolvedValue({
      hasMore: false,
      items: [],
      total: 0,
    });
    const service = new MysqlWorkbenchService(
      {
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          subUserId: "101",
        }),
        listCustomers,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getCustomers("101", { scope: "mine", seatIds: ["12", "13"] }),
    ).resolves.toEqual({ hasMore: false, items: [], total: 0 });
    expect(listCustomers).toHaveBeenCalledWith({
      scope: "mine",
      seatIds: ["12", "13"],
      subUserId: "101",
    });
  });

  it("lists all customers without seat filters", async () => {
    const javaClient = createJavaClient();
    const listCustomers = vi.fn().mockResolvedValue({
      hasMore: false,
      items: [],
      total: 0,
    });
    const service = new MysqlWorkbenchService(
      {
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          platform: 5,
          subUserId: "101",
          uid: 9001,
        }),
        listCustomers,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getCustomers("101", { scope: "all", seatIds: ["12"] }),
    ).resolves.toEqual({ hasMore: false, items: [], total: 0 });
    expect(listCustomers).toHaveBeenCalledWith({
      cursor: undefined,
      keyword: undefined,
      limit: undefined,
      platform: 5,
      scope: "all",
      uid: 9001,
    });
  });

  it("loads tenant-level customer recent conversation", async () => {
    const javaClient = createJavaClient();
    const getCustomerLastConversation = vi.fn().mockResolvedValue({
      conversationId: "701",
      lastMessageTime: 1_779_600_000_000,
      seatAvatar: "",
      seatId: "12",
      seatName: "销售一号",
    });
    const service = new MysqlWorkbenchService(
      {
        getCustomerLastConversation,
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          platform: 5,
          subUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getCustomerLastConversation("101", "external-b"),
    ).resolves.toEqual({
      lastConversation: {
        conversationId: "701",
        lastMessageTime: 1_779_600_000_000,
        seatAvatar: "",
        seatId: "12",
        seatName: "销售一号",
      },
    });
    expect(getCustomerLastConversation).toHaveBeenCalledWith({
      platform: 5,
      thirdExternalUserId: "external-b",
      uid: 9001,
    });
  });

  it("loads tenant-level customer relation conversation timestamps", async () => {
    const javaClient = createJavaClient();
    const listCustomerRelationConversations = vi.fn().mockResolvedValue([
      {
        lastMessageTime: 1_779_600_000_000,
        thirdUserId: "seat-user-12",
      },
    ]);
    const service = new MysqlWorkbenchService(
      {
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          platform: 5,
          subUserId: "101",
          uid: 9001,
        }),
        listCustomerRelationConversations,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getCustomerRelationConversations("101", "external-b", [
        "seat-user-12",
      ]),
    ).resolves.toEqual({
      items: [
        {
          lastMessageTime: 1_779_600_000_000,
          thirdUserId: "seat-user-12",
        },
      ],
    });
    expect(listCustomerRelationConversations).toHaveBeenCalledWith({
      platform: 5,
      thirdExternalUserId: "external-b",
      thirdUserIds: ["seat-user-12"],
      uid: 9001,
    });
  });

  it("delegates get-or-create conversation decisions to Java before hydrating", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.createConversation).mockResolvedValue({
      conversationId: "89",
    });
    const getHydratedConversation = vi.fn().mockResolvedValue({
      conversationId: "89",
      customerAvatar: "",
      customerId: "external-001",
      customerName: "微信客户",
      lastMessage: "",
      mode: "single",
      priority: "medium",
      seatId: "12",
      unreadCount: 0,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getHydratedConversation,
        getSeatOperateScope: vi.fn().mockResolvedValue({
          platform: 5,
          seatId: "12",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          subUserId: "101",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getOrCreateConversation("101", {
        chatType: 1,
        seatId: "12",
        thirdExternalUserId: "external-001",
      }),
    ).resolves.toMatchObject({
      conversationId: "89",
    });

    expect(javaClient.createConversation).toHaveBeenCalledWith({
      chatType: 1,
      platform: 5,
      thirdExternalUserId: "external-001",
      thirdGroupId: undefined,
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(getHydratedConversation).toHaveBeenCalledWith(
      9001,
      5,
      "seat-user-001",
      "89",
    );
  });

  it("loads display messages from hidden conversations", async () => {
    const javaClient = createJavaClient();
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      uid: 9001,
    });
    const listMessages = vi.fn().mockResolvedValue({
      filteredCount: 0,
      hasMore: false,
      messages: [],
      scannedCount: 0,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
        listMessages,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.getMessages("101", "88", { limit: 10 });

    expect(getConversationLookup).toHaveBeenCalledWith("88");
    expect(listMessages).toHaveBeenCalledWith("88", {
      beforeSeq: undefined,
      includeHiddenConversation: true,
      limit: 10,
    });
  });

  it("loads smart replies for the last five customer messages on latest single-chat pages", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.listUserHistoryAnswers).mockResolvedValue({
      suggestions: [
        {
          assistantName: "智能助手",
          content: "推荐回复 7",
          messageId: "7",
          pollComplete: true,
        },
      ],
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [
            createMessageDto({ senderType: "customer", seq: 1 }),
            createMessageDto({ senderType: "agent", seq: 2 }),
            createMessageDto({ senderType: "customer", seq: 3 }),
            createMessageDto({ senderType: "customer", seq: 4 }),
            createMessageDto({ senderType: "customer", seq: 5 }),
            createMessageDto({ senderType: "customer", seq: 6 }),
            createMessageDto({ senderType: "customer", seq: 7 }),
          ],
          scannedCount: 7,
          smartReplyEnabled: true,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.getMessages("101", "88", { limit: 10 })).resolves.toMatchObject({
      smartReplies: [
        {
          content: "推荐回复 7",
          messageId: "7",
        },
      ],
    });
    expect(javaClient.listUserHistoryAnswers).toHaveBeenCalledWith({
      chatType: 1,
      msgIds: [3, 4, 5, 6, 7],
      thirdExternalId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("loads page smart replies only for raw message types that can trigger recommendations", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [
            createMessageDto({ rawMsgtype: "text", senderType: "customer", seq: 1 }),
            createMessageDto({ rawMsgtype: "emotion", senderType: "customer", seq: 2 }),
            createMessageDto({ rawMsgtype: "quote", senderType: "customer", seq: 3 }),
            createMessageDto({ rawMsgtype: "file", senderType: "customer", seq: 4 }),
            createMessageDto({ rawMsgtype: "image", senderType: "customer", seq: 5 }),
            createMessageDto({ rawMsgtype: "voice", senderType: "customer", seq: 6 }),
          ],
          scannedCount: 6,
          smartReplyEnabled: true,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.getMessages("101", "88", { limit: 10 });

    expect(javaClient.listUserHistoryAnswers).toHaveBeenCalledWith({
      chatType: 1,
      msgIds: [1, 5, 6],
      thirdExternalId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("treats missing page smart reply raw message types as unsupported", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [
            {
              ...createMessageDto({ senderType: "customer", seq: 1 }),
              rawMsgtype: undefined as unknown as string,
            },
            createMessageDto({ rawMsgtype: " text ", senderType: "customer", seq: 2 }),
          ],
          scannedCount: 2,
          smartReplyEnabled: true,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.getMessages("101", "88", { limit: 10 });

    expect(javaClient.listUserHistoryAnswers).toHaveBeenCalledWith({
      chatType: 1,
      msgIds: [2],
      thirdExternalId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("does not load smart replies for historical pages", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [createMessageDto({ senderType: "customer", seq: 7 })],
          scannedCount: 1,
          smartReplyEnabled: true,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.getMessages("101", "88", { beforeSeq: 8, limit: 10 });

    expect(javaClient.listUserHistoryAnswers).not.toHaveBeenCalled();
  });

  it("does not load smart replies when the seat has no assistant", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [createMessageDto({ senderType: "customer", seq: 7 })],
          scannedCount: 1,
          smartReplyEnabled: false,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.getMessages("101", "88", { limit: 10 })).resolves.toMatchObject({
      smartReplyEnabled: false,
    });

    expect(javaClient.listUserHistoryAnswers).not.toHaveBeenCalled();
  });

  it("loads chat record detail after checking conversation access", async () => {
    const javaClient = createJavaClient();
    const canAccessSeat = vi.fn().mockResolvedValue(true);
    const getChatRecordDetail = vi.fn().mockResolvedValue({
      messageId: "830",
      messages: [],
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat,
        getChatRecordDetail,
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getChatRecordDetail("101", "88", 830),
    ).resolves.toEqual({
      messageId: "830",
      messages: [],
    });
    expect(canAccessSeat).toHaveBeenCalledWith("101", "12");
    expect(getChatRecordDetail).toHaveBeenCalledWith(
      9001,
      5,
      "88",
      830,
    );
  });

  it("keeps the latest message page available when history smart reply lookup fails", async () => {
    const javaClient = createJavaClient();
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(javaClient.listUserHistoryAnswers).mockRejectedValue(
      new Error("java unavailable"),
    );
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [createMessageDto({ senderType: "customer", seq: 7 })],
          scannedCount: 1,
          smartReplyEnabled: true,
          smartReplyScope: {
            chatType: 1,
            thirdExternalId: "external-001",
            thirdUserId: "seat-user-001",
            uid: 9001,
          },
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
      logger,
    );

    await expect(service.getMessages("101", "88", { limit: 10 })).resolves.toMatchObject({
      messages: [
        {
          seq: 7,
        },
      ],
      smartReplyEnabled: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      {
        conversationId: "88",
        error: expect.any(Error),
      },
      "Failed to load smart replies for message page",
    );
  });

  it("creates an automatic smart reply generation task through Java", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.requestAutoGeneralAnswer).mockResolvedValue({ id: "567" });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

  it("rejects automatic smart reply generation for group conversations", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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
      code: "SMART_REPLY_SCOPE_INVALID",
      statusCode: 400,
    });
    expect(javaClient.requestAutoGeneralAnswer).not.toHaveBeenCalled();
  });

  it("signs sidebar iframe params from hidden conversations", async () => {
    const javaClient = createJavaClient();
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      thirdExternalUserId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    const getEmbedUserRelationTuseSecrets = vi.fn().mockResolvedValue({
      appId: "mid-001",
      ivParameter: "1234567890abcdef",
      secret: "abcdef1234567890",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
        getEmbedUserRelationTuseSecrets,
        getSubUser: vi.fn().mockResolvedValue({
          displayName: "客服一号",
          subUserId: "101",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getSidebarIframeParams("101", {
        conversationId: "88",
        seatId: "12",
      }),
    ).resolves.toMatchObject({
      mid: "mid-001",
    });

    expect(getConversationLookup).toHaveBeenCalledWith("88");
  });

  it("rejects invalid conversation list cursors before querying conversations", async () => {
    const javaClient = createJavaClient();
    const listConversations = vi.fn();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        listConversations,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getConversations("101", "12", {
        cursor: "not-a-valid-cursor",
        limit: 30,
        mode: "single",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONVERSATION_CURSOR",
      statusCode: 400,
    });
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("takes over an accessible seat through Java and persists host sub-user locally", async () => {
    const javaClient = createJavaClient();
    const getSeat = vi.fn();
    const updateSeatHostSubUser = vi.fn().mockResolvedValue(undefined);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeat,
        getSeatOperateScope: vi.fn().mockResolvedValue({
          platform: 5,
          seatId: "12",
          thirdUserId: "zhangsan",
          uid: 9001,
        }),
        updateSeatHostSubUser,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.takeOverSeat("101", "12")).resolves.toEqual({
      hostSubUserId: "101",
      seatId: "12",
    });
    expect(javaClient.takeOverSeat).toHaveBeenCalledWith({
      platform: 5,
      subId: 101,
      thirdUserId: "zhangsan",
      uid: 9001,
    });
    expect(updateSeatHostSubUser).toHaveBeenCalledWith({
      platform: 5,
      seatId: "12",
      subUserId: "101",
      uid: 9001,
    });
    expect(getSeat).not.toHaveBeenCalled();
  });

  it("rejects takeover when the sub-user cannot access the seat", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(false),
        getSeatOperateScope: vi.fn(),
        updateSeatHostSubUser: vi.fn(),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.takeOverSeat("101", "12")).rejects.toMatchObject({
      code: "SEAT_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.takeOverSeat).not.toHaveBeenCalled();
  });

  it("rejects takeover when the seat id cannot be found", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatOperateScope: vi.fn().mockResolvedValue(undefined),
        updateSeatHostSubUser: vi.fn(),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.takeOverSeat("101", "12")).rejects.toMatchObject({
      code: "SEAT_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.takeOverSeat).not.toHaveBeenCalled();
  });

  it.each(["sub-user-001", "0123", " 123"])(
    "rejects takeover when the sub-user id is not a strict MySQL id: %s",
    async (subUserId) => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        getSeatOperateScope: vi.fn().mockResolvedValue({
          platform: 5,
          seatId: "12",
          thirdUserId: "zhangsan",
          uid: 9001,
        }),
        updateSeatHostSubUser: vi.fn(),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.takeOverSeat(subUserId, "12")).rejects.toMatchObject({
      code: "SUB_USER_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.takeOverSeat).not.toHaveBeenCalled();
    },
  );

  it("rejects mark-read when the conversation seat is not taken over by the current sub-user", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.markConversationRead("101", "88")).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.markConversationRead).not.toHaveBeenCalled();
  });

  it("passes conversation tenant scope to Java when marking a taken-over conversation read", async () => {
    const javaClient = createJavaClient();
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      uid: 9001,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    const result = await service.markConversationRead("101", "88");

    expect(javaClient.markConversationRead).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(getConversationLookup).toHaveBeenCalledWith("88");
    expect(result).toEqual({
      conversationId: "88",
      seatId: "12",
      unreadCount: 0,
    });
  });

  it("persists confirmed voice playback URL by merging message content with audit id updateId", async () => {
    const javaClient = createJavaClient();
    const getMessageRawContent = vi.fn().mockResolvedValue(JSON.stringify({
      downloadStatus: "finished",
      fileSerialNo: "serial-001",
      fileUrl: "s5/msg/20260525/272/voice.amr",
      optSerNo: "opt-001",
      transFileUrl: "",
      transVoiceText: "",
    }));
    const playableVoiceExists = vi.fn().mockResolvedValue(true);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent,
      } as unknown as WorkbenchRepository,
      javaClient,
      undefined,
      playableVoiceExists,
    );

    await service.confirmVoicePlaybackReady("101", {
      conversationId: "88",
      messageSeq: 538,
      playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    });

    expect(getMessageRawContent).toHaveBeenCalledWith({
      auditId: 538,
      platform: 5,
      thirdExternalUserId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(playableVoiceExists).toHaveBeenCalledWith(
      "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
    );
    expect(javaClient.updateMessageContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        downloadStatus: "finished",
        fileSerialNo: "serial-001",
        fileUrl: "s5/msg/20260525/272/voice.amr",
        optSerNo: "opt-001",
        transFileUrl: "s5/playable-voice/20260525/272/voice.wav",
        transVoiceText: "",
      }),
      platform: 5,
      uid: 9001,
      updateId: 538,
    });
  });

  it("returns existing voice transcription without calling Java", async () => {
    const javaClient = createJavaClient();
    const getMessageRawContent = vi.fn().mockResolvedValue(JSON.stringify({
      fileUrl: "s5/msg/20260525/272/voice.amr",
      transFileUrl: "",
      transVoiceText: "已经识别过的文本",
    }));
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.transcribeVoiceMessage("101", {
        conversationId: "88",
        messageSeq: 538,
      }),
    ).resolves.toEqual({
      messageSeq: 538,
      transVoiceText: "已经识别过的文本",
      transVoiceTextPersisted: true,
    });
    expect(javaClient.recognizeSentence).not.toHaveBeenCalled();
  });

  it("recognizes the voice URL, persists message content, and returns persisted text", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.recognizeSentence).mockResolvedValue("新识别出来的文本");
    const getMessageRawContent = vi.fn().mockResolvedValue(JSON.stringify({
      fileUrl: "s5/msg/20260525/272/voice.amr",
      transFileUrl: "",
      transVoiceText: "",
    }));
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.transcribeVoiceMessage("101", {
        conversationId: "88",
        messageSeq: 538,
      }),
    ).resolves.toEqual({
      messageSeq: 538,
      transVoiceText: "新识别出来的文本",
      transVoiceTextPersisted: true,
    });

    expect(getMessageRawContent).toHaveBeenCalledWith({
      auditId: 538,
      platform: 5,
      thirdExternalUserId: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(javaClient.recognizeSentence).toHaveBeenCalledWith({
      voiceUrl: "https://b5.bokr.com.cn/s5/msg/20260525/272/voice.amr",
    });
    expect(javaClient.updateMessageContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        fileUrl: "s5/msg/20260525/272/voice.amr",
        transFileUrl: "",
        transVoiceText: "新识别出来的文本",
      }),
      platform: 5,
      uid: 9001,
      updateId: 538,
    });
  });

  it("rejects empty Java voice transcription results without persisting content", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.recognizeSentence).mockResolvedValue(
      null as unknown as string,
    );
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/voice.amr",
          transFileUrl: "",
          transVoiceText: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.transcribeVoiceMessage("101", {
        conversationId: "88",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "VOICE_TRANSCRIPTION_EMPTY",
      statusCode: 502,
    });
    expect(javaClient.updateMessageContent).not.toHaveBeenCalled();
  });

  it("rejects voice transcription when the target message is not a voice message", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          text: "普通文本",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.transcribeVoiceMessage("101", {
        conversationId: "88",
        messageSeq: 538,
      }),
    ).rejects.toMatchObject({
      code: "VOICE_TRANSCRIPTION_UNSUPPORTED",
      statusCode: 400,
    });
    expect(javaClient.recognizeSentence).not.toHaveBeenCalled();
  });

  it("rejects confirmed voice playback URLs outside playable voice storage", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/voice.amr",
          transFileUrl: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
      undefined,
      vi.fn().mockResolvedValue(true),
    );

    await expect(
      service.confirmVoicePlaybackReady("101", {
        conversationId: "88",
        messageSeq: 538,
        playbackUrl: "https://evil.example.com/s5/playable-voice/voice.wav",
      }),
    ).rejects.toMatchObject({
      code: "MEDIA_URL_NOT_ALLOWED",
      statusCode: 400,
    });
    expect(javaClient.updateMessageContent).not.toHaveBeenCalled();
  });

  it("accepts confirmed voice playback URLs from the configured media host", async () => {
    vi.stubEnv("PLAYABLE_MEDIA_HOST", "media.example.com:8443");
    const javaClient = createJavaClient();
    const playableVoiceExists = vi.fn().mockResolvedValue(true);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/voice.amr",
          transFileUrl: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
      undefined,
      playableVoiceExists,
    );

    await service.confirmVoicePlaybackReady("101", {
      conversationId: "88",
      messageSeq: 538,
      playbackUrl: "https://media.example.com:8443/s5/playable-voice/20260525/272/voice.wav",
    });

    expect(javaClient.updateMessageContent).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("\"transFileUrl\":\"s5/playable-voice/20260525/272/voice.wav\""),
    }));
  });

  it("rejects confirmed voice playback URLs that do not belong to the current message file", async () => {
    const javaClient = createJavaClient();
    const playableVoiceExists = vi.fn().mockResolvedValue(true);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/current-message.amr",
          transFileUrl: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
      undefined,
      playableVoiceExists,
    );

    await expect(
      service.confirmVoicePlaybackReady("101", {
        conversationId: "88",
        messageSeq: 538,
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/other-message.wav",
      }),
    ).rejects.toMatchObject({
      code: "PLAYABLE_VOICE_URL_MISMATCH",
      statusCode: 400,
    });
    expect(playableVoiceExists).not.toHaveBeenCalled();
    expect(javaClient.updateMessageContent).not.toHaveBeenCalled();
  });

  it("rejects confirmed voice playback when the converted WAV does not exist", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/missing.amr",
          transFileUrl: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
      undefined,
      vi.fn().mockResolvedValue(false),
    );

    await expect(
      service.confirmVoicePlaybackReady("101", {
        conversationId: "88",
        messageSeq: 538,
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/missing.wav",
      }),
    ).rejects.toMatchObject({
      code: "PLAYABLE_VOICE_NOT_READY",
      statusCode: 404,
    });
    expect(javaClient.updateMessageContent).not.toHaveBeenCalled();
  });

  it("reports converted WAV check failures as bad gateway errors", async () => {
    const originalFetch = globalThis.fetch;
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageRawContent: vi.fn().mockResolvedValue(JSON.stringify({
          fileUrl: "s5/msg/20260525/272/voice.amr",
          transFileUrl: "",
        })),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(
      service.confirmVoicePlaybackReady("101", {
        conversationId: "88",
        messageSeq: 538,
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
      }),
    ).rejects.toBeInstanceOf(BadGatewayError);
    await expect(
      service.confirmVoicePlaybackReady("101", {
        conversationId: "88",
        messageSeq: 538,
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/20260525/272/voice.wav",
      }),
    ).rejects.toMatchObject({
      code: "PLAYABLE_VOICE_CHECK_FAILED",
      statusCode: 502,
    });
    expect(javaClient.updateMessageContent).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", originalFetch);
  });

  it("rejects mark-unread when the conversation seat is not taken over by the current sub-user", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.markConversationUnread("101", "88")).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.markConversationUnread).not.toHaveBeenCalled();
  });

  it("marks a taken-over conversation unread without calculating seat unread", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    const result = await service.markConversationUnread("101", "88");

    expect(javaClient.markConversationUnread).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(result).toEqual({
      conversationId: "88",
      seatId: "12",
      unreadCount: 1,
    });
  });

  it("rejects pin when the conversation seat is not taken over by the current sub-user", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.pinConversation("101", "88")).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.pinConversation).not.toHaveBeenCalled();
  });

  it("pins a taken-over conversation through Java", async () => {
    const javaClient = createJavaClient();
    const updateConversationPinned = vi.fn().mockResolvedValue(undefined);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        updateConversationPinned,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.pinConversation("101", "88")).resolves.toEqual({
      conversationId: "88",
      isPinned: true,
      seatId: "12",
    });
    expect(javaClient.pinConversation).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(updateConversationPinned).toHaveBeenCalledWith({
      conversationId: "88",
      isPinned: true,
      platform: 5,
      uid: 9001,
    });
  });

  it("unpins a taken-over conversation through Java", async () => {
    const javaClient = createJavaClient();
    const updateConversationPinned = vi.fn().mockResolvedValue(undefined);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        updateConversationPinned,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.unpinConversation("101", "88")).resolves.toEqual({
      conversationId: "88",
      isPinned: false,
      seatId: "12",
    });
    expect(javaClient.unpinConversation).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(updateConversationPinned).toHaveBeenCalledWith({
      conversationId: "88",
      isPinned: false,
      platform: 5,
      uid: 9001,
    });
  });

  it("rejects delete when the conversation seat is not taken over by the current sub-user", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.deleteConversation("101", "88")).rejects.toMatchObject({
      code: "SEAT_NOT_TAKEN_OVER",
      statusCode: 403,
    });
    expect(javaClient.deleteConversation).not.toHaveBeenCalled();
  });

  it("deletes a taken-over conversation through Java and hides it locally", async () => {
    const javaClient = createJavaClient();
    const hideConversation = vi.fn().mockResolvedValue(undefined);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        hideConversation,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.deleteConversation("101", "88")).resolves.toEqual({
      conversationId: "88",
      seatId: "12",
    });
    expect(javaClient.deleteConversation).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(hideConversation).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
  });

  it("gets upload credentials for an accessible conversation tenant", async () => {
    const javaClient = createJavaClient();
    const uploadCredential = {
      allowPerfixs: ["chat-images/"],
      bucket: "examplebucket-1250000000",
      credentials: {
        sessionToken: "session-token",
        tmpSecretId: "tmp-secret-id",
        tmpSecretKey: "tmp-secret-key",
        token: "token",
      },
      expiration: "2026-05-13T12:00:00Z",
      expiredTime: 1778673600,
      region: "ap-guangzhou",
      requestId: "request-001",
      startTime: 1778670000,
    };
    vi.mocked(javaClient.getUploadCredential).mockResolvedValue(uploadCredential);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.getUploadCredential("101", "88")).resolves.toEqual(uploadCredential);
    expect(javaClient.getUploadCredential).toHaveBeenCalledWith({
      uid: 9001,
    });
  });

  it("logs upload credential request context without credential secrets", async () => {
    const javaClient = createJavaClient();
    const logger = createLoggerMock();
    vi.mocked(javaClient.getUploadCredential).mockResolvedValue({
      allowPerfixs: ["chat-images/"],
      bucket: "examplebucket-1250000000",
      credentials: {
        sessionToken: "session-token-secret",
        tmpSecretId: "tmp-secret-id-secret",
        tmpSecretKey: "tmp-secret-key-secret",
        token: "token-secret",
      },
      expiration: "2026-05-13T12:00:00Z",
      expiredTime: 1778673600,
      region: "ap-guangzhou",
      requestId: "request-001",
      startTime: 1778670000,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
      logger,
    );

    await service.getUploadCredential("101", "88");

    expect(logger.info).toHaveBeenCalledWith(
      {
        bucket: "examplebucket-1250000000",
        conversationId: "88",
        javaRequestId: "request-001",
        operation: "get-upload-credential",
        region: "ap-guangzhou",
        seatId: "12",
        subUserId: "101",
        uid: 9001,
      },
      "工作台上传凭证获取成功",
    );
    const loggedPayload = JSON.stringify(logger.info.mock.calls);
    expect(loggedPayload).not.toContain("session-token-secret");
    expect(loggedPayload).not.toContain("tmp-secret-key-secret");
    expect(loggedPayload).not.toContain("token-secret");
  });

  it("does not leak Java errorMsg when upload credential request fails", async () => {
    const javaClient = createJavaClient();
    const logger = createLoggerMock();
    vi.mocked(javaClient.getUploadCredential).mockRejectedValue(
      new BadGatewayError(
        WORKBENCH_INTERNAL_API_FAILED_CODE,
        JAVA_INTERNAL_API_USER_MESSAGE,
      ),
    );
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
      logger,
    );

    await expect(service.getUploadCredential("101", "88")).rejects.toMatchObject({
      code: WORKBENCH_INTERNAL_API_FAILED_CODE,
      message: JAVA_INTERNAL_API_USER_MESSAGE,
      statusCode: 502,
    });

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("starts message file transfer with the audit message id in an accessible conversation", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.downloadMessageFile("101", "88", 538),
    ).resolves.toEqual({
      messageId: "538",
      status: "accepted",
    });
    expect(javaClient.downloadMsgFile).toHaveBeenCalledWith({
      msgInfoId: 538,
      platform: 5,
      uid: 9001,
    });
  });

  it("starts message file transfer without requiring the current sub-user to host the seat", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "202",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.downloadMessageFile("101", "88", 538),
    ).resolves.toEqual({
      messageId: "538",
      status: "accepted",
    });
    expect(javaClient.downloadMsgFile).toHaveBeenCalledWith({
      msgInfoId: 538,
      platform: 5,
      uid: 9001,
    });
  });

  it("rejects message file transfer when msgInfoId is invalid", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.downloadMessageFile("101", "88", 0),
    ).rejects.toMatchObject({
      code: "INVALID_MESSAGE_ID",
      statusCode: 400,
    });
    expect(javaClient.downloadMsgFile).not.toHaveBeenCalled();
  });

  it("polls new-message conversation changes for the current seat", async () => {
    const javaClient = createJavaClient();
    const seat = {
      avatar: "",
      description: "私域客户管理",
      lastMessageTime: 1_778_840_001_000,
      loginStatus: "online",
      name: "德瑞可",
      operatorName: "小可",
      phone: "13296712905",
      seatId: "12",
      unreadCount: 7,
    };
    const getSeatsByIds = vi.fn(async (seatIds: string[]) =>
      seatIds.includes("12") ? [seat] : [],
    );
    const listMessages = vi.fn().mockResolvedValue({
      filteredCount: 0,
      hasMore: false,
      messages: [],
      scannedCount: 0,
    });
    const listChangedConversations = vi.fn().mockResolvedValue({
      hasMore: false,
      items: [
        {
          conversationId: "88",
          customerAvatar: "",
          customerId: "customer-001",
          customerName: "微信客户",
          lastMessage: "新消息",
          lastMessageTime: 1_778_840_001_000,
          mode: "single",
          priority: "medium",
          seatId: "12",
          unreadCount: 1,
        },
      ],
      nextVersion: 1_778_840_001_000,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        getSeatsByIds,
        listMessages,
        listChangedConversations,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        activeConversationId: "88",
        activeMessageSeq: 5,
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).resolves.toMatchObject({
      activeConversationMessages: [],
      conversationChanges: [
        {
          conversationId: "88",
          lastMessage: "新消息",
          type: "upsert",
        },
      ],
      nextVersion: 1_778_840_001_000,
      seatChanges: [
        {
          seatId: "12",
          unreadCount: 7,
        },
      ],
    });
    expect(listChangedConversations).toHaveBeenCalledWith("12", {
      limit: 500,
      sinceLastMsgTime: 1_778_839_999_999,
    });
    expect(listMessages).toHaveBeenCalledWith("88", {
      beforeSeq: undefined,
      includeHiddenConversation: true,
      limit: 50,
    });
    expect(getSeatsByIds).toHaveBeenCalledWith(["12"]);
  });

  it("polls user-seat update events and refreshes changed seats", async () => {
    const javaClient = createJavaClient();
    const getSeatsByIds = vi.fn(async (seatIds: string[]) =>
      seatIds
        .slice()
        .sort()
        .map((seatId) => ({
          avatar: "",
          description: "私域客户管理",
          hostSubUserId: seatId === "12" ? "101" : "202",
          lastMessageTime: seatId === "12" ? 1_778_840_001_000 : 1_778_840_002_000,
          loginStatus: "online" as const,
          name: seatId === "12" ? "德瑞可" : "念都堂",
          operatorName: "小可",
          phone: "13296712905",
          seatId,
          unreadCount: seatId === "12" ? 7 : 2,
        })),
    );
    const listSeatUpdateEvents = vi.fn().mockResolvedValue([
      {
        eventTime: 1_778_840_002_000,
        seatId: "13",
      },
    ]);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatEventScope: vi.fn().mockResolvedValue({
          platform: 5,
          seatIds: ["12", "13"],
          uid: 9001,
        }),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_000_000,
        }),
        getSeatsByIds,
        listSeatUpdateEvents,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        seatUpdateCursor: 1_778_840_001_000,
        sinceVersion: 1_778_840_000_000,
      }),
    ).resolves.toMatchObject({
      nextSeatUpdateCursor: 1_778_840_002_000,
      nextVersion: 1_778_840_000_000,
      seatChanges: [
        {
          hostSubUserId: "101",
          seatId: "12",
          unreadCount: 7,
        },
        {
          hostSubUserId: "202",
          seatId: "13",
          unreadCount: 2,
        },
      ],
    });
    expect(listSeatUpdateEvents).toHaveBeenCalledWith({
      afterCreateTime: 1_778_840_001_000,
      limit: 200,
      platform: 5,
      seatIds: ["12", "13"],
      uid: 9001,
    });
    expect(getSeatsByIds).toHaveBeenCalledWith(["12", "13"]);
    expect(getSeatsByIds).toHaveBeenCalledTimes(1);
  });

  it("keeps the seat update cursor unchanged when no update events are returned", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSeatEventScope: vi.fn().mockResolvedValue({
          platform: 5,
          seatIds: ["12"],
          uid: 9001,
        }),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_030_000,
        }),
        listSeatUpdateEvents: vi.fn().mockResolvedValue([]),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        seatUpdateCursor: 1_778_840_000_000,
        sinceVersion: 1_778_839_000_000,
      }),
    ).resolves.toMatchObject({
      nextSeatUpdateCursor: 1_778_840_000_000,
      seatChanges: [],
    });
  });

  it("checks seat access before listing history messages", async () => {
    const javaClient = createJavaClient();
    const canAccessSeat = vi.fn().mockResolvedValue(true);
    const listHistoryMessages = vi.fn().mockResolvedValue({
      hasNext: false,
      hasPrev: false,
      messages: [],
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat,
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          thirdExternalUserId: "external-1",
          thirdGroupId: undefined,
          thirdUserId: "seat-third-user-1",
          uid: 272,
        }),
        listHistoryMessages,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getHistoryMessages("101", "88", {
        cursor: "history-cursor",
        day: "2026-05-19",
        limit: 20,
        scope: "file",
        senderId: "external-1",
      }),
    ).resolves.toEqual({
      hasNext: false,
      hasPrev: false,
      messages: [],
    });

    expect(canAccessSeat).toHaveBeenCalledWith("101", "12");
    expect(listHistoryMessages).toHaveBeenCalledWith("88", {
      cursor: "history-cursor",
      day: "2026-05-19",
      limit: 20,
      scope: "file",
      senderId: "external-1",
    });
  });

  it("polls active conversation messages through the shared message page query", async () => {
    const javaClient = createJavaClient();
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      uid: 9001,
    });
    const listMessages = vi.fn().mockResolvedValue({
      filteredCount: 0,
      hasMore: false,
      messages: [
        {
          content: {
            text: "already loaded",
          },
          contentType: "text",
          conversationId: "88",
          customerId: "customer-001",
          messageId: "remote-msg-101",
          seatId: "12",
          senderType: "customer",
          seq: 101,
          status: "sent",
        },
        {
          content: {
            revokeMsgId: "101",
            revokeOriginMsgId: "101",
          },
          contentType: "revoke",
          conversationId: "88",
          customerId: "customer-001",
          messageId: "remote-msg-103",
          seatId: "12",
          senderType: "system",
          seq: 103,
          status: "sent",
        },
      ],
      scannedCount: 2,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listMessages,
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_002_000,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        activeConversationId: "88",
        activeMessageSeq: 101,
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).resolves.toMatchObject({
      activeConversationMessages: [
        {
          content: {
            revokeMsgId: "101",
            revokeOriginMsgId: "101",
          },
          contentType: "revoke",
          messageId: "remote-msg-103",
        },
      ],
    });
    expect(getConversationLookup).toHaveBeenCalledWith("88");
    expect(listMessages).toHaveBeenCalledWith("88", {
      beforeSeq: undefined,
      includeHiddenConversation: true,
      limit: 50,
    });
  });

  it("returns message update events only for the active conversation", async () => {
    const javaClient = createJavaClient();
    const listMessageUpdateEvents = vi.fn().mockResolvedValue([
      {
        conversationId: "88",
        eventTime: 1_778_840_003_000,
        eventId: 4,
        messageId: "829",
      },
    ]);
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_002_000,
        }),
        listMessageUpdateEvents,
        listMessages: vi.fn().mockResolvedValue({
          filteredCount: 0,
          hasMore: false,
          messages: [],
          scannedCount: 0,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.poll("101", {
      activeConversationId: "88",
      activeMessageSeq: 5,
      currentSeatId: "12",
      sinceVersion: 1_778_840_000_000,
    });

    expect(listMessageUpdateEvents).toHaveBeenCalledWith("88", {
      afterCreateTime: 1_778_840_000_000,
      limit: 200,
    });
  });

  it("keeps the message update cursor unchanged when no update events are returned", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_030_000,
        }),
        listMessageUpdateEvents: vi.fn().mockResolvedValue([]),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        activeConversationId: "88",
        currentSeatId: "12",
        messageUpdateCursor: 1_778_840_000_000,
        sinceVersion: 1_778_839_000_000,
      }),
    ).resolves.toMatchObject({
      messageUpdateEvents: [],
      nextMessageUpdateCursor: 1_778_840_000_000,
    });
  });

  it("advances the message update cursor to the latest returned event time", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_030_000,
        }),
        listMessageUpdateEvents: vi.fn().mockResolvedValue([
          {
            conversationId: "88",
            eventId: 4,
            eventTime: 1_778_840_003_000,
            messageId: "829",
          },
        ]),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        activeConversationId: "88",
        currentSeatId: "12",
        messageUpdateCursor: 1_778_840_000_000,
        sinceVersion: 1_778_839_000_000,
      }),
    ).resolves.toMatchObject({
      nextMessageUpdateCursor: 1_778_840_003_000,
    });
  });

  it("does not overlap the first poll after a fresh conversation baseline", async () => {
    const javaClient = createJavaClient();
    const listChangedConversations = vi.fn().mockResolvedValue({
      hasMore: false,
      items: [],
      nextVersion: 1_778_840_002_000,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.poll("101", {
      currentSeatId: "12",
      freshBaseline: true,
      sinceVersion: 1_778_840_000_000,
    });

    expect(listChangedConversations).toHaveBeenCalledWith("12", {
      limit: 500,
      sinceLastMsgTime: 1_778_840_000_000,
    });
  });

  it("keeps the poll cursor unchanged when no conversations changed", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [],
          nextVersion: 1_778_840_030_000,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).resolves.toMatchObject({
      conversationChanges: [],
      nextVersion: 1_778_840_000_000,
    });
  });

  it("advances the poll cursor by 1ms when changes stay on the same timestamp boundary", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: false,
          items: [
            {
              conversationId: "88",
              customerAvatar: "",
              customerId: "customer-001",
              customerName: "微信客户",
              lastMessage: "新消息",
              lastMessageTime: 1_778_840_000_000,
              mode: "single",
              priority: "medium",
              seatId: "12",
              unreadCount: 1,
            },
          ],
          nextVersion: 1_778_840_030_000,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).resolves.toMatchObject({
      conversationChanges: [
        {
          conversationId: "88",
          lastMessage: "新消息",
          type: "upsert",
        },
      ],
      nextVersion: 1_778_840_000_001,
    });
  });

  it("logs poll cursor invalidation context before rejecting", async () => {
    const javaClient = createJavaClient();
    const logger = createLoggerMock();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeat: vi.fn(),
        listChangedConversations: vi.fn().mockResolvedValue({
          hasMore: true,
          items: [],
          nextVersion: 1_778_840_002_000,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
      logger,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).rejects.toMatchObject({
      code: "WORKBENCH_CURSOR_INVALIDATED",
      statusCode: 409,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      {
        activeConversationId: undefined,
        currentSeatId: "12",
        operation: "workbench-poll",
        sinceLastMsgTime: 1_778_839_999_999,
        sinceVersion: 1_778_840_000_000,
        subUserId: "101",
      },
      "工作台 poll cursor 失效",
    );
  });

  it("reads message file transfer status after seat access is verified", async () => {
    const javaClient = createJavaClient();
    const getMessageFileDownloadStatus = vi.fn().mockResolvedValue({
      downloadStatus: "finished",
      fileSerialNo: "serial-file-001",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          uid: 9001,
        }),
        getMessageFileDownloadStatus,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.getMessageFileDownloadStatus("101", "88", 321),
    ).resolves.toEqual({
      downloadStatus: "finished",
      fileSerialNo: "serial-file-001",
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });
    expect(getMessageFileDownloadStatus).toHaveBeenCalledWith({
      auditId: 321,
      platform: 5,
      uid: 9001,
    });
  });

  it("revokes an own recent agent message through Java with seq as revokeMsgId", async () => {
    const javaClient = createJavaClient();
    const getMessageForRevoke = vi.fn().mockResolvedValue({
      createdAt: Date.now() - 60_000,
      isRevoked: false,
      seq: 321,
      senderType: "agent",
      status: "sent",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageForRevoke,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.revokeMessage("101", "88", "321"),
    ).resolves.toEqual({
      accepted: true,
      conversationId: "88",
      messageId: "321",
      revokeMsgId: 321,
    });

    expect(getMessageForRevoke).toHaveBeenCalledWith({
      conversationId: "88",
      messageId: "321",
      platform: 5,
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(javaClient.revokeMessage).toHaveBeenCalledWith({
      platform: 5,
      revokeMsgId: 321,
      uid: 9001,
    });
  });

  it("rejects revoke for messages at the 180 second boundary", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageForRevoke: vi.fn().mockResolvedValue({
          createdAt: Date.now() - 180_000,
          isRevoked: false,
          seq: 321,
          senderType: "agent",
          status: "sent",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.revokeMessage("101", "88", "321"),
    ).rejects.toMatchObject({
      code: "MESSAGE_REVOKE_EXPIRED",
      statusCode: 400,
    });
    expect(javaClient.revokeMessage).not.toHaveBeenCalled();
  });

  it("allows revoke when database createdAt is slightly ahead of the app clock", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageForRevoke: vi.fn().mockResolvedValue({
          createdAt: Date.now() + 2_000,
          isRevoked: false,
          seq: 321,
          senderType: "agent",
          status: "sent",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.revokeMessage("101", "88", "321"),
    ).resolves.toMatchObject({
      accepted: true,
      messageId: "321",
      revokeMsgId: 321,
    });
    expect(javaClient.revokeMessage).toHaveBeenCalledWith({
      platform: 5,
      revokeMsgId: 321,
      uid: 9001,
    });
  });

  it("rejects revoke when database createdAt is far ahead of the app clock", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageForRevoke: vi.fn().mockResolvedValue({
          createdAt: Date.now() + 10_000,
          isRevoked: false,
          seq: 321,
          senderType: "agent",
          status: "sent",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.revokeMessage("101", "88", "321"),
    ).rejects.toMatchObject({
      code: "MESSAGE_REVOKE_EXPIRED",
      statusCode: 400,
    });
    expect(javaClient.revokeMessage).not.toHaveBeenCalled();
  });

  it("rejects revoke for customer messages", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
          id: "88",
          platform: 5,
          seatId: "12",
          seatHostSubUserId: "101",
          thirdUserId: "seat-user-001",
          uid: 9001,
        }),
        getMessageForRevoke: vi.fn().mockResolvedValue({
          createdAt: Date.now() - 60_000,
          isRevoked: false,
          seq: 321,
          senderType: "customer",
          status: "sent",
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.revokeMessage("101", "88", "321"),
    ).rejects.toMatchObject({
      code: "MESSAGE_REVOKE_FORBIDDEN",
      statusCode: 403,
    });
    expect(javaClient.revokeMessage).not.toHaveBeenCalled();
  });

  it("maps a group text send with mentions to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-001",
      messageId: "opt-001",
      optNo: "opt-001",
      status: "accepted",
    });
    const getConversationLookup = vi.fn().mockResolvedValue({
      id: "88",
      platform: 5,
      seatId: "12",
      seatHostSubUserId: "101",
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        clientMessageId: "local-001",
        conversationId: "88",
        mention: {
          location: "end",
          memberIds: ["member-user", "member-rui"],
        },
        seatId: "12",
        segment: {
          text: "今天统一看群公告",
          type: "text",
        },
      }),
    ).resolves.toEqual({
      clientMessageId: "local-001",
      messageId: "opt-001",
      optNo: "opt-001",
      status: "accepted",
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-001",
      msgData: {
        atLocation: 1,
        atWxSerialNos: ["member-user", "member-rui"],
        isHit: 2,
        msgtype: "text",
        text: "今天统一看群公告",
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
    expect(getConversationLookup).toHaveBeenCalledWith("88");
  });

  it("maps a group text send with mention-all to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-all-001",
      messageId: "opt-all-001",
      optNo: "opt-all-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-all-001",
      conversationId: "88",
      mention: {
        all: true,
        location: "start",
        memberIds: [],
      },
      seatId: "12",
      segment: {
        text: "大家看一下",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-all-001",
      msgData: {
        atLocation: 0,
        isHit: 1,
        msgtype: "text",
        text: "大家看一下",
      },
      platform: 5,
      sendType: 2,
      source: 1,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("passes failMsgId to Java when retrying a failed message", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-retry-001",
      messageId: "opt-retry-001",
      optNo: "opt-retry-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-retry-001",
      conversationId: "88",
      failMsgId: "538",
      seatId: "12",
      segment: {
        text: "重试消息",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-retry-001",
      failMsgId: 538,
      msgData: {
        msgtype: "text",
        text: "重试消息",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a quoted text send to the Java local quote payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-quote-001",
      messageId: "opt-quote-001",
      optNo: "opt-quote-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-quote-001",
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
        quotedMessageId: "remote-msg-538",
      },
      seatId: "12",
      segment: {
        text: "正式引用消息",
        type: "text",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-quote-001",
      msgData: {
        msgtype: "quote",
        quoteMsgId: 538,
        text: "正式引用消息",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a single-chat image send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-image-001",
      messageId: "opt-image-001",
      optNo: "opt-image-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-image-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        alt: "截图",
        type: "image",
        url: "https://b5.bokr.com.cn/s5/upload/a.png",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-image-001",
      msgData: {
        fileUrl: "https://b5.bokr.com.cn/s5/upload/a.png",
        msgtype: "image",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("ignores quote payload for image sends", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-image-quote-001",
      messageId: "opt-image-quote-001",
      optNo: "opt-image-quote-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-image-quote-001",
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
        quotedMessageId: "remote-msg-538",
      },
      seatId: "12",
      segment: {
        alt: "截图",
        type: "image",
        url: "https://b5.bokr.com.cn/s5/upload/a.png",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        msgData: {
          fileUrl: "https://b5.bokr.com.cn/s5/upload/a.png",
          msgtype: "image",
        },
      }),
    );
  });

  it("maps a collected file material send to the Java file payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-file-001",
      messageId: "opt-file-001",
      optNo: "opt-file-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价单.pdf",
          fileUrl: "chat-files/quote.pdf",
        }),
        msgInfoId: "9101",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      clientMessageId: "local-file-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "66",
        type: "file",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "66",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-file-001",
      msgData: {
        fileName: "报价单.pdf",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        msgtype: "file",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("sends quick reply file snapshots from inline fields without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-file-quick-reply-001",
      messageId: "opt-file-quick-reply-001",
      optNo: "opt-file-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      clientMessageId: "local-file-quick-reply-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        fileName: "快捷话术报价单.pdf",
        type: "file",
        url: "https://b5.bokr.com.cn/chat-files/quick-reply-quote.pdf",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-file-quick-reply-001",
      msgData: {
        fileName: "快捷话术报价单.pdf",
        fileUrl: "https://b5.bokr.com.cn/chat-files/quick-reply-quote.pdf",
        msgtype: "file",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a collected H5 material send to the Java link payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-h5-001",
      messageId: "opt-h5-001",
      optNo: "opt-h5-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          desc: "恭喜发财，大吉大利",
          href: "https://example.com/redpacket",
          title: "红包来啦",
        }),
        msgInfoId: "9102",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      clientMessageId: "local-h5-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "77",
        type: "h5",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      id: "77",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-h5-001",
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/default-cover.png",
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        msgtype: "link",
        title: "红包来啦",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("sends quick reply H5 snapshots from inline fields without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-h5-quick-reply-001",
      messageId: "opt-h5-quick-reply-001",
      optNo: "opt-h5-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      clientMessageId: "local-h5-quick-reply-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        coverUrl: "https://b5.bokr.com.cn/dist/quick-reply-cover.png",
        desc: "快捷话术说明",
        href: "https://example.com/quick-reply",
        title: "快捷话术链接",
        type: "h5",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-h5-quick-reply-001",
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/quick-reply-cover.png",
        desc: "快捷话术说明",
        href: "https://example.com/quick-reply",
        msgtype: "link",
        title: "快捷话术链接",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("uses the default cover when direct H5 link send has no cover", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-h5-default-cover-001",
      messageId: "opt-h5-default-cover-001",
      optNo: "opt-h5-default-cover-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-h5-default-cover-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        title: "红包来啦",
        type: "h5",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-h5-default-cover-001",
      msgData: {
        coverUrl: "https://b5.bokr.com.cn/dist/default-cover.png",
        desc: "恭喜发财，大吉大利",
        href: "https://example.com/redpacket",
        msgtype: "link",
        title: "红包来啦",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps an expression material send to the Java emotion payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-emotion-001",
      messageId: "opt-emotion-001",
      optNo: "opt-emotion-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileUrl: "https://example.com/expression.gif",
        }),
        msgInfoId: "9103",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      clientMessageId: "local-emotion-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "65",
        type: "emotion",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      id: "65",
      subUserId: "101",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-emotion-001",
      msgData: {
        fileUrl: "https://example.com/expression.gif",
        msgtype: "emotion",
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects expression material sends when the stored file url is missing", async () => {
    const javaClient = createJavaClient();
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          url: "https://example.com/legacy-expression.gif",
        }),
        msgInfoId: "9104",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(repository, javaClient);

    await expect(
      service.sendMessage("101", {
        clientMessageId: "local-emotion-invalid",
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "65",
          type: "emotion",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_EMOTION_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("maps a mini-program forward send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-weapp-001",
      messageId: "opt-weapp-001",
      optNo: "opt-weapp-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        msgInfoId: "9105",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(
      repository,
      javaClient,
    );

    await service.sendMessage("101", {
      clientMessageId: "local-weapp-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        materialCollectionId: "66",
        type: "weapp",
      },
    });

    expect(repository.findMaterialCollectionForForward).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
      id: "66",
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-weapp-001",
      msgData: {
        msgtype: "weapp",
        transMsgInfoId: 9105,
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("forwards quick reply mini-program snapshots by msgInfoId without material lookup", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-weapp-quick-reply-001",
      messageId: "opt-weapp-quick-reply-001",
      optNo: "opt-weapp-quick-reply-001",
      status: "accepted",
    });
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(repository, javaClient);

    await service.sendMessage("101", {
      clientMessageId: "local-weapp-quick-reply-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        msgInfoId: "9106",
        type: "weapp",
      },
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-weapp-quick-reply-001",
      msgData: {
        msgtype: "weapp",
        transMsgInfoId: 9106,
      },
      platform: 5,
      sendType: 1,
      source: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("rejects collected sphfeed sends while sphfeed sending is unavailable", async () => {
    const javaClient = createJavaClient();
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn().mockResolvedValue({
        msgid: "msg-sphfeed-001",
      }),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(
      repository,
      javaClient,
    );

    await expect(
      service.sendMessage("101", {
        clientMessageId: "local-sphfeed-001",
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "77",
          type: "sphfeed",
        },
      }),
    ).rejects.toMatchObject({
      code: "SPHFEED_UNAVAILABLE",
      message: "视频号发送功能暂未开放",
      statusCode: 400,
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects quick reply sphfeed snapshots while sphfeed sending is unavailable", async () => {
    const javaClient = createJavaClient();
    const repository = {
      canAccessSeat: vi.fn().mockResolvedValue(true),
      findMaterialCollectionForForward: vi.fn(),
      getConversationLookup: vi.fn().mockResolvedValue({
        id: "88",
        platform: 5,
        seatId: "12",
        seatHostSubUserId: "101",
        thirdGroupId: "group-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    } as unknown as WorkbenchRepository;
    const service = new MysqlWorkbenchService(repository, javaClient);

    await expect(
      service.sendMessage("101", {
        clientMessageId: "local-sphfeed-quick-reply-001",
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "77",
          msgid: "msg-sphfeed-quick-reply-001",
          type: "sphfeed",
        },
      }),
    ).rejects.toMatchObject({
      code: "SPHFEED_UNAVAILABLE",
      message: "视频号发送功能暂未开放",
      statusCode: 400,
    });

    expect(repository.findMaterialCollectionForForward).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects forward sends when the material collection is not visible", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        findMaterialCollectionForForward: vi.fn().mockResolvedValue(undefined),
        getConversationLookup: vi.fn().mockResolvedValue({
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
      service.sendMessage("101", {
        clientMessageId: "local-weapp-invalid",
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "66",
          type: "weapp",
        },
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_COLLECTION_NOT_FOUND",
      statusCode: 404,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects forward sends when the stored source message info id is blank", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        findMaterialCollectionForForward: vi.fn().mockResolvedValue({
          msgInfoId: "   ",
        }),
        getConversationLookup: vi.fn().mockResolvedValue({
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
      service.sendMessage("101", {
        clientMessageId: "local-weapp-invalid",
        conversationId: "88",
        seatId: "12",
        segment: {
          materialCollectionId: "66",
          type: "weapp",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANS_MESSAGE_INFO_ID",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("ignores quote payload for file sends", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-file-quote-001",
      messageId: "opt-file-quote-001",
      optNo: "opt-file-quote-001",
      status: "accepted",
    });
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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

    await service.sendMessage("101", {
      clientMessageId: "local-file-quote-001",
      conversationId: "88",
      quote: {
        quoteMsgId: "538",
        quotedMessageId: "remote-msg-538",
      },
      seatId: "12",
      segment: {
        extension: "pdf",
        fileName: "报价单.pdf",
        fileSizeLabel: "6.09 MB",
        type: "file",
        url: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        msgData: {
          fileName: "报价单.pdf",
          fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
          msgtype: "file",
        },
      }),
    );
  });

  it("rejects image send without a sendable URL before calling Java", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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
      service.sendMessage("101", {
        clientMessageId: "local-image-missing-url",
        conversationId: "88",
        seatId: "12",
        segment: {
          alt: "截图",
          type: "image",
        },
      }),
    ).rejects.toMatchObject({
      code: "INVALID_IMAGE_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects multi-segment payloads before calling Java", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getConversationLookup: vi.fn().mockResolvedValue({
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
      service.sendMessage("101", {
        clientMessageId: "local-multi-001",
        conversationId: "88",
        seatId: "12",
        segments: [
          {
            text: "第一段",
            type: "text",
          },
          {
            text: "第二段",
            type: "text",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_SEND_MESSAGE",
      statusCode: 400,
    });
    expect(javaClient.sendMessage).not.toHaveBeenCalled();
  });

  it("forwards smart heartbeat for an operable single chat conversation", async () => {
    const javaClient = createJavaClient();
    const service = new MysqlWorkbenchService(
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
    const service = new MysqlWorkbenchService(
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
    const service = new MysqlWorkbenchService(
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

  it("quick reply: updates changed child category sort rows by submitted order", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: 0 }),
      listActiveQuickReplyCategorySortItems: vi.fn().mockResolvedValue([
        { id: "21", sort: 3000 },
        { id: "22", sort: 1000 },
        { id: "23", sort: 2000 },
      ]),
      sortQuickReplyCategories: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplyCategories("101", {
        categoryIds: ["23", "21", "22"],
        parentId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.sortQuickReplyCategories).toHaveBeenCalledWith({
      items: [
        { categoryId: "23", sort: 3000 },
        { categoryId: "21", sort: 2000 },
      ],
      parentId: "10",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: rejects category sort when submitted ids do not match current scope", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: 0 }),
      listActiveQuickReplyCategorySortItems: vi
        .fn()
        .mockResolvedValue([{ id: "21", sort: 2000 }, { id: "22", sort: 1000 }]),
      sortQuickReplyCategories: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplyCategories("101", {
        categoryIds: ["21", "23"],
        parentId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_SORT_SCOPE_CHANGED",
      statusCode: 400,
    });
    expect(repository.sortQuickReplyCategories).not.toHaveBeenCalled();
  });

  it("quick reply: skips category sort update when order is unchanged", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: 0 }),
      listActiveQuickReplyCategorySortItems: vi.fn().mockResolvedValue([
        { id: "21", sort: 3000 },
        { id: "22", sort: 2000 },
        { id: "23", sort: 1000 },
      ]),
      sortQuickReplyCategories: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplyCategories("101", {
        categoryIds: ["21", "22", "23"],
        parentId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.sortQuickReplyCategories).not.toHaveBeenCalled();
  });

  it("quick reply: updates changed reply sort rows by submitted order", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
      listActiveQuickReplySortItems: vi.fn().mockResolvedValue([
        { id: "31", sort: 3000 },
        { id: "32", sort: 1000 },
        { id: "33", sort: 2000 },
      ]),
      sortQuickReplies: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplies("101", {
        categoryId: "21",
        quickReplyIds: ["33", "31", "32"],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.sortQuickReplies).toHaveBeenCalledWith({
      categoryId: "21",
      items: [
        { quickReplyId: "33", sort: 3000 },
        { quickReplyId: "31", sort: 2000 },
      ],
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: skips reply sort update when order is unchanged", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
      listActiveQuickReplySortItems: vi.fn().mockResolvedValue([
        { id: "31", sort: 3000 },
        { id: "32", sort: 2000 },
        { id: "33", sort: 1000 },
      ]),
      sortQuickReplies: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplies("101", {
        categoryId: "21",
        quickReplyIds: ["31", "32", "33"],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.sortQuickReplies).not.toHaveBeenCalled();
  });

  it("material: collects expression with current sub user scope", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_000_000);
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ md5: "emotion-md5" }),
        id: 9101,
        msgid: "msg-emotion-1",
        msgtype: "emotion",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        groupId: "9",
        msgInfoId: "9101",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
      content: JSON.stringify({ md5: "emotion-md5" }),
      groupId: 0,
      msgInfoId: "9101",
      opSubUserId: "101",
      sort: 1_779_700_000_000,
      subUid: 101,
      title: "表情",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: collects file with tenant scope and selected group", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_001_000);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("181"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        id: "9102",
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.findMaterialMessage).toHaveBeenCalledWith({
      msgInfoId: "9102",
      uid: 9001,
    });
    expect(repository.createMaterialCollection).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      content: JSON.stringify({
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/quote.pdf",
      }),
      groupId: "9",
      msgInfoId: "9102",
      opSubUserId: "101",
      sort: 1_779_700_001_000,
      subUid: 0,
      title: "报价.pdf",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects file collect when file url is missing", async () => {
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ fileName: "报价.pdf" }),
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "文件缺少下载地址，无法收录",
    });
  });

  it("material: rejects generated material title over collection limit", async () => {
    const longFileName = `${"超".repeat(40)}.pdf`;
    const repository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: longFileName,
          fileUrl: "https://cdn.example.com/long.pdf",
        }),
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9102",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "文件名称不能超过 32 个字符",
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: requires a real group before collecting tenant materials", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });
    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: 0,
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });
    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "0",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择分组",
    });

    expect(repository.findMaterialMessage).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: collects sphfeed messages into tenant materials", async () => {
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("182"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          description: "杭州高架惊现鸵鸟飞奔",
          imageUrl: "https://finder.video.qq.com/cover.jpg",
          linkUrl: "https://channels.weixin.qq.com/web/pages/feed?eid=export",
          title: "都市快报",
        }),
        msgid: "msg-sphfeed-001",
        id: 9104,
        msgtype: "sphfeed",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        groupId: "9",
        msgInfoId: "9104",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED,
        msgInfoId: "9104",
        title: "都市快报",
        uid: 9001,
      }),
    );
  });

  it("material: rejects invalid selected group before collecting tenant materials", async () => {
    const repository = createMaterialRepository({
      hasActiveMaterialGroup: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "请选择有效分组",
    });

    expect(repository.hasActiveMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      groupId: "9",
      uid: 9001,
    });
    expect(repository.findMaterialMessage).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: returns failure result when create does not insert", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_003_000);
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue(undefined),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          coverUrl: "https://hd-smp-test.iyouke.com/static/image/default-redpacket.png",
          desc: "恭喜发财，大吉大利",
          href: "https://m-scrm-test.dtminds.com/h5/pages/redpacketSend/index",
          title: "红包来啦",
        }),
        msgid: "1025657",
        id: 9105,
        msgtype: "link",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9105",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "素材收录失败，请稍后重试",
    });

    nowSpy.mockRestore();
  });

  it("material: collects tenant messages without seat access checks", async () => {
    const repository = createMaterialRepository({
      canAccessSeat: vi.fn().mockResolvedValue(false),
      createMaterialCollection: vi.fn().mockResolvedValue("181"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9106,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9106",
      }),
    ).resolves.toEqual({ success: true });

    expect(repository.canAccessSeat).not.toHaveBeenCalled();
    expect(repository.createMaterialCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        msgInfoId: "9106",
        uid: 9001,
      }),
    );
  });

  it("material: returns duplicate when concurrent insert hits unique key", async () => {
    const repository = createMaterialRepository({
      createMaterialCollection: vi.fn().mockResolvedValue("DUPLICATE"),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9107,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9107",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });
  });

  it("material: returns active duplicate without inserting", async () => {
    const existingItem = createMaterialItem({
      id: "77",
      msgInfoId: "9108",
      title: "已收藏文件",
    });
    const repository = createMaterialRepository({
      findMaterialCollectionByMessage: vi.fn().mockResolvedValue({
        bizStatus: 1,
        id: "77",
        item: existingItem,
      }),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/quote.pdf",
        }),
        msgid: "msg-file-1",
        id: 9108,
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9108",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });

    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
    expect(repository.restoreMaterialCollection).not.toHaveBeenCalled();
    expect(repository.findMaterialCollectionByMessage).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      msgInfoId: "9108",
      subUid: 0,
      uid: 9001,
    });
  });

  it("material: restores deleted duplicate with refreshed fields", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_002_000);
    const existingItem = createMaterialItem({
      groupId: "3",
      id: "77",
      msgInfoId: "9103",
      title: "旧文件",
    });
    const repository = createMaterialRepository({
      findMaterialCollectionByMessage: vi.fn().mockResolvedValue({
        bizStatus: 0,
        id: "77",
        item: existingItem,
      }),
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "新报价.pdf",
          fileUrl: "https://cdn.example.com/new-quote.pdf",
        }),
        id: 9103,
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9103",
      }),
    ).resolves.toEqual({
      success: true,
      duplicated: true,
    });

    expect(repository.restoreMaterialCollection).toHaveBeenCalledWith({
      content: JSON.stringify({
        fileName: "新报价.pdf",
        fileUrl: "https://cdn.example.com/new-quote.pdf",
      }),
      groupId: "9",
      id: "77",
      msgInfoId: "9103",
      opSubUserId: "101",
      sort: 1_779_700_002_000,
      title: "新报价.pdf",
      uid: 9001,
    });
    expect(repository.createMaterialCollection).not.toHaveBeenCalled();
    expect(repository.findMaterialCollectionByMessage).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      msgInfoId: "9103",
      subUid: 0,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects expression group creation", async () => {
    const service = new MysqlWorkbenchService(
      createMaterialRepository(),
      createJavaClient(),
    );

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION as never,
        title: "表情分组",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_UNSUPPORTED",
      statusCode: 400,
    });
  });

  it("material: rejects material group creation when limit is reached", async () => {
    const repository = createMaterialRepository({
      countMaterialGroups: vi.fn().mockResolvedValue(20),
      createMaterialGroup: vi.fn().mockResolvedValue("88"),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "常用文件",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_LIMIT_REACHED",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: creates material group and returns the created group", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_004_000);
    const repository = createMaterialRepository({
      createMaterialGroup: vi.fn().mockResolvedValue("88"),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: " 常用文件 ",
      }),
    ).resolves.toEqual({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      id: "88",
      sort: 1_779_700_004_000,
      title: "常用文件",
    });

    expect(repository.createMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      sort: 1_779_700_004_000,
      subUid: 0,
      title: "常用文件",
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: returns internal error when material group creation has no id", async () => {
    const repository = createMaterialRepository({
      createMaterialGroup: vi.fn().mockResolvedValue(undefined),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "常用文件",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_CREATE_FAILED",
      statusCode: 500,
    });
  });

  it("material: rejects material group names over 10 characters", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "一二三四五六七八九十甲",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_TOO_LONG",
      statusCode: 400,
    });

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "一二三四五六七八九十甲",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_TOO_LONG",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
    expect(repository.renameMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: rejects blank material group names after trimming", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createMaterialGroup("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_REQUIRED",
      statusCode: 400,
    });

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_TITLE_REQUIRED",
      statusCode: 400,
    });

    expect(repository.createMaterialGroup).not.toHaveBeenCalled();
    expect(repository.renameMaterialGroup).not.toHaveBeenCalled();
  });

  it("material: mutates tenant materials with shared sub user scope", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_005_000);
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        subUid: 0,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(service.deleteMaterialCollection("101", "66")).resolves.toEqual({
      ok: true,
    });
    await expect(service.topMaterialCollection("101", "66")).resolves.toEqual({
      ok: true,
    });
    await expect(
      service.moveMaterialCollection("101", "66", { groupId: "9" }),
    ).resolves.toEqual({ ok: true });

    expect(repository.deleteMaterialCollection).toHaveBeenCalledWith({
      id: "66",
      subUid: 0,
      uid: 9001,
    });
    expect(repository.topMaterialCollection).toHaveBeenCalledWith({
      id: "66",
      sort: 1_779_700_005_000,
      subUid: 0,
      uid: 9001,
    });
    expect(repository.moveMaterialCollection).toHaveBeenCalledWith({
      groupId: "9",
      id: "66",
      sort: 1_779_700_005_000,
      subUid: 0,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: updates file and h5 collection content/title when edited", async () => {
    const fileRepository = createMaterialRepository({
      findMaterialCollectionRecord: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          fileName: "报价.pdf",
          fileUrl: "https://cdn.example.com/a.pdf",
        }),
        id: "66",
      }),
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        subUid: 0,
      }),
    });
    const fileService = new MysqlWorkbenchService(fileRepository, createJavaClient());

    await expect(
      fileService.updateMaterialCollection("101", "66", {
        fileName: "新报价.pdf",
      }),
    ).resolves.toEqual({ ok: true });

    expect(fileRepository.findMaterialCollectionRecord).toHaveBeenCalledWith({
      id: "66",
      subUid: 0,
      uid: 9001,
    });
    expect(fileRepository.updateMaterialCollectionContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        fileName: "新报价.pdf",
        fileUrl: "https://cdn.example.com/a.pdf",
      }),
      id: "66",
      subUid: 0,
      title: "新报价.pdf",
      uid: 9001,
    });

    const h5Repository = createMaterialRepository({
      findMaterialCollectionRecord: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          description: "旧描述",
          href: "https://example.com/page",
          title: "旧标题",
        }),
        id: "77",
      }),
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        subUid: 0,
      }),
    });
    const h5Service = new MysqlWorkbenchService(h5Repository, createJavaClient());

    await expect(
      h5Service.updateMaterialCollection("101", "77", {
        description: "新描述",
        title: "新标题",
      }),
    ).resolves.toEqual({ ok: true });

    expect(h5Repository.updateMaterialCollectionContent).toHaveBeenCalledWith({
      content: JSON.stringify({
        description: "新描述",
        href: "https://example.com/page",
        title: "新标题",
      }),
      id: "77",
      subUid: 0,
      title: "新标题",
      uid: 9001,
    });
  });

  it("material: rejects another sub user's expression collection operation", async () => {
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        subUid: 202,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(service.deleteMaterialCollection("101", "66")).rejects.toMatchObject({
      code: "MATERIAL_COLLECTION_NOT_FOUND",
      statusCode: 404,
    });

    expect(repository.deleteMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: validates target group when moving tenant materials", async () => {
    const repository = createMaterialRepository({
      findMaterialCollectionScope: vi.fn().mockResolvedValue({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        subUid: 0,
      }),
      hasActiveMaterialGroup: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveMaterialCollection("101", "66", { groupId: "9" }),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_NOT_FOUND",
      statusCode: 400,
    });

    expect(repository.hasActiveMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
      groupId: "9",
      uid: 9001,
    });
    expect(repository.moveMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: renames and tops material groups", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_779_700_006_000);
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.renameMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE, {
        title: "新分组",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.topMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE),
    ).resolves.toEqual({ ok: true });

    expect(repository.renameMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      title: "新分组",
      uid: 9001,
    });
    expect(repository.topMaterialGroup).toHaveBeenCalledWith({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      sort: 1_779_700_006_000,
      uid: 9001,
    });
    nowSpy.mockRestore();
  });

  it("material: rejects unsupported and mismatched message types", async () => {
    const unsupportedRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ text: "普通文本" }),
        id: 9109,
        msgid: "msg-text-1",
        msgtype: "text",
        uid: 9001,
      }),
    });
    const unsupportedService = new MysqlWorkbenchService(
      unsupportedRepository,
      createJavaClient(),
    );

    await expect(
      unsupportedService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        msgInfoId: "9109",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MATERIAL_MESSAGE",
      statusCode: 400,
    });
    expect(unsupportedRepository.createMaterialCollection).not.toHaveBeenCalled();

    const mismatchedRepository = createMaterialRepository({
      findMaterialMessage: vi.fn().mockResolvedValue({
        content: JSON.stringify({ fileName: "报价.pdf" }),
        id: 9110,
        msgid: "msg-file-1",
        msgtype: "file",
        uid: 9001,
      }),
    });
    const mismatchedService = new MysqlWorkbenchService(
      mismatchedRepository,
      createJavaClient(),
    );

    await expect(
      mismatchedService.collectMaterial("101", {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.H5,
        groupId: "9",
        msgInfoId: "9110",
      }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_MATERIAL_MESSAGE",
      statusCode: 400,
    });
    expect(mismatchedRepository.createMaterialCollection).not.toHaveBeenCalled();
  });

  it("material: rejects non-empty group deletion", async () => {
    const repository = createMaterialRepository({
      isMaterialGroupEmpty: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.deleteMaterialGroup("101", "9", MATERIAL_COLLECTION_BIZ_TYPE.FILE),
    ).rejects.toMatchObject({
      code: "MATERIAL_GROUP_NOT_EMPTY",
      message: "请先移走或删除分组内素材",
      statusCode: 400,
    });

    expect(repository.deleteMaterialGroup).not.toHaveBeenCalled();
  });

  it("quick reply: rejects saving an empty quick reply", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReply("101", {
        attachments: [],
        contentText: " ",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_QUICK_REPLY",
      message: "请填写话术内容或添加附件",
    });

    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: rejects unsupported attachments instead of silently dropping them", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReply("101", {
        attachments: [
          {
            content: {
              fileUrl: "https://example.com/video.mp4",
            },
            type: "video",
          },
        ],
        contentText: "请查看附件",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_QUICK_REPLY",
      message: "附件类型不支持",
    });

    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: lists personal replies in the current sub user scope", async () => {
    const repository = createMaterialRepository({
      listQuickReplies: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.listQuickReplies("101", {
        page: 1,
        pageSize: 50,
        scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      }),
    ).resolves.toEqual({
      items: [],
      pagination: {
        hasMore: false,
        page: 1,
        pageSize: 50,
        total: 0,
      },
    });

    expect(repository.listQuickReplies).toHaveBeenCalledWith({
      categoryId: undefined,
      keyword: undefined,
      page: 1,
      pageSize: 50,
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: allows API page size up to one hundred", async () => {
    const repository = createMaterialRepository({
      listQuickReplies: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await service.listQuickReplies("101", {
      page: 1,
      pageSize: 100,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    });

    expect(repository.listQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSize: 100,
      }),
    );
  });

  it("quick reply: groups first-level category content by second-level category", async () => {
    const repository = createMaterialRepository({
      listQuickReplyCategoryContent: vi.fn().mockResolvedValue({
        categories: [
          {
            id: "11",
            parentId: "10",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 100,
            title: "报价",
          },
          {
            id: "12",
            parentId: "10",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 90,
            title: "致歉",
          },
        ],
        quickReplies: [
          {
            attachments: [],
            categoryId: "11",
            contentText: "报价话术",
            id: "21",
            labelColor: "",
            labelText: "",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 100,
          },
          {
            attachments: [],
            categoryId: "12",
            contentText: "致歉话术",
            id: "22",
            labelColor: "",
            labelText: "",
            scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
            sort: 90,
          },
        ],
        truncated: {
          categories: false,
          quickReplies: false,
        },
      }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.listQuickReplyCategoryContent("101", {
        parentCategoryId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      categories: [
        expect.objectContaining({ id: "11", title: "报价" }),
        expect.objectContaining({ id: "12", title: "致歉" }),
      ],
      limits: {
        categories: 50,
        quickReplies: 10_000,
      },
      quickRepliesByCategoryId: {
        "11": [expect.objectContaining({ contentText: "报价话术" })],
        "12": [expect.objectContaining({ contentText: "致歉话术" })],
      },
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });
    expect(repository.listQuickReplyCategoryContent).toHaveBeenCalledWith({
      categoryLimit: 50,
      parentCategoryId: "10",
      quickReplyLimit: 10_000,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: creates valid replies at the end of their category", async () => {
    const repository = createMaterialRepository({
      countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(120),
      createQuickReply: vi.fn().mockResolvedValue("501"),
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
      findQuickReplySortBoundary: vi.fn().mockResolvedValue(80),
      hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReply("101", {
        attachments: [
          {
            content: {
              fileName: "报价单.pdf",
              fileUrl: "https://example.com/file.pdf",
            },
            materialCollectionId: "8",
            msgInfoId: "1025656",
            type: "file",
          },
        ],
        categoryId: "11",
        contentText: " 您好 ",
        labelColor: "purple",
        labelText: " 售前 ",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.hasActiveQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.isChildQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.countQuickRepliesUnderTopCategory).toHaveBeenCalledWith({
      categoryId: "10",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.createQuickReply).toHaveBeenCalledWith({
      attachments: [
        {
          content: {
            fileName: "报价单.pdf",
            fileUrl: "https://example.com/file.pdf",
          },
          materialCollectionId: "8",
          msgInfoId: "1025656",
          type: "file",
        },
      ],
      categoryId: "11",
      contentText: "您好",
      labelColor: "purple",
      labelText: "售前",
      opSubUserId: "101",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      sort: 79,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: rejects saving replies without a second-level category", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReply("101", {
        categoryId: 0,
        contentText: "您好",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
      message: "请选择二级分类",
      statusCode: 400,
    });

    expect(repository.hasActiveQuickReplyCategory).not.toHaveBeenCalled();
    expect(repository.isChildQuickReplyCategory).not.toHaveBeenCalled();
    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: rejects saving replies under a first-level category", async () => {
    const repository = createMaterialRepository({
      hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.updateQuickReply("101", "21", {
        categoryId: "10",
        contentText: "您好",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
      message: "请选择二级分类",
      statusCode: 400,
    });

    expect(repository.hasActiveQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "10",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.isChildQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "10",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.updateQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: creates categories at the end of their sibling group", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(12),
      createQuickReplyCategory: vi.fn().mockResolvedValue("301"),
      findQuickReplyCategorySortBoundary: vi.fn().mockResolvedValue(60),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReplyCategory("101", {
        parentId: 0,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        title: "售后",
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.findQuickReplyCategorySortBoundary).toHaveBeenCalledWith({
      boundary: "min",
      parentId: 0,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.createQuickReplyCategory).toHaveBeenCalledWith({
      opSubUserId: "101",
      parentId: 0,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      sort: 59,
      subUserId: "101",
      title: "售后",
      uid: 9001,
    });
  });

  it("quick reply import: creates missing categories and reuses existing categories", async () => {
    const repository = createMaterialRepository({
      createQuickReplyCategory: vi
        .fn()
        .mockResolvedValueOnce("12")
        .mockResolvedValueOnce("20")
        .mockResolvedValueOnce("21"),
      findQuickReplyCategorySortBoundary: vi
        .fn()
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(70),
      listQuickReplyCategories: vi.fn().mockResolvedValue([
        {
          id: "10",
          parentId: 0,
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100,
          title: "售前",
        },
        {
          id: "11",
          parentId: "10",
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100,
          title: "报价",
        },
      ]),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.ensureQuickReplyCategories("101", {
        categories: [
          { children: ["报价", " 跟进 ", "报价"], title: " 售前 " },
          { children: ["致歉"], title: " 售后 " },
        ],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      categories: [
        {
          children: [
            { id: "11", title: "报价" },
            { id: "12", title: "跟进" },
          ],
          id: "10",
          title: "售前",
        },
        {
          children: [{ id: "21", title: "致歉" }],
          id: "20",
          title: "售后",
        },
      ],
      ok: true,
      summary: {
        createdPrimaryCategoryCount: 1,
        createdSecondaryCategoryCount: 2,
      },
    });
    expect(repository.createQuickReplyCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "10",
        title: "跟进",
      }),
    );
    expect(repository.createQuickReplyCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 0,
        title: "售后",
      }),
    );
    expect(repository.createQuickReplyCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "20",
        title: "致歉",
      }),
    );
  });

  it("quick reply import: returns validation errors for invalid category titles", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.ensureQuickReplyCategories("101", {
        categories: [
          {
            children: ["报价"],
            title: "一二三四五六七八九十甲",
          },
        ],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        {
          message: "一级分类名称不能超过10个字",
          rowNumber: 1,
        },
      ],
      ok: false,
    });
    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply import: rejects creating the fifty-first top-level category", async () => {
    const repository = createMaterialRepository({
      listQuickReplyCategories: vi.fn().mockResolvedValue(
        Array.from({ length: 50 }, (_, index) => ({
          id: String(100 + index),
          parentId: 0,
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100 - index,
          title: `分类${index}`,
        })),
      ),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.ensureQuickReplyCategories("101", {
        categories: [{ children: ["二级"], title: "新增分类" }],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        {
          message: "一级分类最多50个",
          rowNumber: 1,
        },
      ],
      ok: false,
    });
    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply import: rejects creating the fifty-first child category", async () => {
    const repository = createMaterialRepository({
      listQuickReplyCategories: vi.fn().mockResolvedValue([
        {
          id: "10",
          parentId: 0,
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100,
          title: "售前",
        },
        ...Array.from({ length: 50 }, (_, index) => ({
          id: String(100 + index),
          parentId: "10",
          scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
          sort: 100 - index,
          title: `二级${index}`,
        })),
      ]),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.ensureQuickReplyCategories("101", {
        categories: [{ children: ["新增二级"], title: "售前" }],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        {
          message: "二级分类最多50个",
          rowNumber: 1,
        },
      ],
      ok: false,
    });
    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects category titles longer than ten characters", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReplyCategory("101", {
        parentId: 0,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        title: "一二三四五六七八九十甲",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_TITLE_TOO_LONG",
      message: "分类名称不能超过10个字",
      statusCode: 400,
    });

    await expect(
      service.renameQuickReplyCategory(
        "101",
        "11",
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        {
          title: "一二三四五六七八九十甲",
        },
      ),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_TITLE_TOO_LONG",
      message: "分类名称不能超过10个字",
      statusCode: 400,
    });

    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
    expect(repository.renameQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects creating more than fifty first-level categories", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(50),
      createQuickReplyCategory: vi.fn().mockResolvedValue("301"),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReplyCategory("101", {
        parentId: 0,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        title: "售后",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_TOP_CATEGORY_LIMIT_EXCEEDED",
      message: "一级分类最多50个",
      statusCode: 400,
    });

    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects creating more than five thousand replies under a first-level category", async () => {
    const repository = createMaterialRepository({
      countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(5_000),
      createQuickReply: vi.fn().mockResolvedValue("501"),
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
      hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReply("101", {
        categoryId: "11",
        contentText: "您好",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
      message: "一级分类下话术最多5000条",
      statusCode: 400,
    });

    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply import: rejects batches that exceed the top-level reply limit", async () => {
    const repository = createMaterialRepository({
      countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(4_999),
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.batchCreateQuickReplies("101", {
        items: [
          {
            categoryId: "11",
            contentText: "第一条",
            labelColor: "",
            labelText: "",
            rowNumber: 2,
          },
          {
            categoryId: "12",
            contentText: "第二条",
            labelColor: "",
            labelText: "",
            rowNumber: 3,
          },
        ],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        {
          message: "一级分类下话术最多5000条",
          rowNumber: 2,
        },
        {
          message: "一级分类下话术最多5000条",
          rowNumber: 3,
        },
      ],
      ok: false,
    });
    expect(repository.countQuickRepliesUnderTopCategory).toHaveBeenCalledWith({
      categoryId: "10",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply import: batch creates valid items in row order", async () => {
    const repository = createMaterialRepository({
      batchCreateQuickReplies: vi.fn().mockResolvedValue(undefined),
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: "10" }),
      findQuickReplySortBoundary: vi
        .fn()
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(120),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.batchCreateQuickReplies("101", {
        items: [
          {
            categoryId: "11",
            contentText: " 第一条 ",
            labelColor: " purple ",
            labelText: " 售前 ",
            rowNumber: 2,
          },
          {
            categoryId: "11",
            contentText: "第二条",
            labelColor: "",
            labelText: "",
            rowNumber: 3,
          },
          {
            categoryId: "12",
            contentText: "第三条",
            labelColor: "teal",
            labelText: "跟进",
            rowNumber: 4,
          },
        ],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      ok: true,
      summary: {
        createdQuickReplyCount: 3,
      },
    });
    expect(repository.createQuickReply).not.toHaveBeenCalled();
    expect(repository.batchCreateQuickReplies).toHaveBeenCalledOnce();
    expect(repository.batchCreateQuickReplies).toHaveBeenCalledWith({
      items: [
        {
          attachments: [],
          categoryId: "11",
          contentText: "第一条",
          labelColor: "purple",
          labelText: "售前",
          sort: 79,
        },
        {
          attachments: [],
          categoryId: "11",
          contentText: "第二条",
          labelColor: "",
          labelText: "",
          sort: 78,
        },
        {
          attachments: [],
          categoryId: "12",
          contentText: "第三条",
          labelColor: "teal",
          labelText: "跟进",
          sort: 119,
        },
      ],
      opSubUserId: "101",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply import: returns validation errors for invalid rows and does not write", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.batchCreateQuickReplies("101", {
        items: [
          {
            categoryId: "11",
            contentText: " ",
            labelColor: "cyan",
            labelText: "一二三四五六七八九十甲",
            rowNumber: 5,
          },
        ],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        { message: "短标题不能超过10个字", rowNumber: 5 },
        { message: "短标题颜色无效", rowNumber: 5 },
        { message: "话术内容不能为空", rowNumber: 5 },
      ],
      ok: false,
    });
    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply import: rejects batch create requests over one hundred items", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.batchCreateQuickReplies("101", {
        items: Array.from({ length: 101 }, (_, index) => ({
          categoryId: "11",
          contentText: `话术${index}`,
          labelColor: "",
          labelText: "",
          rowNumber: index + 1,
        })),
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [
        {
          message: "单次最多导入100条话术",
          rowNumber: 0,
        },
      ],
      ok: false,
    });
    expect(repository.createQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: clamps append sort at zero for unsigned sort columns", async () => {
    const repository = createMaterialRepository({
      countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(120),
      createQuickReply: vi.fn().mockResolvedValue("501"),
      createQuickReplyCategory: vi.fn().mockResolvedValue("301"),
      findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: "10" }),
      findQuickReplyCategorySortBoundary: vi.fn().mockResolvedValue(0),
      findQuickReplySortBoundary: vi.fn().mockResolvedValue(0),
      hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReplyCategory("101", {
        parentId: 0,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        title: "售后",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.createQuickReply("101", {
        attachments: [],
        categoryId: "11",
        contentText: "您好",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.createQuickReplyCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 0,
      }),
    );
    expect(repository.createQuickReply).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: 0,
      }),
    );
  });

  it("quick reply: moves categories and replies before or after their sibling group", async () => {
    const repository = createMaterialRepository({
      bottomQuickReply: vi.fn().mockResolvedValue(true),
      bottomQuickReplyCategory: vi.fn().mockResolvedValue(true),
      findQuickReplyCategorySortBoundary: vi
        .fn()
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(80),
      findQuickReplySortBoundary: vi
        .fn()
        .mockResolvedValueOnce(220)
        .mockResolvedValueOnce(180),
      topQuickReply: vi.fn().mockResolvedValue(true),
      topQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.topQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.PERSONAL),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.topQuickReply("101", "21", QUICK_REPLY_SCOPE_TYPE.PERSONAL),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.bottomQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.PERSONAL),
    ).resolves.toEqual({ ok: true });
    await expect(
      service.bottomQuickReply("101", "21", QUICK_REPLY_SCOPE_TYPE.PERSONAL),
    ).resolves.toEqual({ ok: true });

    expect(repository.topQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      sort: 121,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.topQuickReply).toHaveBeenCalledWith({
      quickReplyId: "21",
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      sort: 221,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.bottomQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      sort: 79,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.bottomQuickReply).toHaveBeenCalledWith({
      quickReplyId: "21",
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      sort: 179,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: moves a second-level category to another first-level category", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(12),
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: 0 }),
      findQuickReplyCategorySortBoundary: vi.fn().mockResolvedValue(80),
      moveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE, {
        parentId: "20",
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.findQuickReplyCategoryScope).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.findQuickReplyCategoryScope).toHaveBeenCalledWith({
      categoryId: "20",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.countChildQuickReplyCategories).toHaveBeenCalledWith({
      categoryId: "20",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.moveQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      parentId: "20",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      sort: 79,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: rejects moving a category when the target first-level category would exceed the reply limit", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(12),
      countQuickRepliesInCategory: vi.fn().mockResolvedValue(300),
      countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(4_800),
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: 0 }),
      moveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE, {
        parentId: "20",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
      message: "一级分类下话术最多5000条",
      statusCode: 400,
    });

    expect(repository.countQuickRepliesUnderTopCategory).toHaveBeenCalledWith({
      categoryId: "20",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.countQuickRepliesInCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.moveQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects moving a category to a full first-level category", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(50),
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: 0 }),
      moveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE, {
        parentId: "20",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CHILD_CATEGORY_LIMIT_EXCEEDED",
      message: "二级分类最多50个",
      statusCode: 400,
    });

    expect(repository.moveQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: moves a reply to another second-level category under the same first-level category", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: "10" }),
      findQuickReplyScope: vi.fn().mockResolvedValue({ categoryId: "11" }),
      findQuickReplySortBoundary: vi.fn().mockResolvedValue(180),
      moveQuickReply: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveQuickReply("101", "21", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE, {
        categoryId: "12",
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.findQuickReplyScope).toHaveBeenCalledWith({
      quickReplyId: "21",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.findQuickReplyCategoryScope).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.findQuickReplyCategoryScope).toHaveBeenCalledWith({
      categoryId: "12",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      subUserId: "101",
      uid: 9001,
    });
    expect(repository.moveQuickReply).toHaveBeenCalledWith({
      categoryId: "12",
      quickReplyId: "21",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      sort: 179,
      subUserId: "101",
      uid: 9001,
    });
  });

  it("quick reply: rejects moving a reply across first-level categories", async () => {
    const repository = createMaterialRepository({
      findQuickReplyCategoryScope: vi
        .fn()
        .mockResolvedValueOnce({ parentId: "10" })
        .mockResolvedValueOnce({ parentId: "20" }),
      findQuickReplyScope: vi.fn().mockResolvedValue({ categoryId: "11" }),
      moveQuickReply: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.moveQuickReply("101", "21", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE, {
        categoryId: "12",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_MOVE_SCOPE_INVALID",
      message: "只能移动到当前一级分类下",
      statusCode: 400,
    });

    expect(repository.moveQuickReply).not.toHaveBeenCalled();
  });

  it("quick reply: rejects creating a third-level category", async () => {
    const repository = createMaterialRepository({
      hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.createQuickReplyCategory("101", {
        parentId: "12",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
        title: "三级分类",
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_DEPTH_UNSUPPORTED",
      message: "最多支持二级分类",
    });

    expect(repository.createQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects deleting a category that has child categories", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(1),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.deleteQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_HAS_CHILDREN",
      message: "请先删除话术分组",
    });

    expect(repository.countQuickRepliesInCategory).not.toHaveBeenCalled();
    expect(repository.deleteQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: rejects deleting a non-empty category", async () => {
    const repository = createMaterialRepository({
      countChildQuickReplyCategories: vi.fn().mockResolvedValue(0),
      countQuickRepliesInCategory: vi.fn().mockResolvedValue(1),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.deleteQuickReplyCategory("101", "11", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_NOT_EMPTY",
      message: "请先删除分组下的话术",
    });

    expect(repository.deleteQuickReplyCategory).not.toHaveBeenCalled();
  });

  it("quick reply: renames categories in the requested scope", async () => {
    const repository = createMaterialRepository();
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.renameQuickReplyCategory(
        "101",
        "11",
        QUICK_REPLY_SCOPE_TYPE.PERSONAL,
        {
          title: "新分类",
        },
      ),
    ).resolves.toEqual({ ok: true });

    expect(repository.renameQuickReplyCategory).toHaveBeenCalledWith({
      categoryId: "11",
      scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      subUserId: "101",
      title: "新分类",
      uid: 9001,
    });
  });

  it("quick reply: rejects category updates when the category is not found", async () => {
    const repository = createMaterialRepository({
      renameQuickReplyCategory: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.renameQuickReplyCategory(
        "101",
        "11",
        QUICK_REPLY_SCOPE_TYPE.PERSONAL,
        {
          title: "新分类",
        },
      ),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_CATEGORY_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("quick reply: rejects reply updates when the quick reply is not found", async () => {
    const repository = createMaterialRepository({
      isChildQuickReplyCategory: vi.fn().mockResolvedValue(true),
      updateQuickReply: vi.fn().mockResolvedValue(false),
    });
    const service = new MysqlWorkbenchService(repository, createJavaClient());

    await expect(
      service.updateQuickReply("101", "21", {
        categoryId: "11",
        contentText: "您好",
        scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      }),
    ).rejects.toMatchObject({
      code: "QUICK_REPLY_NOT_FOUND",
      statusCode: 404,
    });
  });
});

function createMaterialRepository(overrides: Partial<WorkbenchRepository> = {}) {
  return {
    bottomQuickReply: vi.fn().mockResolvedValue(true),
    bottomQuickReplyCategory: vi.fn().mockResolvedValue(true),
    countChildQuickReplyCategories: vi.fn().mockResolvedValue(0),
    countQuickRepliesUnderTopCategory: vi.fn().mockResolvedValue(0),
    createMaterialCollection: vi.fn().mockResolvedValue("66"),
    createMaterialGroup: vi.fn().mockResolvedValue(undefined),
    batchCreateQuickReplies: vi.fn().mockResolvedValue(undefined),
    createQuickReply: vi.fn().mockResolvedValue("501"),
    createQuickReplyCategory: vi.fn().mockResolvedValue("301"),
    canAccessSeat: vi.fn().mockResolvedValue(true),
    countMaterialGroups: vi.fn().mockResolvedValue(0),
    countQuickRepliesInCategory: vi.fn().mockResolvedValue(0),
    deleteMaterialCollection: vi.fn().mockResolvedValue(undefined),
    deleteMaterialGroup: vi.fn().mockResolvedValue(undefined),
    deleteQuickReply: vi.fn().mockResolvedValue(true),
    deleteQuickReplyCategory: vi.fn().mockResolvedValue(true),
    findMaterialCollectionScope: vi.fn().mockResolvedValue({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      subUid: 0,
    }),
    findMaterialCollectionByMessage: vi.fn().mockResolvedValue(undefined),
    findMaterialCollectionRecord: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        fileName: "报价.pdf",
        fileUrl: "https://cdn.example.com/a.pdf",
      }),
      id: "66",
    }),
    findMaterialCollectionForForward: vi.fn().mockResolvedValue({
      content: JSON.stringify({ title: "客户跟进小程序" }),
      msgInfoId: "1025657",
    }),
    findMaterialMessage: vi.fn().mockResolvedValue(undefined),
    findQuickReplyCategoryScope: vi.fn().mockResolvedValue({ parentId: 0 }),
    findQuickReplyCategorySortBoundary: vi.fn().mockResolvedValue(undefined),
    findQuickReplyScope: vi.fn().mockResolvedValue({ categoryId: "11" }),
    findQuickReplySortBoundary: vi.fn().mockResolvedValue(undefined),
    getSubUser: vi.fn().mockResolvedValue({
      displayName: "客服一号",
      platform: 5,
      subUserId: "101",
      uid: 9001,
    }),
    hasActiveMaterialGroup: vi.fn().mockResolvedValue(true),
    hasActiveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    isChildQuickReplyCategory: vi.fn().mockResolvedValue(false),
    isMaterialGroupEmpty: vi.fn().mockResolvedValue(true),
    listActiveQuickReplyCategorySortItems: vi.fn().mockResolvedValue([]),
    listActiveQuickReplySortItems: vi.fn().mockResolvedValue([]),
    listMaterialCollections: vi.fn().mockResolvedValue([]),
    listMaterialGroups: vi.fn().mockResolvedValue([]),
    listQuickReplies: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listQuickReplyCategories: vi.fn().mockResolvedValue([]),
    moveMaterialCollection: vi.fn().mockResolvedValue(undefined),
    moveQuickReply: vi.fn().mockResolvedValue(true),
    moveQuickReplyCategory: vi.fn().mockResolvedValue(true),
    renameMaterialGroup: vi.fn().mockResolvedValue(undefined),
    renameQuickReplyCategory: vi.fn().mockResolvedValue(true),
    restoreMaterialCollection: vi.fn().mockResolvedValue(undefined),
    topMaterialCollection: vi.fn().mockResolvedValue(undefined),
    topMaterialGroup: vi.fn().mockResolvedValue(undefined),
    topQuickReply: vi.fn().mockResolvedValue(true),
    topQuickReplyCategory: vi.fn().mockResolvedValue(true),
    updateMaterialCollectionContent: vi.fn().mockResolvedValue(undefined),
    updateQuickReply: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as WorkbenchRepository;
}

function createMaterialItem(
  overrides: Partial<WorkbenchMaterialCollectionItemDto> = {},
): WorkbenchMaterialCollectionItemDto {
  return {
    bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
    content: { fileName: "报价.pdf" },
    contentType: "file",
    groupId: 0,
    id: "66",
    msgInfoId: "9001",
    sort: 100,
    title: "报价.pdf",
    ...overrides,
  };
}

function createMessageDto(input: {
  rawMsgtype?: string;
  senderType: "agent" | "customer" | "system";
  seq: number;
}) {
  return {
    content: {
      text: `消息 ${input.seq}`,
    },
    contentType: "text" as const,
    conversationId: "88",
    customerId: "external-001",
    messageId: `msg-${input.seq}`,
    rawMsgtype: input.rawMsgtype ?? "text",
    seatId: "12",
    senderType: input.senderType,
    seq: input.seq,
    status: "sent" as const,
  };
}

function createJavaClient(): WorkbenchJavaClient {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    downloadMsgFile: vi.fn().mockResolvedValue(undefined),
    getUploadCredential: vi.fn(),
    listUserHistoryAnswers: vi.fn().mockResolvedValue({ suggestions: [] }),
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    markConversationUnread: vi.fn().mockResolvedValue(undefined),
    pinConversation: vi.fn().mockResolvedValue(undefined),
    requestAutoGeneralAnswer: vi.fn().mockResolvedValue({ id: "1" }),
    requestGeneralAnswer: vi.fn().mockResolvedValue({ suggestion: null }),
    recognizeSentence: vi.fn().mockResolvedValue("这是一段语音转文字测试文本"),
    revokeMessage: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    sendSmartHeartbeat: vi.fn().mockResolvedValue(undefined),
    takeOverSeat: vi.fn().mockResolvedValue(undefined),
    updateMessageContent: vi.fn().mockResolvedValue(undefined),
    unpinConversation: vi.fn().mockResolvedValue(undefined),
  };
}

function createLoggerMock() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

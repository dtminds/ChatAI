import { describe, expect, it, vi } from "vitest";
import { MysqlWorkbenchService } from "../../../src/modules/chat/workbench.service.js";
import type { WorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import { BadGatewayError } from "../../../src/shared/errors.js";

describe("MysqlWorkbenchService", () => {
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
    const getSeat = vi.fn().mockResolvedValue({
      avatar: "",
      description: "私域客户管理",
      hostSubUserId: "101",
      lastMessageTime: 123,
      loginStatus: "online",
      name: "德瑞可",
      operatorName: "小可",
      phone: "13296712905",
      seatId: "12",
      thirdUserId: "zhangsan",
      unreadCount: 6,
    });
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
      seat: expect.objectContaining({
        hostSubUserId: "101",
        seatId: "12",
      }),
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
        getSeatUnreadCountAfterMarkRead: vi.fn().mockResolvedValue(5),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    const result = await service.markConversationRead("101", "88");

    expect(javaClient.markConversationRead).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });
    expect(result).toEqual({
      conversationId: "88",
      seatId: "12",
      seatUnreadCount: 5,
      unreadCount: 0,
    });
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
          unreadCount: 0,
          seatUnreadCount: 5,
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

  it("marks a taken-over read conversation unread and increments seat unread count once", async () => {
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
          unreadCount: 0,
          seatUnreadCount: 5,
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
      seatUnreadCount: 6,
      unreadCount: 1,
    });
  });

  it("normalizes an already unread conversation to one unread count", async () => {
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
          unreadCount: 5,
          seatUnreadCount: 9,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    const result = await service.markConversationUnread("101", "88");

    expect(result).toEqual({
      conversationId: "88",
      seatId: "12",
      seatUnreadCount: 5,
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
          seatUnreadCount: 9,
          uid: 9001,
          unreadCount: 2,
        }),
        hideConversation,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(service.deleteConversation("101", "88")).resolves.toEqual({
      conversationId: "88",
      seatId: "12",
      seatUnreadCount: 7,
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
      new BadGatewayError("JAVA_INTERNAL_API_FAILED", "Java 内部工作台接口调用失败"),
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
      code: "JAVA_INTERNAL_API_FAILED",
      statusCode: 502,
    });

    expect(logger.error).not.toHaveBeenCalled();
  });

  it("starts message file transfer with the audit msgid in an accessible conversation", async () => {
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
      service.downloadMessageFile("101", "88", "remote-msg-file-001"),
    ).resolves.toEqual({
      messageId: "remote-msg-file-001",
      status: "accepted",
    });
    expect(javaClient.downloadMsgFile).toHaveBeenCalledWith({
      msgid: "remote-msg-file-001",
      platform: 5,
      uid: 9001,
    });
  });

  it("rejects message file transfer when msgid is empty", async () => {
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
      service.downloadMessageFile("101", "88", "  "),
    ).rejects.toMatchObject({
      code: "INVALID_MESSAGE_ID",
      statusCode: 400,
    });
    expect(javaClient.downloadMsgFile).not.toHaveBeenCalled();
  });

  it("polls new-message conversation changes for the current seat", async () => {
    const javaClient = createJavaClient();
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
    const getSeat = vi.fn().mockResolvedValue({
      avatar: "",
      description: "私域客户管理",
      lastMessageTime: 1_778_840_001_000,
      loginStatus: "online",
      name: "德瑞可",
      operatorName: "小可",
      phone: "13296712905",
      seatId: "12",
      unreadCount: 7,
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
        getSeat,
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
      limit: 50,
    });
    expect(getSeat).toHaveBeenCalledWith("12");
  });

  it("polls active conversation messages through the shared message page query", async () => {
    const javaClient = createJavaClient();
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
          status: "read",
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
          status: "read",
        },
      ],
      scannedCount: 2,
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
        getSeat: vi.fn().mockResolvedValue(undefined),
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
    expect(listMessages).toHaveBeenCalledWith("88", {
      beforeSeq: undefined,
      limit: 50,
    });
  });

  it("returns message update events only for the active conversation", async () => {
    const javaClient = createJavaClient();
    const listMessageUpdateEvents = vi.fn().mockResolvedValue([
      {
        conversationId: "88",
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
        getSeat: vi.fn().mockResolvedValue(undefined),
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
      limit: 50,
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
        getSeat: vi.fn().mockResolvedValue(undefined),
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
        getSeat: vi.fn().mockResolvedValue(undefined),
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
        getSeat: vi.fn().mockResolvedValue(undefined),
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

  it("maps a group text send with mentions to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-001",
      messageId: "opt-001",
      optNo: "opt-001",
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
          seatUnreadCount: 0,
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
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
      message: {
        atLocation: 1,
        atWxSerialNos: ["member-user", "member-rui"],
        isHit: 2,
        msgContent: "今天统一看群公告",
        msgNum: 1,
        msgType: 2001,
      },
      platform: 5,
      sendType: 2,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
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
          seatUnreadCount: 0,
          thirdGroupId: "group-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
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
      message: {
        atLocation: 0,
        isHit: 1,
        msgContent: "大家看一下",
        msgNum: 1,
        msgType: 2001,
      },
      platform: 5,
      sendType: 2,
      thirdGroupId: "group-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("maps a quoted text send to the Java quote payload from audit extend data", async () => {
    const javaClient = createJavaClient();
    const getQuoteContentBase64 = vi.fn().mockResolvedValue("base64-quote-content");
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
        getQuoteContentBase64,
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

    expect(getQuoteContentBase64).toHaveBeenCalledWith({
      messageId: "remote-msg-538",
      platform: 5,
      uid: 9001,
    });
    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-quote-001",
      message: {
        msgContent: "正式引用消息",
        msgNum: 1,
        msgType: 2033,
        quoteContentBase64: "base64-quote-content",
      },
      platform: 5,
      sendType: 1,
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
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
      message: {
        msgContent: "https://b5.bokr.com.cn/s5/upload/a.png",
        msgNum: 1,
        msgType: 2002,
      },
      platform: 5,
      sendType: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("ignores quote payload for image sends", async () => {
    const javaClient = createJavaClient();
    const getQuoteContentBase64 = vi.fn().mockResolvedValue("base64-quote-content");
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
        getQuoteContentBase64,
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

    expect(getQuoteContentBase64).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          msgContent: "https://b5.bokr.com.cn/s5/upload/a.png",
          msgNum: 1,
          msgType: 2002,
        },
      }),
    );
  });

  it("maps a file send to the Java send-message payload", async () => {
    const javaClient = createJavaClient();
    vi.mocked(javaClient.sendMessage).mockResolvedValue({
      clientMessageId: "local-file-001",
      messageId: "opt-file-001",
      optNo: "opt-file-001",
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await service.sendMessage("101", {
      clientMessageId: "local-file-001",
      conversationId: "88",
      seatId: "12",
      segment: {
        extension: "pdf",
        fileId: "chat-files/quote.pdf",
        fileName: "报价单.pdf",
        fileSize: 6389760,
        fileSizeLabel: "6.09 MB",
        type: "file",
        url: "https://b5.bokr.com.cn/chat-files/quote.pdf",
      },
    });

    expect(javaClient.sendMessage).toHaveBeenCalledWith({
      clientMessageId: "local-file-001",
      message: {
        msgContent: "报价单.pdf",
        msgNum: 1,
        msgType: 2010,
        vcHref: "https://b5.bokr.com.cn/chat-files/quote.pdf",
        vcTitle: "报价单.pdf",
      },
      platform: 5,
      sendType: 1,
      thirdExternalUserid: "external-001",
      thirdUserId: "seat-user-001",
      uid: 9001,
    });
  });

  it("ignores quote payload for file sends", async () => {
    const javaClient = createJavaClient();
    const getQuoteContentBase64 = vi.fn().mockResolvedValue("base64-quote-content");
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
        }),
        getQuoteContentBase64,
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

    expect(getQuoteContentBase64).not.toHaveBeenCalled();
    expect(javaClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: {
          msgContent: "报价单.pdf",
          msgNum: 1,
          msgType: 2010,
          vcHref: "https://b5.bokr.com.cn/chat-files/quote.pdf",
          vcTitle: "报价单.pdf",
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
          seatUnreadCount: 0,
          thirdExternalUserId: "external-001",
          thirdUserId: "seat-user-001",
          uid: 9001,
          unreadCount: 0,
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
});

function createJavaClient(): WorkbenchJavaClient {
  return {
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    downloadMsgFile: vi.fn().mockResolvedValue(undefined),
    getUploadCredential: vi.fn(),
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    markConversationUnread: vi.fn().mockResolvedValue(undefined),
    pinConversation: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    takeOverSeat: vi.fn().mockResolvedValue(undefined),
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

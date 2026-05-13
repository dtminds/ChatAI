import { describe, expect, it, vi } from "vitest";
import { MysqlWorkbenchService } from "../../../src/modules/chat/workbench.service.js";
import type { WorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

describe("MysqlWorkbenchService", () => {
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
      code: "ACCOUNT_NOT_FOUND",
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
});

function createJavaClient(): WorkbenchJavaClient {
  return {
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    markConversationUnread: vi.fn().mockResolvedValue(undefined),
    pinConversation: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    takeOverSeat: vi.fn().mockResolvedValue(undefined),
    unpinConversation: vi.fn().mockResolvedValue(undefined),
  };
}

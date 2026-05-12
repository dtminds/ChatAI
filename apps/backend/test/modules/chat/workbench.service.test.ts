import { describe, expect, it, vi } from "vitest";
import { MysqlWorkbenchService } from "../../../src/modules/chat/workbench.service.js";
import type { WorkbenchJavaClient } from "../../../src/modules/chat/workbench-java-client.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

describe("MysqlWorkbenchService", () => {
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
        listConversations: vi.fn().mockResolvedValue([
          {
            conversationId: "88",
            seatId: "12",
            unreadCount: 3,
          },
          {
            conversationId: "89",
            seatId: "12",
            unreadCount: 5,
          },
        ]),
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    const result = await service.markConversationRead("101", "88");

    expect(javaClient.markConversationRead).toHaveBeenCalledWith({
      conversationId: "88",
      platform: 5,
      seatId: "12",
      uid: 9001,
    });
    expect(result).toEqual({
      conversationId: "88",
      seatId: "12",
      seatUnreadCount: 5,
      unreadCount: 0,
    });
  });
});

function createJavaClient(): WorkbenchJavaClient {
  return {
    markConversationRead: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn(),
    takeOverSeat: vi.fn(),
  };
}

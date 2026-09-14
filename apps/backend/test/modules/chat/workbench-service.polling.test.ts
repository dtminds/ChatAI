import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";
import {
  createActiveSubUser,
  createJavaClient,
  createLoggerMock,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService polling facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
    const service = createWorkbenchService(
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
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
      afterSeq: 5,
      includeHiddenConversation: true,
      limit: 50,
    });
    expect(getSeatsByIds).toHaveBeenCalledWith(["12"]);
  });

  it("validates the sub user before polling a current seat", async () => {
    const javaClient = createJavaClient();
    const canAccessSeat = vi.fn().mockResolvedValue(true);
    const listChangedConversations = vi.fn().mockResolvedValue({
      hasMore: false,
      items: [],
      nextVersion: 1_778_840_000_000,
    });
    const service = createWorkbenchService(
      {
        canAccessSeat,
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(undefined),
        listChangedConversations,
      } as unknown as WorkbenchRepository,
      javaClient,
    );

    await expect(
      service.poll("101", {
        currentSeatId: "12",
        sinceVersion: 1_778_840_000_000,
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(canAccessSeat).not.toHaveBeenCalled();
    expect(listChangedConversations).not.toHaveBeenCalled();
  });

  it("polls user-seat update events and refreshes changed seats", async () => {
    const javaClient = createJavaClient();
    const getSeatsByIds = vi.fn(async (seatIds: string[]) =>
      seatIds
        .slice()
        .sort()
        .map((seatId) => ({
          avatar: "",
          bizStatus: seatId === "12" ? 1 : 0,
          description: "私域客户管理",
          expireTime: seatId === "12" ? undefined : 1_779_000_000,
          hostSubUserId: seatId === "12" ? "101" : "202",
          lastMessageTime: seatId === "12" ? 1_778_840_001_000 : 1_778_840_002_000,
          loginStatus: seatId === "12" ? ("online" as const) : ("offline" as const),
          name: seatId === "12" ? "德瑞可" : "念都堂",
          operatorName: "小可",
          phone: "13296712905",
          thirdUserId: seatId === "12" ? "third-12" : "third-13",
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
          avatar: "",
          bizStatus: 1,
          description: "私域客户管理",
          hostSubUserId: "101",
          loginStatus: "online",
          name: "德瑞可",
          operatorName: "小可",
          phone: "13296712905",
          seatId: "12",
          thirdUserId: "third-12",
          unreadCount: 7,
        },
        {
          avatar: "",
          bizStatus: 0,
          description: "私域客户管理",
          expireTime: 1_779_000_000,
          hostSubUserId: "202",
          loginStatus: "offline",
          name: "念都堂",
          operatorName: "小可",
          phone: "13296712905",
          seatId: "13",
          thirdUserId: "third-13",
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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

  it("polls active conversation messages through the shared message page query", async () => {
    const javaClient = createJavaClient();
    const canAccessSeat = vi.fn().mockResolvedValue(true);
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
          msgid: "remote-msg-101",
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
          msgid: "remote-msg-103",
          seatId: "12",
          senderType: "system",
          seq: 103,
          status: "sent",
        },
      ],
      scannedCount: 2,
    });
    const service = createWorkbenchService(
      {
        canAccessSeat,
        getConversationLookup,
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
          msgid: "remote-msg-103",
        },
      ],
    });
    expect(getConversationLookup).toHaveBeenCalledWith("88");
    expect(listMessages).toHaveBeenCalledWith("88", {
      afterSeq: 101,
      includeHiddenConversation: true,
      limit: 50,
    });
    expect(canAccessSeat).toHaveBeenNthCalledWith(
      2,
      {
        platform: 5,
        subUserId: "101",
        uid: 9001,
      },
      "12",
    );
  });

  it("returns message update events only for the active conversation", async () => {
    const javaClient = createJavaClient();
    const listMessageUpdateEvents = vi.fn().mockResolvedValue([
      {
        conversationId: "88",
        eventTime: 1_778_840_003_000,
        eventId: 4,
        messageSeq: 829,
      },
    ]);
    const service = createWorkbenchService(
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
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
            messageSeq: 829,
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeatsByIds: vi.fn().mockResolvedValue([]),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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
    const service = createWorkbenchService(
      {
        canAccessSeat: vi.fn().mockResolvedValue(true),
        getSeat: vi.fn(),
        getSubUser: vi.fn().mockResolvedValue(createActiveSubUser()),
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

});

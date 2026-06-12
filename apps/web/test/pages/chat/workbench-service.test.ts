import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import { requestInstance } from "@/lib/request";
import { createHttpWorkbenchService, createWorkbenchService } from "@/pages/chat/api/workbench-service";

const mock = new MockAdapter(requestInstance);

describe("createWorkbenchService", () => {
  afterEach(() => {
    mock.reset();
  });

  it("uses the HTTP workbench service by default", async () => {
    const service = createWorkbenchService();

    await expect(service.getMe()).rejects.toMatchObject({
      message: expect.any(String),
    });
  });

  it("fetches my customers with seat filters", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/customers").reply((config) => [
      200,
      {
        hasMore: false,
        items: [],
        receivedParams: config.params,
        total: 0,
      },
    ]);

    await expect(
      service.getCustomers({ scope: "mine", seatIds: ["12", "13"] }),
    ).resolves.toEqual({
      hasMore: false,
      items: [],
      receivedParams: {
        cursor: undefined,
        keyword: undefined,
        limit: undefined,
        scope: "mine",
        seat_ids: "12,13",
      },
      total: 0,
    });
    expect(mock.history.get[0]?.params).toEqual({
      cursor: undefined,
      keyword: undefined,
      limit: undefined,
      scope: "mine",
      seat_ids: "12,13",
    });
  });

  it("passes customer pagination and search params", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/customers").reply((config) => [
      200,
      {
        hasMore: false,
        items: [],
        receivedParams: config.params,
        total: 0,
      },
    ]);

    await expect(
      service.getCustomers({
        cursor: "cursor-1",
        keyword: "张三",
        limit: 50,
        scope: "mine",
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        cursor: "cursor-1",
        keyword: "张三",
        limit: 50,
        scope: "mine",
      },
    });
  });

  it("fetches all customers without seat filters", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/customers").reply(200, {
      hasMore: false,
      items: [],
      total: 0,
    });

    await expect(
      service.getCustomers({ scope: "all", seatIds: ["12"] }),
    ).resolves.toEqual({ hasMore: false, items: [], total: 0 });
    expect(mock.history.get[0]?.params).toEqual({
      cursor: undefined,
      keyword: undefined,
      limit: undefined,
      scope: "all",
      seat_ids: undefined,
    });
  });

  it("fetches one customer last conversation on demand", async () => {
    const service = createHttpWorkbenchService();
    mock
      .onGet("/server/customers/external-a/last-conversation")
      .reply(200, {
        lastConversation: {
          conversationId: "701",
          lastMessageTime: 1_779_600_000_000,
          seatAvatar: "",
          seatId: "12",
          seatName: "销售一号",
        },
      });

    await expect(service.getCustomerLastConversation("external-a")).resolves.toEqual({
      lastConversation: {
        conversationId: "701",
        lastMessageTime: 1_779_600_000_000,
        seatAvatar: "",
        seatId: "12",
        seatName: "销售一号",
      },
    });
    expect(mock.history.get[0]?.url).toBe(
      "/server/customers/external-a/last-conversation",
    );
  });

  it("fetches customer relation conversation timestamps on demand", async () => {
    const service = createHttpWorkbenchService();
    mock
      .onGet("/server/customers/external-a/relation-conversations")
      .reply((config) => [
        200,
        {
          items: [
            {
              lastMessageTime: 1_779_600_000_000,
              thirdUserId: "seat-user-12",
            },
          ],
          receivedParams: config.params,
        },
      ]);

    await expect(
      service.getCustomerRelationConversations("external-a", ["seat-user-12"]),
    ).resolves.toEqual({
      items: [
        {
          lastMessageTime: 1_779_600_000_000,
          thirdUserId: "seat-user-12",
        },
      ],
      receivedParams: {
        third_userids: "seat-user-12",
      },
    });
  });

  it("lists material collections with biz type and group params", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/material-collections").reply((config) => [
      200,
      {
        groups: [],
        items: [],
        receivedParams: config.params,
      },
    ]);

    await expect(
      service.listMaterialCollections({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        group_id: "9",
      },
    });
  });

  it("collects material messages", async () => {
    const service = createHttpWorkbenchService();
    mock.onPost("/server/material-collections").reply((config) => [
      200,
      {
        item: { id: "1" },
        receivedBody: JSON.parse(String(config.data)),
      },
    ]);

    await expect(
      service.collectMaterial({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        messageId: "msg-file-001",
      }),
    ).resolves.toMatchObject({
      receivedBody: {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        messageId: "msg-file-001",
      },
    });
  });
});

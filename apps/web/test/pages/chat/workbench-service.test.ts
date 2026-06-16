import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE, QUICK_REPLY_SCOPE_TYPE } from "@chatai/contracts";
import { requestInstance } from "@/lib/request";
import {
  createHttpWorkbenchService,
  createMockWorkbenchService,
  createWorkbenchService,
} from "@/pages/chat/api/workbench-service";

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

  it("lists material groups and paginated collections with explicit params", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/material-collections/groups").reply((config) => [
      200,
      {
        groups: [],
        receivedParams: config.params,
      },
    ]);
    mock.onGet("/server/material-collections/materials").reply((config) => [
      200,
      {
        items: [],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 100,
          total: 0,
        },
        receivedParams: config.params,
      },
    ]);

    await expect(
      service.listMaterialGroups({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      },
    });
    await expect(
      service.listMaterialCollections({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        groupId: "9",
        page: 1,
        pageSize: 100,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        biz_type: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        group_id: "9",
        page: 1,
        page_size: 100,
      },
    });
  });

  it("lists quick reply categories and replies with explicit params", async () => {
    const service = createHttpWorkbenchService();
    mock.onGet("/server/quick-replies/categories").reply((config) => [
      200,
      {
        categories: [],
        receivedParams: config.params,
      },
    ]);
    mock.onGet("/server/quick-replies/category-content").reply((config) => [
      200,
      {
        categories: [],
        limits: {
          categories: 50,
          quickReplies: 10_000,
        },
        quickRepliesByCategoryId: {},
        receivedParams: config.params,
        truncated: {
          categories: false,
          quickReplies: false,
        },
      },
    ]);
    mock.onGet("/server/quick-replies").reply((config) => [
      200,
      {
        items: [],
        pagination: {
          hasMore: false,
          page: 1,
          pageSize: 50,
          total: 0,
        },
        receivedParams: config.params,
      },
    ]);

    await expect(
      service.listQuickReplyCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        scope_type: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      },
    });
    await expect(
      service.listQuickReplyCategoryContent({
        parentCategoryId: "10",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        parent_category_id: "10",
        scope_type: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      },
    });
    await expect(
      service.listQuickReplies({
        categoryId: "11",
        keyword: "退款",
        page: 1,
        pageSize: 50,
        scopeType: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        category_id: "11",
        keyword: "退款",
        page: 1,
        page_size: 50,
        scope_type: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      },
    });
  });

  it("passes quick reply management scope params", async () => {
    const service = createHttpWorkbenchService();
    mock.onPatch("/server/quick-replies/categories/11").reply((config) => [
      200,
      {
        ok: true,
        receivedData: JSON.parse(config.data),
        receivedParams: config.params,
      },
    ]);
    mock.onPost("/server/quick-replies/22/top").reply((config) => [
      200,
      {
        ok: true,
        receivedParams: config.params,
      },
    ]);

    await expect(
      service.renameQuickReplyCategory(
        "11",
        QUICK_REPLY_SCOPE_TYPE.PERSONAL,
        { title: "售后" },
      ),
    ).resolves.toMatchObject({
      receivedData: { title: "售后" },
      receivedParams: {
        scope_type: QUICK_REPLY_SCOPE_TYPE.PERSONAL,
      },
    });
    await expect(
      service.topQuickReply("22", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE),
    ).resolves.toMatchObject({
      receivedParams: {
        scope_type: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      },
    });
  });

  it("collects material messages", async () => {
    const service = createHttpWorkbenchService();
    mock.onPost("/server/material-collections").reply((config) => [
      200,
      {
        success: true,
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

  it("creates material groups and returns the group payload", async () => {
    const service = createHttpWorkbenchService();
    mock.onPost("/server/material-collections/groups").reply((config) => [
      200,
      {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        id: "group-created",
        sort: 1_781_244_000_000,
        title: "售后文件",
        receivedBody: JSON.parse(String(config.data)),
      },
    ]);

    await expect(
      service.createMaterialGroup({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "售后文件",
      }),
    ).resolves.toMatchObject({
      id: "group-created",
      receivedBody: {
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
        title: "售后文件",
      },
    });
  });

  it("keeps mock quick reply category deletion aligned with backend constraints", async () => {
    const service = createMockWorkbenchService();

    await service.createQuickReplyCategory({
      parentId: 0,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      title: "售前",
    });
    const parentCategory = (
      await service.listQuickReplyCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      })
    ).categories[0];

    await service.createQuickReplyCategory({
      parentId: parentCategory.id,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      title: "报价",
    });

    await expect(
      service.deleteQuickReplyCategory(
        parentCategory.id,
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      ),
    ).rejects.toThrow("请先删除子分类");

    const childCategory = (
      await service.listQuickReplyCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      })
    ).categories.find((category) => category.parentId === parentCategory.id);

    await service.createQuickReply({
      attachments: [],
      categoryId: childCategory?.id ?? "",
      contentText: "您好",
      labelColor: "",
      labelText: "",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    });

    await expect(
      service.deleteQuickReplyCategory(
        childCategory?.id ?? "",
      QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    ),
  ).rejects.toThrow("请先删除分类下的话术");
  });

  it("keeps mock quick reply payload validation aligned with backend constraints", async () => {
    const service = createMockWorkbenchService();
    const invalidAttachments = [
      {
        content: {
          fileUrl: "https://example.com/video.mp4",
        },
        type: "video",
      },
    ] as never;

    await expect(
      service.createQuickReply({
        attachments: invalidAttachments,
        contentText: "请查看附件",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toThrow("附件类型不支持");
  });
});

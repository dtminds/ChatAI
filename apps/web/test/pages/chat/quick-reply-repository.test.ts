// @vitest-environment node

import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { QUICK_REPLY_SCOPE_TYPE } from "@chatai/contracts";
import { requestInstance } from "@/lib/request";
import { createHttpQuickReplyRepository } from "@/pages/chat/api/quick-reply-http-repository";
import { createMockQuickReplyRepository } from "@/pages/chat/api/quick-reply-mock-repository";

const mock = new MockAdapter(requestInstance);

describe("QuickReplyRepository", () => {
  afterEach(() => {
    mock.reset();
  });

  it("maps quick reply list filters to explicit HTTP params", async () => {
    const repository = createHttpQuickReplyRepository();

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
      repository.listCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toMatchObject({
      receivedParams: {
        scope_type: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      },
    });
    await expect(
      repository.listCategoryContent({
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
      repository.listQuickReplies({
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

  it("passes management scope params through the HTTP adapter", async () => {
    const repository = createHttpQuickReplyRepository();

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
      repository.renameCategory(
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
      repository.topQuickReply("22", QUICK_REPLY_SCOPE_TYPE.ENTERPRISE),
    ).resolves.toMatchObject({
      receivedParams: {
        scope_type: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      },
    });
  });

  it("posts import ensure and batch requests through the HTTP adapter", async () => {
    const repository = createHttpQuickReplyRepository();

    mock.onPost("/server/quick-replies/categories/ensure").reply(200, {
      categories: [],
      ok: true,
      summary: {
        createdPrimaryCategoryCount: 0,
        createdSecondaryCategoryCount: 0,
      },
    });
    mock.onPost("/server/quick-replies/batch").reply(200, {
      ok: true,
      summary: { createdQuickReplyCount: 1 },
    });

    await repository.ensureCategories({ categories: [], scopeType: 1 });
    await repository.batchCreateQuickReplies({
      items: [
        {
          categoryId: "11",
          contentText: "您好",
          labelColor: "",
          labelText: "",
          rowNumber: 2,
        },
      ],
      scopeType: 1,
    });

    expect(mock.history.post.map((request) => request.url)).toEqual([
      "/server/quick-replies/categories/ensure",
      "/server/quick-replies/batch",
    ]);
  });

  it("keeps mock category deletion aligned with backend constraints", async () => {
    const repository = createMockQuickReplyRepository();

    await repository.createCategory({
      parentId: 0,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      title: "售前",
    });
    const parentCategory = (
      await repository.listCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      })
    ).categories[0];

    await repository.createCategory({
      parentId: parentCategory.id,
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      title: "报价",
    });

    await expect(
      repository.deleteCategory(
        parentCategory.id,
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      ),
    ).rejects.toThrow("请先删除话术分组");

    const childCategory = (
      await repository.listCategories({
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      })
    ).categories.find((category) => category.parentId === parentCategory.id);

    await repository.createQuickReply({
      attachments: [],
      categoryId: childCategory?.id ?? "",
      contentText: "您好",
      labelColor: "",
      labelText: "",
      scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
    });

    await expect(
      repository.deleteCategory(
        childCategory?.id ?? "",
        QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      ),
    ).rejects.toThrow("请先删除分组下的话术");
  });

  it("keeps mock payload validation aligned with backend constraints", async () => {
    const repository = createMockQuickReplyRepository();
    const invalidAttachments = [
      {
        content: {
          fileUrl: "https://example.com/video.mp4",
        },
        type: "video",
      },
    ] as never;

    await expect(
      repository.createQuickReply({
        attachments: invalidAttachments,
        contentText: "请查看附件",
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).rejects.toThrow("附件类型不支持");

    await expect(
      repository.batchCreateQuickReplies({
        items: null,
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      } as never),
    ).resolves.toEqual({
      errorMsg: "导入数据有误",
      errors: [{ message: "请填写话术", rowNumber: 0 }],
      ok: false,
    });
  });
});

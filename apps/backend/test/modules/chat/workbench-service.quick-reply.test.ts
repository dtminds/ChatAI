import { afterEach, describe, expect, it, vi } from "vitest";
import { QUICK_REPLY_SCOPE_TYPE } from "@chatai/contracts";
import {
  createJavaClient,
  createMaterialRepository,
  createWorkbenchService,
} from "./workbench-service.test-helpers.js";

describe("MysqlWorkbenchService quick reply facade", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

    await expect(
      service.sortQuickReplies("101", {
        categoryId: "21",
        quickReplyIds: ["31", "32", "33"],
        scopeType: QUICK_REPLY_SCOPE_TYPE.ENTERPRISE,
      }),
    ).resolves.toEqual({ ok: true });

    expect(repository.sortQuickReplies).not.toHaveBeenCalled();
  });

  it("quick reply: rejects saving an empty quick reply", async () => {
    const repository = createMaterialRepository();
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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
    const service = createWorkbenchService(repository, createJavaClient());

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

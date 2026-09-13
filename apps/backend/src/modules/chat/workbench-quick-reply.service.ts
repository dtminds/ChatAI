import {
  QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
  QUICK_REPLY_CHILD_CATEGORY_LIMIT,
  QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT,
  QUICK_REPLY_TOP_CATEGORY_LIMIT,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
  type QuickReplyScopeType,
  type WorkbenchQuickReplyBatchCreateRequest,
  type WorkbenchQuickReplyBatchCreateResponse,
  type WorkbenchQuickReplyCategoryContentRequest,
  type WorkbenchQuickReplyCategoryContentResponse,
  type WorkbenchQuickReplyCategoryCreateRequest,
  type WorkbenchQuickReplyCategoryEnsureRequest,
  type WorkbenchQuickReplyCategoryEnsureResponse,
  type WorkbenchQuickReplyCategoryEnsureSuccessResponse,
  type WorkbenchQuickReplyCategoryListRequest,
  type WorkbenchQuickReplyCategoryListResponse,
  type WorkbenchQuickReplyCategoryMoveRequest,
  type WorkbenchQuickReplyCategorySortRequest,
  type WorkbenchQuickReplyCategoryUpdateRequest,
  type WorkbenchQuickReplyCreateRequest,
  type WorkbenchQuickReplyDto,
  type WorkbenchQuickReplyImportRowError,
  type WorkbenchQuickReplyListRequest,
  type WorkbenchQuickReplyListResponse,
  type WorkbenchQuickReplyMoveRequest,
  type WorkbenchQuickReplyOkResponse,
  type WorkbenchQuickReplySortRequest,
  type WorkbenchQuickReplyUpdateRequest,
} from "@chatai/contracts";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from "../../shared/errors.js";
import type { WorkbenchAccess } from "./workbench-access.js";
import type { WorkbenchRepository } from "./workbench-repository.js";
import {
  buildQuickReplyImportFailure,
  indexQuickReplyCategories,
  normalizeQuickReplyBatchCreateRequest,
  normalizeQuickReplyCategoryEnsureRequest,
  normalizeQuickReplyCategoryId,
  normalizeQuickReplyCategoryTitle,
  normalizeQuickReplyLabelColor,
  normalizeQuickReplyLabelText,
  parseQuickReplyScopeType,
  type NormalizedQuickReplyBatchItem,
  validateQuickReplyCategoryEnsureLimits,
} from "./quick-reply-input-normalizers.js";
import {
  normalizeWorkbenchPage,
  normalizeWorkbenchPageSize,
} from "./workbench-pagination.js";

const QUICK_REPLY_SORT_BASE = 1_000_000_000;

export class WorkbenchQuickReplyService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly access: WorkbenchAccess,
  ) {}

  async listQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryListRequest,
  ): Promise<WorkbenchQuickReplyCategoryListResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);

    return {
      categories: await this.repository.listQuickReplyCategories({
        scopeType,
        subUserId,
        uid: me.uid,
      }),
    };
  }

  async ensureQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryEnsureRequest,
  ): Promise<WorkbenchQuickReplyCategoryEnsureResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const normalized = normalizeQuickReplyCategoryEnsureRequest(request.categories);

    if (!normalized.ok) {
      return buildQuickReplyImportFailure(normalized.errors);
    }

    const existingCategories = await this.repository.listQuickReplyCategories({
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const { childrenByParentId, primaryByTitle } =
      indexQuickReplyCategories(existingCategories);
    const limitErrors = validateQuickReplyCategoryEnsureLimits({
      categories: normalized.categories,
      childrenByParentId,
      primaryByTitle,
    });

    if (limitErrors.length > 0) {
      return buildQuickReplyImportFailure(limitErrors);
    }

    const responseCategories: WorkbenchQuickReplyCategoryEnsureSuccessResponse["categories"] =
      [];
    let createdPrimaryCategoryCount = 0;
    let createdSecondaryCategoryCount = 0;

    for (const category of normalized.categories) {
      let primaryCategory = primaryByTitle.get(category.title);

      if (!primaryCategory) {
        const id = await this.repository.createQuickReplyCategory({
          opSubUserId: subUserId,
          parentId: 0,
          scopeType,
          sort: await this.getQuickReplyCategoryAppendSort({
            parentId: 0,
            scopeType,
            subUserId,
            uid: me.uid,
          }),
          subUserId,
          title: category.title,
          uid: me.uid,
        });

        if (!id) {
          throw new InternalServerError(
            "QUICK_REPLY_CATEGORY_CREATE_FAILED",
            "创建快捷话术分类失败",
          );
        }

        primaryCategory = { id, title: category.title };
        primaryByTitle.set(category.title, primaryCategory);
        childrenByParentId.set(id, new Map());
        createdPrimaryCategoryCount += 1;
      }

      const childrenByTitle =
        childrenByParentId.get(primaryCategory.id) ?? new Map<string, { id: string; title: string }>();
      childrenByParentId.set(primaryCategory.id, childrenByTitle);
      const responseChildren: Array<{ id: string; title: string }> = [];

      for (const childTitle of category.children) {
        let childCategory = childrenByTitle.get(childTitle);

        if (!childCategory) {
          const id = await this.repository.createQuickReplyCategory({
            opSubUserId: subUserId,
            parentId: primaryCategory.id,
            scopeType,
            sort: await this.getQuickReplyCategoryAppendSort({
              parentId: primaryCategory.id,
              scopeType,
              subUserId,
              uid: me.uid,
            }),
            subUserId,
            title: childTitle,
            uid: me.uid,
          });

          if (!id) {
            throw new InternalServerError(
              "QUICK_REPLY_CATEGORY_CREATE_FAILED",
              "创建快捷话术分类失败",
            );
          }

          childCategory = { id, title: childTitle };
          childrenByTitle.set(childTitle, childCategory);
          createdSecondaryCategoryCount += 1;
        }

        responseChildren.push(childCategory);
      }

      responseCategories.push({
        children: responseChildren,
        id: primaryCategory.id,
        title: primaryCategory.title,
      });
    }

    return {
      categories: responseCategories,
      ok: true,
      summary: {
        createdPrimaryCategoryCount,
        createdSecondaryCategoryCount,
      },
    };
  }

  async listQuickReplyCategoryContent(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryContentRequest,
  ): Promise<WorkbenchQuickReplyCategoryContentResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const result = await this.repository.listQuickReplyCategoryContent({
      categoryLimit: QUICK_REPLY_CHILD_CATEGORY_LIMIT,
      parentCategoryId: request.parentCategoryId,
      quickReplyLimit: QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const quickRepliesByCategoryId: Record<string, WorkbenchQuickReplyDto[]> = {};

    for (const category of result.categories) {
      quickRepliesByCategoryId[category.id] = [];
    }

    for (const quickReply of result.quickReplies) {
      if (typeof quickReply.categoryId !== "string") {
        continue;
      }

      quickRepliesByCategoryId[quickReply.categoryId] ??= [];
      quickRepliesByCategoryId[quickReply.categoryId]?.push(quickReply);
    }

    return {
      categories: result.categories,
      limits: {
        categories: QUICK_REPLY_CHILD_CATEGORY_LIMIT,
        quickReplies: QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT,
      },
      quickRepliesByCategoryId,
      truncated: result.truncated,
    };
  }

  async createQuickReplyCategory(
    subUserId: string,
    request: WorkbenchQuickReplyCategoryCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const parentId = normalizeQuickReplyCategoryId(request.parentId ?? 0);

    if (parentId !== 0) {
      const parentExists = await this.repository.hasActiveQuickReplyCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (!parentExists) {
        throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
      }

      const parentIsChild = await this.repository.isChildQuickReplyCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (parentIsChild) {
        throw new BadRequestError(
          "QUICK_REPLY_CATEGORY_DEPTH_UNSUPPORTED",
          "最多支持二级分类",
        );
      }

      const childCount = await this.repository.countChildQuickReplyCategories({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (childCount >= QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
        throw new BadRequestError(
          "QUICK_REPLY_CHILD_CATEGORY_LIMIT_EXCEEDED",
          "二级分类最多50个",
        );
      }
    } else {
      const topCategoryCount = await this.repository.countChildQuickReplyCategories({
        categoryId: "0",
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (topCategoryCount >= QUICK_REPLY_TOP_CATEGORY_LIMIT) {
        throw new BadRequestError(
          "QUICK_REPLY_TOP_CATEGORY_LIMIT_EXCEEDED",
          "一级分类最多50个",
        );
      }
    }

    await this.repository.createQuickReplyCategory({
      opSubUserId: subUserId,
      parentId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSort({
        parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      title: normalizeQuickReplyCategoryTitle(request.title),
      uid: me.uid,
    });

    return { ok: true };
  }

  async renameQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);

    const updated = await this.repository.renameQuickReplyCategory({
      categoryId,
      scopeType: parseQuickReplyScopeType(scopeTypeValue),
      subUserId,
      title: normalizeQuickReplyCategoryTitle(request.title),
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async topQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.topQuickReplyCategory({
      categoryId,
      scopeType,
      sort: await this.getQuickReplyCategoryPrependSort({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async bottomQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.bottomQuickReplyCategory({
      categoryId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSortForExisting({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async deleteQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const childCount = await this.repository.countChildQuickReplyCategories({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (childCount > 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_HAS_CHILDREN",
        "请先删除话术分组",
      );
    }

    const replyCount = await this.repository.countQuickRepliesInCategory({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (replyCount > 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_NOT_EMPTY",
        "请先删除分组下的话术",
      );
    }

    const updated = await this.repository.deleteQuickReplyCategory({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async moveQuickReplyCategory(
    subUserId: string,
    categoryId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyCategoryMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const parentId = normalizeQuickReplyCategoryId(request.parentId);

    if (parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_MOVE_INVALID", "请选择一级分类");
    }

    const sourceScope = await this.repository.findQuickReplyCategoryScope({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!sourceScope) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (sourceScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CATEGORY_MOVE_INVALID",
        "一级分类暂不支持移动",
      );
    }

    if (sourceScope.parentId === parentId) {
      return { ok: true };
    }

    const targetScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!targetScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (targetScope.parentId !== 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_MOVE_INVALID", "请选择一级分类");
    }

    const childCount = await this.repository.countChildQuickReplyCategories({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (childCount >= QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_LIMIT_EXCEEDED",
        "二级分类最多50个",
      );
    }

    const [targetQuickReplyCount, sourceQuickReplyCount] = await Promise.all([
      this.repository.countQuickRepliesUnderTopCategory({
        categoryId: parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      this.repository.countQuickRepliesInCategory({
        categoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
    ]);

    if (
      targetQuickReplyCount + sourceQuickReplyCount >
      QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT
    ) {
      throw new BadRequestError(
        "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
        "一级分类下话术最多5000条",
      );
    }

    const updated = await this.repository.moveQuickReplyCategory({
      categoryId,
      parentId,
      scopeType,
      sort: await this.getQuickReplyCategoryAppendSort({
        parentId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    return { ok: true };
  }

  async sortQuickReplyCategories(
    subUserId: string,
    request: WorkbenchQuickReplyCategorySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const parentId = normalizeQuickReplyCategoryId(request.parentId);

    if (parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_SORT_INVALID", "请选择一级分类");
    }

    const parentScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!parentScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (parentScope.parentId !== 0) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_SORT_INVALID", "请选择一级分类");
    }

    const currentItems = await this.repository.listActiveQuickReplyCategorySortItems({
      parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const currentIds = currentItems.map((item) => item.id);

    if (!hasSameOrderedScopeIds(currentIds, request.categoryIds)) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    if (hasSameExactOrder(currentIds, request.categoryIds)) {
      return { ok: true };
    }

    const currentSortById = new Map(
      currentItems.map((item) => [item.id, item.sort]),
    );
    const items = buildSortRewriteItems(request.categoryIds)
      .map((item) => ({
        categoryId: item.id,
        sort: item.sort,
      }))
      .filter((item) => currentSortById.get(item.categoryId) !== item.sort);

    if (items.length === 0) {
      return { ok: true };
    }

    const updated = await this.repository.sortQuickReplyCategories({
      items,
      parentId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    return { ok: true };
  }

  async listQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyListRequest,
  ): Promise<WorkbenchQuickReplyListResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const page = normalizeWorkbenchPage(request.page);
    const pageSize = normalizeWorkbenchPageSize(request.pageSize ?? 50);
    const result = await this.repository.listQuickReplies({
      categoryId: request.categoryId,
      keyword: request.keyword,
      page,
      pageSize,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    return {
      items: result.items,
      pagination: {
        hasMore: page * pageSize < result.total,
        page,
        pageSize,
        total: result.total,
      },
    };
  }

  async createQuickReply(
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const values = await this.normalizeQuickReplyWriteRequest(me.uid, subUserId, request);
    await this.assertQuickReplyTopCategoryItemLimit({
      categoryId: values.categoryId,
      scopeType: values.scopeType,
      subUserId,
      uid: me.uid,
    });

    await this.repository.createQuickReply({
      ...values,
      opSubUserId: subUserId,
      sort: await this.getQuickReplyAppendSort({
        categoryId: values.categoryId,
        scopeType: values.scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    return { ok: true };
  }

  async batchCreateQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplyBatchCreateRequest,
  ): Promise<WorkbenchQuickReplyBatchCreateResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const normalized = normalizeQuickReplyBatchCreateRequest(request.items);

    if (!normalized.ok) {
      return buildQuickReplyImportFailure(normalized.errors);
    }

    const categoryScopes = new Map<string, { parentId: string | 0 } | undefined>();

    for (const categoryId of uniqueStrings(
      normalized.items.map((item) => item.categoryId),
    )) {
      categoryScopes.set(
        categoryId,
        await this.repository.findQuickReplyCategoryScope({
          categoryId,
          scopeType,
          subUserId,
          uid: me.uid,
        }),
      );
    }

    const errors: WorkbenchQuickReplyImportRowError[] = [];

    for (const item of normalized.items) {
      const categoryScope = categoryScopes.get(item.categoryId);

      if (!categoryScope || categoryScope.parentId === 0) {
        errors.push({
          message: "请选择二级分类",
          rowNumber: item.rowNumber,
        });
      }
    }

    if (errors.length > 0) {
      return buildQuickReplyImportFailure(errors);
    }

    const topCategoryRows = new Map<string, NormalizedQuickReplyBatchItem[]>();

    for (const item of normalized.items) {
      const parentId = categoryScopes.get(item.categoryId)?.parentId;

      if (typeof parentId !== "string") {
        continue;
      }

      topCategoryRows.set(parentId, [
        ...(topCategoryRows.get(parentId) ?? []),
        item,
      ]);
    }

    for (const [topCategoryId, rows] of topCategoryRows) {
      const existingCount = await this.repository.countQuickRepliesUnderTopCategory({
        categoryId: topCategoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      });

      if (existingCount + rows.length > QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT) {
        errors.push(
          ...rows.map((row) => ({
            message: "一级分类下话术最多5000条",
            rowNumber: row.rowNumber,
          })),
        );
      }
    }

    if (errors.length > 0) {
      return buildQuickReplyImportFailure(errors);
    }

    const nextSortByCategoryId = new Map<string, number>();
    const createItems: Array<{
      attachments: [];
      categoryId: string;
      contentText: string;
      labelColor: string;
      labelText: string;
      sort: number;
    }> = [];

    for (const item of normalized.items) {
      let sort = nextSortByCategoryId.get(item.categoryId);

      if (sort == null) {
        sort = await this.getQuickReplyAppendSort({
          categoryId: item.categoryId,
          scopeType,
          subUserId,
          uid: me.uid,
        });
      }

      createItems.push({
        attachments: [],
        categoryId: item.categoryId,
        contentText: item.contentText,
        labelColor: item.labelColor,
        labelText: item.labelText,
        sort,
      });
      nextSortByCategoryId.set(item.categoryId, Math.max(0, sort - 1));
    }

    await this.repository.batchCreateQuickReplies({
      items: createItems,
      opSubUserId: subUserId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    return {
      ok: true,
      summary: {
        createdQuickReplyCount: normalized.items.length,
      },
    };
  }

  async moveQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
    request: WorkbenchQuickReplyMoveRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);
    const targetCategoryId = normalizeQuickReplyCategoryId(request.categoryId);

    if (targetCategoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const quickReplyScope = await this.repository.findQuickReplyScope({
      quickReplyId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!quickReplyScope) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    if (quickReplyScope.categoryId === targetCategoryId) {
      return { ok: true };
    }

    if (quickReplyScope.categoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const sourceCategoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: quickReplyScope.categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const targetCategoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId: targetCategoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!sourceCategoryScope || !targetCategoryScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (sourceCategoryScope.parentId === 0 || targetCategoryScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    if (sourceCategoryScope.parentId !== targetCategoryScope.parentId) {
      throw new BadRequestError(
        "QUICK_REPLY_MOVE_SCOPE_INVALID",
        "只能移动到当前一级分类下",
      );
    }

    const updated = await this.repository.moveQuickReply({
      categoryId: targetCategoryId,
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyAppendSort({
        categoryId: targetCategoryId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async sortQuickReplies(
    subUserId: string,
    request: WorkbenchQuickReplySortRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const categoryId = normalizeQuickReplyCategoryId(request.categoryId);

    if (categoryId === 0) {
      throw new BadRequestError("QUICK_REPLY_SORT_INVALID", "请选择二级分类");
    }

    const categoryScope = await this.repository.findQuickReplyCategoryScope({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!categoryScope) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    if (categoryScope.parentId === 0) {
      throw new BadRequestError("QUICK_REPLY_SORT_INVALID", "请选择二级分类");
    }

    const currentItems = await this.repository.listActiveQuickReplySortItems({
      categoryId,
      scopeType,
      subUserId,
      uid: me.uid,
    });
    const currentIds = currentItems.map((item) => item.id);

    if (!hasSameOrderedScopeIds(currentIds, request.quickReplyIds)) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    if (hasSameExactOrder(currentIds, request.quickReplyIds)) {
      return { ok: true };
    }

    const currentSortById = new Map(
      currentItems.map((item) => [item.id, item.sort]),
    );
    const items = buildSortRewriteItems(request.quickReplyIds)
      .map((item) => ({
        quickReplyId: item.id,
        sort: item.sort,
      }))
      .filter((item) => currentSortById.get(item.quickReplyId) !== item.sort);

    if (items.length === 0) {
      return { ok: true };
    }

    const updated = await this.repository.sortQuickReplies({
      categoryId,
      items,
      scopeType,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new BadRequestError(
        "QUICK_REPLY_SORT_SCOPE_CHANGED",
        "排序数据已变化，请刷新后重试",
      );
    }

    return { ok: true };
  }

  async updateQuickReply(
    subUserId: string,
    quickReplyId: string,
    request: WorkbenchQuickReplyUpdateRequest,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const values = await this.normalizeQuickReplyWriteRequest(me.uid, subUserId, request);

    const updated = await this.repository.updateQuickReply({
      ...values,
      quickReplyId,
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async topQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.topQuickReply({
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyPrependSort({
        quickReplyId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async bottomQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);
    const scopeType = parseQuickReplyScopeType(scopeTypeValue);

    const updated = await this.repository.bottomQuickReply({
      quickReplyId,
      scopeType,
      sort: await this.getQuickReplyAppendSortForExisting({
        quickReplyId,
        scopeType,
        subUserId,
        uid: me.uid,
      }),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  async deleteQuickReply(
    subUserId: string,
    quickReplyId: string,
    scopeTypeValue: number,
  ): Promise<WorkbenchQuickReplyOkResponse> {
    const me = await this.access.getAuthenticatedWorkbenchScope(subUserId);

    const updated = await this.repository.deleteQuickReply({
      quickReplyId,
      scopeType: parseQuickReplyScopeType(scopeTypeValue),
      subUserId,
      uid: me.uid,
    });

    if (!updated) {
      throw new NotFoundError("QUICK_REPLY_NOT_FOUND", "话术不存在");
    }

    return { ok: true };
  }

  private async normalizeQuickReplyWriteRequest(
    uid: number,
    subUserId: string,
    request: WorkbenchQuickReplyCreateRequest | WorkbenchQuickReplyUpdateRequest,
  ) {
    const scopeType = parseQuickReplyScopeType(request.scopeType);
    const categoryId = normalizeQuickReplyCategoryId(request.categoryId ?? 0);
    const contentText = (request.contentText ?? "").trim();
    const validation = validateQuickReplyPayload({
      attachments: request.attachments ?? [],
      contentText,
    });

    if (!validation.ok) {
      throw new BadRequestError("INVALID_QUICK_REPLY", validation.errorMsg);
    }

    const attachments = normalizeQuickReplyAttachments(request.attachments ?? []);

    if (categoryId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const categoryExists = await this.repository.hasActiveQuickReplyCategory({
      categoryId,
      scopeType,
      subUserId,
      uid,
    });

    if (!categoryExists) {
      throw new BadRequestError("QUICK_REPLY_CATEGORY_NOT_FOUND", "分类不存在");
    }

    const categoryIsChild = await this.repository.isChildQuickReplyCategory({
        categoryId,
        scopeType,
        subUserId,
        uid,
    });

    if (!categoryIsChild) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    return {
      attachments,
      categoryId,
      contentText,
      labelColor: normalizeQuickReplyLabelColor(request.labelColor ?? ""),
      labelText: normalizeQuickReplyLabelText(request.labelText ?? ""),
      scopeType,
    };
  }

  private async assertQuickReplyTopCategoryItemLimit(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope || categoryScope.parentId === 0) {
      throw new BadRequestError(
        "QUICK_REPLY_CHILD_CATEGORY_REQUIRED",
        "请选择二级分类",
      );
    }

    const count = await this.repository.countQuickRepliesUnderTopCategory({
      categoryId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    if (count >= QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT) {
      throw new BadRequestError(
        "QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT_EXCEEDED",
        "一级分类下话术最多5000条",
      );
    }
  }

  private async getQuickReplyCategoryAppendSort(input: {
    parentId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const minSort = await this.repository.findQuickReplyCategorySortBoundary({
      ...input,
      boundary: "min",
    });

    return minSort == null ? QUICK_REPLY_SORT_BASE : Math.max(0, minSort - 1);
  }

  private async getQuickReplyCategoryPrependSort(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    const maxSort = await this.repository.findQuickReplyCategorySortBoundary({
      boundary: "max",
      parentId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    return maxSort == null ? QUICK_REPLY_SORT_BASE : maxSort + 1;
  }

  private async getQuickReplyCategoryAppendSortForExisting(input: {
    categoryId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const categoryScope = await this.repository.findQuickReplyCategoryScope(input);

    if (!categoryScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    return this.getQuickReplyCategoryAppendSort({
      parentId: categoryScope.parentId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });
  }

  private async getQuickReplyAppendSort(input: {
    categoryId: string | 0;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const minSort = await this.repository.findQuickReplySortBoundary({
      ...input,
      boundary: "min",
    });

    return minSort == null ? QUICK_REPLY_SORT_BASE : Math.max(0, minSort - 1);
  }

  private async getQuickReplyPrependSort(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const quickReplyScope = await this.repository.findQuickReplyScope(input);

    if (!quickReplyScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    const maxSort = await this.repository.findQuickReplySortBoundary({
      boundary: "max",
      categoryId: quickReplyScope.categoryId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });

    return maxSort == null ? QUICK_REPLY_SORT_BASE : maxSort + 1;
  }

  private async getQuickReplyAppendSortForExisting(input: {
    quickReplyId: string;
    scopeType: QuickReplyScopeType;
    subUserId: string;
    uid: number;
  }) {
    const quickReplyScope = await this.repository.findQuickReplyScope(input);

    if (!quickReplyScope) {
      return QUICK_REPLY_SORT_BASE;
    }

    return this.getQuickReplyAppendSort({
      categoryId: quickReplyScope.categoryId,
      scopeType: input.scopeType,
      subUserId: input.subUserId,
      uid: input.uid,
    });
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function buildSortRewriteItems(ids: string[]) {
  return ids.map((id, index) => ({
    id,
    sort: (ids.length - index) * 1000,
  }));
}

function hasSameOrderedScopeIds(currentIds: string[], submittedIds: string[]) {
  if (currentIds.length !== submittedIds.length) {
    return false;
  }

  const submittedSet = new Set(submittedIds);

  if (submittedSet.size !== submittedIds.length) {
    return false;
  }

  return currentIds.every((id) => submittedSet.has(id));
}

function hasSameExactOrder(currentIds: string[], submittedIds: string[]) {
  return (
    currentIds.length === submittedIds.length &&
    currentIds.every((id, index) => id === submittedIds[index])
  );
}

import {
  isQuickReplyLabelColor,
  normalizeQuickReplyAttachments,
  validateQuickReplyPayload,
  type WorkbenchQuickReplyCategoryDto,
  type WorkbenchQuickReplyDto,
} from "@chatai/contracts";
import type { QuickReplyRepository } from "./quick-reply-repository";

type MockQuickReplyState = {
  categories: WorkbenchQuickReplyCategoryDto[];
  nextId: number;
  quickReplies: WorkbenchQuickReplyDto[];
};

export function createMockQuickReplyRepository(): QuickReplyRepository {
  const state: MockQuickReplyState = {
    categories: [],
    nextId: 1,
    quickReplies: [],
  };

  return {
    async listCategories(request) {
      return {
        categories: clone(
          state.categories
            .filter((category) => category.scopeType === request.scopeType)
            .sort(sortEntries),
        ),
      };
    },
    async ensureCategories(request) {
      const categories = [];
      let createdPrimaryCategoryCount = 0;
      let createdSecondaryCategoryCount = 0;

      for (const requestedCategory of request.categories) {
        const title = requestedCategory.title.trim();

        if (!title || title.length > 10) {
          return {
            errorMsg: "导入数据有误",
            errors: [
              {
                message: title ? "一级分类不能超过10个字" : "一级分类不能为空",
                rowNumber: 0,
              },
            ],
            ok: false,
          };
        }

        let primaryCategory = state.categories.find(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === 0 &&
            category.title === title,
        );

        if (!primaryCategory) {
          primaryCategory = {
            id: `quick-reply-category-${state.nextId++}`,
            parentId: 0,
            scopeType: request.scopeType,
            sort: getAppendCategorySort(state.categories, request.scopeType, 0),
            title,
          };
          state.categories = [...state.categories, primaryCategory];
          createdPrimaryCategoryCount += 1;
        }

        const children = [];

        for (const childTitleValue of requestedCategory.children) {
          const childTitle = childTitleValue.trim();

          if (!childTitle || childTitle.length > 10) {
            return {
              errorMsg: "导入数据有误",
              errors: [
                {
                  message: childTitle
                    ? "二级分类不能超过10个字"
                    : "二级分类不能为空",
                  rowNumber: 0,
                },
              ],
              ok: false,
            };
          }

          let childCategory = state.categories.find(
            (category) =>
              category.scopeType === request.scopeType &&
              category.parentId === primaryCategory.id &&
              category.title === childTitle,
          );

          if (!childCategory) {
            childCategory = {
              id: `quick-reply-category-${state.nextId++}`,
              parentId: primaryCategory.id,
              scopeType: request.scopeType,
              sort: getAppendCategorySort(
                state.categories,
                request.scopeType,
                primaryCategory.id,
              ),
              title: childTitle,
            };
            state.categories = [...state.categories, childCategory];
            createdSecondaryCategoryCount += 1;
          }

          children.push({ id: childCategory.id, title: childCategory.title });
        }

        categories.push({
          children,
          id: primaryCategory.id,
          title: primaryCategory.title,
        });
      }

      return {
        categories,
        ok: true,
        summary: {
          createdPrimaryCategoryCount,
          createdSecondaryCategoryCount,
        },
      };
    },
    async listCategoryContent(request) {
      const categories = state.categories
        .filter(
          (category) =>
            category.scopeType === request.scopeType &&
            category.parentId === request.parentCategoryId,
        )
        .sort(sortEntries)
        .slice(0, 50);
      const categoryIds = new Set(categories.map((category) => category.id));
      const quickReplies = state.quickReplies
        .filter(
          (reply) =>
            reply.scopeType === request.scopeType &&
            typeof reply.categoryId === "string" &&
            categoryIds.has(reply.categoryId),
        )
        .sort((left, right) => {
          if (left.categoryId !== right.categoryId) {
            return String(left.categoryId).localeCompare(String(right.categoryId));
          }

          return sortEntries(left, right);
        })
        .slice(0, 10_000);
      const quickRepliesByCategoryId: Record<string, WorkbenchQuickReplyDto[]> = {};

      for (const category of categories) {
        quickRepliesByCategoryId[category.id] = [];
      }

      for (const quickReply of quickReplies) {
        if (typeof quickReply.categoryId !== "string") {
          continue;
        }

        quickRepliesByCategoryId[quickReply.categoryId] ??= [];
        quickRepliesByCategoryId[quickReply.categoryId]?.push(clone(quickReply));
      }

      return {
        categories: clone(categories),
        limits: {
          categories: 50,
          quickReplies: 10_000,
        },
        quickRepliesByCategoryId,
        truncated: {
          categories:
            state.categories.filter(
              (category) =>
                category.scopeType === request.scopeType &&
                category.parentId === request.parentCategoryId,
            ).length > 50,
          quickReplies:
            state.quickReplies.filter(
              (reply) =>
                reply.scopeType === request.scopeType &&
                typeof reply.categoryId === "string" &&
                categoryIds.has(reply.categoryId),
            ).length > 10_000,
        },
      };
    },
    async listQuickReplies(request) {
      const page = request.page ?? 1;
      const pageSize = request.pageSize ?? 50;
      const keyword = request.keyword?.trim();
      const matchingItems = state.quickReplies
        .filter(
          (reply) =>
            reply.scopeType === request.scopeType &&
            (request.categoryId === undefined ||
              reply.categoryId === request.categoryId) &&
            (!keyword ||
              reply.contentText.includes(keyword) ||
              reply.labelText.includes(keyword)),
        )
        .sort(sortEntries);

      return {
        items: clone(matchingItems.slice((page - 1) * pageSize, page * pageSize)),
        pagination: {
          hasMore: page * pageSize < matchingItems.length,
          page,
          pageSize,
          total: matchingItems.length,
        },
      };
    },
    async createCategory(request) {
      const parentId = request.parentId ?? 0;
      state.categories = [
        ...state.categories,
        {
          id: `quick-reply-category-${state.nextId++}`,
          parentId,
          scopeType: request.scopeType,
          sort: getAppendCategorySort(state.categories, request.scopeType, parentId),
          title: request.title,
        },
      ];
      return { ok: true };
    },
    async renameCategory(categoryId, scopeType, request) {
      requireCategory(state, categoryId, scopeType);
      state.categories = state.categories.map((category) =>
        category.id === categoryId && category.scopeType === scopeType
          ? { ...category, title: request.title }
          : category,
      );
      return { ok: true };
    },
    async topCategory(categoryId, scopeType) {
      const category = requireCategory(state, categoryId, scopeType);
      const sort = getPrependCategorySort(
        state.categories,
        scopeType,
        category.parentId,
      );
      state.categories = state.categories.map((item) =>
        item.id === categoryId && item.scopeType === scopeType
          ? { ...item, sort }
          : item,
      );
      return { ok: true };
    },
    async bottomCategory(categoryId, scopeType) {
      const category = requireCategory(state, categoryId, scopeType);
      const sort = getAppendCategorySort(
        state.categories,
        scopeType,
        category.parentId,
      );
      state.categories = state.categories.map((item) =>
        item.id === categoryId && item.scopeType === scopeType
          ? { ...item, sort }
          : item,
      );
      return { ok: true };
    },
    async deleteCategory(categoryId, scopeType) {
      if (
        state.categories.some(
          (category) =>
            category.scopeType === scopeType && category.parentId === categoryId,
        )
      ) {
        throw new Error("请先删除话术分组");
      }

      if (
        state.quickReplies.some(
          (reply) =>
            reply.scopeType === scopeType && reply.categoryId === categoryId,
        )
      ) {
        throw new Error("请先删除分组下的话术");
      }

      requireCategory(state, categoryId, scopeType);
      state.categories = state.categories.filter(
        (category) =>
          !(category.id === categoryId && category.scopeType === scopeType),
      );
      return { ok: true };
    },
    async moveCategory(categoryId, scopeType, request) {
      const category = requireCategory(state, categoryId, scopeType);
      const targetParent = requireCategory(state, request.parentId, scopeType);

      if (category.parentId === 0) {
        throw new Error("一级分类暂不支持移动");
      }

      if (targetParent.parentId !== 0) {
        throw new Error("请选择一级分类");
      }

      if (category.parentId === request.parentId) {
        return { ok: true };
      }

      const targetChildCount = state.categories.filter(
        (item) =>
          item.scopeType === scopeType && item.parentId === request.parentId,
      ).length;

      if (targetChildCount >= 50) {
        throw new Error("二级分类最多50个");
      }

      const sort = getAppendCategorySort(
        state.categories,
        scopeType,
        request.parentId,
      );
      state.categories = state.categories.map((item) =>
        item.id === categoryId && item.scopeType === scopeType
          ? { ...item, parentId: request.parentId, sort }
          : item,
      );
      return { ok: true };
    },
    async sortCategories(request) {
      const categories = state.categories.filter(
        (category) =>
          category.scopeType === request.scopeType &&
          category.parentId === request.parentId,
      );
      assertSameSortScope(
        categories.map((category) => category.id),
        request.categoryIds,
      );
      const sortById = buildSortById(request.categoryIds);

      state.categories = state.categories.map((category) =>
        category.scopeType === request.scopeType && sortById.has(category.id)
          ? { ...category, sort: sortById.get(category.id) ?? category.sort }
          : category,
      );
      return { ok: true };
    },
    async createQuickReply(request) {
      validateQuickReply(request);
      const categoryId = request.categoryId ?? 0;
      state.quickReplies = [
        ...state.quickReplies,
        {
          attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
          categoryId,
          contentText: request.contentText?.trim() ?? "",
          id: `quick-reply-${state.nextId++}`,
          labelColor: request.labelColor ?? "",
          labelText: request.labelText ?? "",
          scopeType: request.scopeType,
          sort: getAppendQuickReplySort(
            state.quickReplies,
            request.scopeType,
            categoryId,
          ),
        },
      ];
      return { ok: true };
    },
    async batchCreateQuickReplies(request) {
      if (!Array.isArray(request.items) || request.items.length === 0) {
        return {
          errorMsg: "导入数据有误",
          errors: [{ message: "请填写话术", rowNumber: 0 }],
          ok: false,
        };
      }

      if (request.items.length > 100) {
        return {
          errorMsg: "导入数据有误",
          errors: [{ message: "单次最多导入100条话术", rowNumber: 0 }],
          ok: false,
        };
      }

      const errors: Array<{ message: string; rowNumber: number }> = [];

      for (const item of request.items) {
        const labelText = item.labelText.trim();
        const labelColor = item.labelColor.trim();
        const contentText = item.contentText.trim();
        const category = state.categories.find(
          (candidate) =>
            candidate.id === item.categoryId &&
            candidate.scopeType === request.scopeType,
        );

        if (labelText.length > 10) {
          errors.push({ message: "短标题不能超过10个字", rowNumber: item.rowNumber });
        }
        if (!isQuickReplyLabelColor(labelColor)) {
          errors.push({ message: "短标题颜色无效", rowNumber: item.rowNumber });
        }
        if (!contentText) {
          errors.push({ message: "话术内容不能为空", rowNumber: item.rowNumber });
        } else if (contentText.length > 1000) {
          errors.push({ message: "话术内容不能超过1000个字", rowNumber: item.rowNumber });
        }
        if (!category || category.parentId === 0) {
          errors.push({ message: "请选择二级分类", rowNumber: item.rowNumber });
        }
      }

      if (errors.length > 0) {
        return { errorMsg: "导入数据有误", errors, ok: false };
      }

      for (const item of request.items) {
        const categoryId = item.categoryId.trim();
        state.quickReplies = [
          ...state.quickReplies,
          {
            attachments: [],
            categoryId,
            contentText: item.contentText.trim(),
            id: `quick-reply-${state.nextId++}`,
            labelColor: item.labelColor.trim(),
            labelText: item.labelText.trim(),
            scopeType: request.scopeType,
            sort: getAppendQuickReplySort(
              state.quickReplies,
              request.scopeType,
              categoryId,
            ),
          },
        ];
      }

      return {
        ok: true,
        summary: { createdQuickReplyCount: request.items.length },
      };
    },
    async updateQuickReply(quickReplyId, request) {
      validateQuickReply(request);
      requireQuickReply(state, quickReplyId, request.scopeType);
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === request.scopeType
          ? {
              ...reply,
              attachments: normalizeQuickReplyAttachments(request.attachments ?? []),
              categoryId: request.categoryId ?? 0,
              contentText: request.contentText?.trim() ?? "",
              labelColor: request.labelColor ?? "",
              labelText: request.labelText ?? "",
            }
          : reply,
      );
      return { ok: true };
    },
    async topQuickReply(quickReplyId, scopeType) {
      const quickReply = requireQuickReply(state, quickReplyId, scopeType);
      const sort = getPrependQuickReplySort(
        state.quickReplies,
        scopeType,
        quickReply.categoryId,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, sort }
          : reply,
      );
      return { ok: true };
    },
    async bottomQuickReply(quickReplyId, scopeType) {
      const quickReply = requireQuickReply(state, quickReplyId, scopeType);
      const sort = getAppendQuickReplySort(
        state.quickReplies,
        scopeType,
        quickReply.categoryId,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, sort }
          : reply,
      );
      return { ok: true };
    },
    async deleteQuickReply(quickReplyId, scopeType) {
      requireQuickReply(state, quickReplyId, scopeType);
      state.quickReplies = state.quickReplies.filter(
        (reply) => !(reply.id === quickReplyId && reply.scopeType === scopeType),
      );
      return { ok: true };
    },
    async moveQuickReply(quickReplyId, scopeType, request) {
      const quickReply = requireQuickReply(state, quickReplyId, scopeType);

      if (quickReply.categoryId === request.categoryId) {
        return { ok: true };
      }

      const sourceCategory = requireCategory(
        state,
        quickReply.categoryId,
        scopeType,
      );
      const targetCategory = requireCategory(state, request.categoryId, scopeType);

      if (sourceCategory.parentId === 0 || targetCategory.parentId === 0) {
        throw new Error("请选择二级分类");
      }
      if (sourceCategory.parentId !== targetCategory.parentId) {
        throw new Error("只能移动到当前一级分类下");
      }

      const sort = getAppendQuickReplySort(
        state.quickReplies,
        scopeType,
        request.categoryId,
      );
      state.quickReplies = state.quickReplies.map((reply) =>
        reply.id === quickReplyId && reply.scopeType === scopeType
          ? { ...reply, categoryId: request.categoryId, sort }
          : reply,
      );
      return { ok: true };
    },
    async sortQuickReplies(request) {
      const quickReplies = state.quickReplies.filter(
        (reply) =>
          reply.scopeType === request.scopeType &&
          reply.categoryId === request.categoryId,
      );
      assertSameSortScope(
        quickReplies.map((reply) => reply.id),
        request.quickReplyIds,
      );
      const sortById = buildSortById(request.quickReplyIds);

      state.quickReplies = state.quickReplies.map((reply) =>
        reply.scopeType === request.scopeType && sortById.has(reply.id)
          ? { ...reply, sort: sortById.get(reply.id) ?? reply.sort }
          : reply,
      );
      return { ok: true };
    },
  };
}

function validateQuickReply(
  request: {
    attachments?: WorkbenchQuickReplyDto["attachments"];
    contentText?: string;
  },
) {
  const validation = validateQuickReplyPayload({
    attachments: request.attachments ?? [],
    contentText: request.contentText ?? "",
  });

  if (!validation.ok) {
    throw new Error(validation.errorMsg);
  }
}

function requireCategory(
  state: MockQuickReplyState,
  categoryId: string | 0,
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
) {
  const category = state.categories.find(
    (item) => item.id === categoryId && item.scopeType === scopeType,
  );

  if (!category) {
    throw new Error("分类不存在");
  }

  return category;
}

function requireQuickReply(
  state: MockQuickReplyState,
  quickReplyId: string,
  scopeType: WorkbenchQuickReplyDto["scopeType"],
) {
  const quickReply = state.quickReplies.find(
    (item) => item.id === quickReplyId && item.scopeType === scopeType,
  );

  if (!quickReply) {
    throw new Error("话术不存在");
  }

  return quickReply;
}

function sortEntries<T extends { id: string; sort: number }>(left: T, right: T) {
  return right.sort - left.sort || right.id.localeCompare(left.id);
}

function getAppendCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  return getSiblingBoundarySort(
    categories,
    (category) =>
      category.scopeType === scopeType && category.parentId === parentId,
    "append",
  );
}

function getPrependCategorySort(
  categories: WorkbenchQuickReplyCategoryDto[],
  scopeType: WorkbenchQuickReplyCategoryDto["scopeType"],
  parentId: WorkbenchQuickReplyCategoryDto["parentId"],
) {
  return getSiblingBoundarySort(
    categories,
    (category) =>
      category.scopeType === scopeType && category.parentId === parentId,
    "prepend",
  );
}

function getAppendQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  return getSiblingBoundarySort(
    quickReplies,
    (reply) =>
      reply.scopeType === scopeType && reply.categoryId === categoryId,
    "append",
  );
}

function getPrependQuickReplySort(
  quickReplies: WorkbenchQuickReplyDto[],
  scopeType: WorkbenchQuickReplyDto["scopeType"],
  categoryId: WorkbenchQuickReplyDto["categoryId"],
) {
  return getSiblingBoundarySort(
    quickReplies,
    (reply) =>
      reply.scopeType === scopeType && reply.categoryId === categoryId,
    "prepend",
  );
}

function getSiblingBoundarySort<T extends { sort: number }>(
  items: T[],
  isSibling: (item: T) => boolean,
  placement: "append" | "prepend",
) {
  let boundarySort: number | undefined;

  for (const item of items) {
    if (!isSibling(item)) {
      continue;
    }

    boundarySort =
      boundarySort === undefined
        ? item.sort
        : placement === "append"
          ? Math.min(boundarySort, item.sort)
          : Math.max(boundarySort, item.sort);
  }

  if (boundarySort === undefined) {
    return Date.now();
  }

  return boundarySort + (placement === "append" ? -1 : 1);
}

function assertSameSortScope(currentIds: string[], submittedIds: string[]) {
  if (currentIds.length !== submittedIds.length) {
    throw new Error("排序数据已变化，请刷新后重试");
  }

  const submittedSet = new Set(submittedIds);

  if (
    submittedSet.size !== submittedIds.length ||
    !currentIds.every((id) => submittedSet.has(id))
  ) {
    throw new Error("排序数据已变化，请刷新后重试");
  }
}

function buildSortById(ids: string[]) {
  return new Map(ids.map((id, index) => [id, (ids.length - index) * 1000]));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

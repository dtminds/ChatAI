import type {
  QuickReplyScopeType,
  WorkbenchQuickReplyCategoryDto,
  WorkbenchQuickReplyImportRowError,
} from "@chatai/contracts";
import {
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CHILD_CATEGORY_LIMIT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT,
  QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
  QUICK_REPLY_SCOPE_TYPE,
  QUICK_REPLY_TOP_CATEGORY_LIMIT,
  isQuickReplyLabelColor,
} from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

type NormalizedQuickReplyEnsureCategory = {
  children: string[];
  rowNumber: number;
  title: string;
};

export type NormalizedQuickReplyBatchItem = {
  categoryId: string;
  contentText: string;
  labelColor: string;
  labelText: string;
  rowNumber: number;
};

export function buildQuickReplyImportFailure(
  errors: WorkbenchQuickReplyImportRowError[],
) {
  return {
    errorMsg: "导入数据有误",
    errors,
    ok: false as const,
  };
}

export function normalizeQuickReplyCategoryEnsureRequest(categories: unknown):
  | { ok: true; categories: NormalizedQuickReplyEnsureCategory[] }
  | { ok: false; errors: WorkbenchQuickReplyImportRowError[] } {
  if (!Array.isArray(categories) || categories.length === 0) {
    return {
      errors: [{ message: "请填写分类", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const categoryByTitle = new Map<string, NormalizedQuickReplyEnsureCategory>();

  categories.forEach((rawCategory, index) => {
    const rowNumber = index + 1;

    if (!isRecord(rawCategory)) {
      errors.push({ message: "分类数据无效", rowNumber });
      return;
    }

    const title = String(rawCategory.title ?? "").trim();

    if (!title) {
      errors.push({ message: "一级分类名称不能为空", rowNumber });
    } else if (title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      errors.push({ message: "一级分类名称不能超过10个字", rowNumber });
    }

    const children = rawCategory.children;

    if (!Array.isArray(children) || children.length === 0) {
      errors.push({ message: "二级分类名称不能为空", rowNumber });
      return;
    }

    const normalizedChildren: string[] = [];
    const seenChildren = new Set<string>();

    for (const rawChildTitle of children) {
      const childTitle = String(rawChildTitle ?? "").trim();

      if (!childTitle) {
        errors.push({ message: "二级分类名称不能为空", rowNumber });
        continue;
      }

      if (childTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
        errors.push({ message: "二级分类名称不能超过10个字", rowNumber });
        continue;
      }

      if (!seenChildren.has(childTitle)) {
        seenChildren.add(childTitle);
        normalizedChildren.push(childTitle);
      }
    }

    if (!title || title.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
      return;
    }

    const category = categoryByTitle.get(title);

    if (category) {
      const mergedChildren = new Set(category.children);

      for (const childTitle of normalizedChildren) {
        if (!mergedChildren.has(childTitle)) {
          mergedChildren.add(childTitle);
          category.children.push(childTitle);
        }
      }
      return;
    }

    categoryByTitle.set(title, {
      children: normalizedChildren,
      rowNumber,
      title,
    });
  });

  const normalizedCategories = Array.from(categoryByTitle.values());
  const secondaryCategoryCount = normalizedCategories.reduce(
    (count, category) => count + category.children.length,
    0,
  );

  if (normalizedCategories.length > QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT) {
    errors.push({
      message: "一级分类最多导入100个",
      rowNumber: 0,
    });
  }

  if (secondaryCategoryCount > QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT) {
    errors.push({
      message: "二级分类最多导入500个",
      rowNumber: 0,
    });
  }

  for (const category of normalizedCategories) {
    if (category.children.length === 0) {
      errors.push({
        message: "二级分类名称不能为空",
        rowNumber: category.rowNumber,
      });
    }
  }

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { categories: normalizedCategories, ok: true };
}

export function validateQuickReplyCategoryEnsureLimits(input: {
  categories: NormalizedQuickReplyEnsureCategory[];
  childrenByParentId: Map<string, Map<string, { id: string; title: string }>>;
  primaryByTitle: Map<string, { id: string; title: string }>;
}) {
  const errors: WorkbenchQuickReplyImportRowError[] = [];
  let primaryCategoryCount = input.primaryByTitle.size;
  const childCountByParentId = new Map<string, number>();
  const pendingChildCountByPrimaryTitle = new Map<string, number>();

  for (const [parentId, childrenByTitle] of input.childrenByParentId) {
    childCountByParentId.set(parentId, childrenByTitle.size);
  }

  for (const category of input.categories) {
    const primaryCategory = input.primaryByTitle.get(category.title);

    if (!primaryCategory) {
      primaryCategoryCount += 1;

      if (primaryCategoryCount > QUICK_REPLY_TOP_CATEGORY_LIMIT) {
        errors.push({
          message: "一级分类最多50个",
          rowNumber: category.rowNumber,
        });
      }
    }

    const existingChildren = primaryCategory
      ? input.childrenByParentId.get(primaryCategory.id)
      : undefined;
    const existingChildCount = primaryCategory
      ? (childCountByParentId.get(primaryCategory.id) ?? 0)
      : 0;
    const pendingChildCount =
      pendingChildCountByPrimaryTitle.get(category.title) ?? 0;
    const missingChildCount = category.children.filter(
      (childTitle) => !existingChildren?.has(childTitle),
    ).length;
    const nextChildCount =
      existingChildCount + pendingChildCount + missingChildCount;

    if (nextChildCount > QUICK_REPLY_CHILD_CATEGORY_LIMIT) {
      errors.push({
        message: "二级分类最多50个",
        rowNumber: category.rowNumber,
      });
    }

    pendingChildCountByPrimaryTitle.set(
      category.title,
      pendingChildCount + missingChildCount,
    );
  }

  return errors;
}

export function normalizeQuickReplyBatchCreateRequest(items: unknown):
  | { ok: true; items: NormalizedQuickReplyBatchItem[] }
  | { ok: false; errors: WorkbenchQuickReplyImportRowError[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      errors: [{ message: "请填写话术", rowNumber: 0 }],
      ok: false,
    };
  }

  if (items.length > QUICK_REPLY_BATCH_CREATE_LIMIT) {
    return {
      errors: [{ message: "单次最多导入100条话术", rowNumber: 0 }],
      ok: false,
    };
  }

  const errors: WorkbenchQuickReplyImportRowError[] = [];
  const normalizedItems: NormalizedQuickReplyBatchItem[] = [];

  items.forEach((rawItem, index) => {
    if (!isRecord(rawItem)) {
      errors.push({ message: "话术数据无效", rowNumber: index + 1 });
      return;
    }

    const rowNumber = readQuickReplyImportRowNumber(rawItem.rowNumber, index);
    const categoryId = String(rawItem.categoryId ?? "").trim();
    const labelText = String(rawItem.labelText ?? "").trim();
    const labelColor = String(rawItem.labelColor ?? "").trim();
    const contentText = String(rawItem.contentText ?? "").trim();

    if (!categoryId) {
      errors.push({ message: "请选择二级分类", rowNumber });
    }

    if (labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
      errors.push({ message: "短标题不能超过10个字", rowNumber });
    }

    if (!isQuickReplyLabelColor(labelColor)) {
      errors.push({ message: "短标题颜色无效", rowNumber });
    }

    if (!contentText) {
      errors.push({ message: "话术内容不能为空", rowNumber });
    } else if (contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
      errors.push({ message: "话术内容不能超过1000个字", rowNumber });
    }

    normalizedItems.push({
      categoryId,
      contentText,
      labelColor,
      labelText,
      rowNumber,
    });
  });

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  return { items: normalizedItems, ok: true };
}

function readQuickReplyImportRowNumber(value: unknown, index: number) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : index + 1;
}

export function indexQuickReplyCategories(
  categories: WorkbenchQuickReplyCategoryDto[],
) {
  const primaryById = new Map<string, { id: string; title: string }>();
  const primaryByTitle = new Map<string, { id: string; title: string }>();
  const childrenByParentId = new Map<
    string,
    Map<string, { id: string; title: string }>
  >();

  for (const category of categories) {
    if (category.parentId !== 0) {
      continue;
    }

    const primary = { id: category.id, title: category.title.trim() };
    primaryById.set(category.id, primary);

    if (!primaryByTitle.has(primary.title)) {
      primaryByTitle.set(primary.title, primary);
    }
  }

  for (const category of categories) {
    if (category.parentId === 0 || !primaryById.has(category.parentId)) {
      continue;
    }

    const childrenByTitle =
      childrenByParentId.get(category.parentId) ??
      new Map<string, { id: string; title: string }>();
    childrenByParentId.set(category.parentId, childrenByTitle);

    const title = category.title.trim();

    if (!childrenByTitle.has(title)) {
      childrenByTitle.set(title, { id: category.id, title });
    }
  }

  return { childrenByParentId, primaryByTitle };
}

export function parseQuickReplyScopeType(value: number): QuickReplyScopeType {
  switch (value) {
    case QUICK_REPLY_SCOPE_TYPE.ENTERPRISE:
    case QUICK_REPLY_SCOPE_TYPE.PERSONAL:
      return value;
    default:
      throw new BadRequestError("INVALID_QUICK_REPLY_SCOPE_TYPE", "话术范围无效");
  }
}

export function normalizeQuickReplyCategoryId(
  categoryId: string | 0 | undefined,
): string | 0 {
  if (categoryId === undefined || categoryId === 0 || categoryId === "0") {
    return 0;
  }

  if (!String(categoryId).trim()) {
    return 0;
  }

  return String(categoryId);
}

export function normalizeQuickReplyCategoryTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new BadRequestError(
      "QUICK_REPLY_CATEGORY_TITLE_REQUIRED",
      "分类名称不能为空",
    );
  }

  if (normalizedTitle.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    throw new BadRequestError(
      "QUICK_REPLY_CATEGORY_TITLE_TOO_LONG",
      "分类名称不能超过10个字",
    );
  }

  return normalizedTitle;
}

export function normalizeQuickReplyLabelText(labelText: string) {
  const normalizedLabelText = labelText.trim();

  if (normalizedLabelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
    throw new BadRequestError(
      "QUICK_REPLY_LABEL_TEXT_TOO_LONG",
      "短标题不能超过10个字",
    );
  }

  return normalizedLabelText;
}

export function normalizeQuickReplyLabelColor(labelColor: string) {
  const normalizedLabelColor = labelColor.trim();

  if (!isQuickReplyLabelColor(normalizedLabelColor)) {
    throw new BadRequestError(
      "QUICK_REPLY_LABEL_COLOR_INVALID",
      "短标题颜色无效",
    );
  }

  return normalizedLabelColor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import type {
  QuickReplyScopeType,
  WorkbenchQuickReplyBatchCreateRequest,
  WorkbenchQuickReplyCategoryEnsureRequest,
  WorkbenchQuickReplyCategoryEnsureSuccessResponse,
} from "@chatai/contracts";
import {
  QUICK_REPLY_BATCH_CREATE_LIMIT,
  QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
  QUICK_REPLY_IMPORT_MAX_ROWS,
  QUICK_REPLY_LABEL_COLOR_VALUES,
  QUICK_REPLY_LABEL_TEXT_MAX_LENGTH,
} from "@chatai/contracts";

export const QUICK_REPLY_IMPORT_HEADERS = [
  "分类（10个字以内）",
  "话术分组（10个字以内）",
  "话术短标题（10个字以内）",
  "话术内容（1000字以内）",
] as const;

const QUICK_REPLY_IMPORT_TEMPLATE_FILE_NAME = "快捷话术导入模板.xlsx";
export const QUICK_REPLY_IMPORT_TEMPLATE_URL =
  "https://b5.bokr.com.cn/dist/reply_template.xlsx";

export type QuickReplyImportParsedRow = {
  contentText: string;
  labelText: string;
  primaryCategory: string;
  rowNumber: number;
  secondaryCategory: string;
};

export type QuickReplyImportPrecheck = {
  errors: Array<{ message: string; rowNumber: number }>;
  ok: boolean;
  rows: QuickReplyImportParsedRow[];
  summary: {
    creatableQuickReplyCount: number;
    distinctPrimaryCategoryCount: number;
    distinctSecondaryCategoryCount: number;
    errorCount: number;
    totalRowCount: number;
  };
};

export async function parseQuickReplyImportFile(
  file: File,
): Promise<QuickReplyImportPrecheck> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file);

  return buildQuickReplyImportPrecheckFromRows(rows);
}

export function downloadQuickReplyImportTemplate() {
  const link = document.createElement("a");

  link.href = QUICK_REPLY_IMPORT_TEMPLATE_URL;
  link.download = QUICK_REPLY_IMPORT_TEMPLATE_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function buildQuickReplyImportPrecheckFromRows(
  rows: readonly unknown[][],
): QuickReplyImportPrecheck {
  const errors: Array<{ message: string; rowNumber: number }> = [];
  const header = rows[0] ?? [];

  if (
    header.length !== QUICK_REPLY_IMPORT_HEADERS.length ||
    QUICK_REPLY_IMPORT_HEADERS.some((name, index) => header[index] !== name)
  ) {
    errors.push({ message: "表头必须完全等于模板", rowNumber: 1 });
  }

  const parsedRows: QuickReplyImportParsedRow[] = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const cells = row.map((cell) => String(cell ?? "").trim());

    if (cells.every((cell) => cell === "")) {
      errors.push({ message: "整行不能为空", rowNumber });
      return;
    }

    const [
      primaryCategory = "",
      secondaryCategory = "",
      labelText = "",
      contentText = "",
    ] = cells;
    const parsedRow = {
      contentText,
      labelText,
      primaryCategory,
      rowNumber,
      secondaryCategory,
    };

    errors.push(...validateParsedRow(parsedRow));
    parsedRows.push(parsedRow);
  });

  if (parsedRows.length > QUICK_REPLY_IMPORT_MAX_ROWS) {
    errors.push({ message: "单次最多导入1000条话术", rowNumber: 0 });
  }

  return {
    errors,
    ok: errors.length === 0,
    rows: parsedRows,
    summary: buildQuickReplyImportSummary(
      parsedRows,
      errors,
      Math.max(0, rows.length - 1),
    ),
  };
}

export function buildQuickReplyCategoryEnsureRequest(
  scopeType: QuickReplyScopeType,
  rows: QuickReplyImportParsedRow[],
): WorkbenchQuickReplyCategoryEnsureRequest {
  const categories = new Map<string, Set<string>>();

  for (const row of rows) {
    const children = categories.get(row.primaryCategory) ?? new Set<string>();
    children.add(row.secondaryCategory);
    categories.set(row.primaryCategory, children);
  }

  return {
    categories: Array.from(categories, ([title, children]) => ({
      children: Array.from(children),
      title,
    })),
    scopeType,
  };
}

export function assignQuickReplyImportColors(rows: QuickReplyImportParsedRow[]) {
  const colorValues = QUICK_REPLY_LABEL_COLOR_VALUES.filter((value) => value !== "");
  const labelColorByCategory = new Map<string, Map<string, string>>();

  return rows.map((row) => {
    if (!row.labelText) {
      return { ...row, labelColor: "" };
    }

    const categoryKey = `${row.primaryCategory}:${row.secondaryCategory}`;
    const labelColorMap =
      labelColorByCategory.get(categoryKey) ?? new Map<string, string>();
    labelColorByCategory.set(categoryKey, labelColorMap);

    if (!labelColorMap.has(row.labelText)) {
      labelColorMap.set(
        row.labelText,
        colorValues[labelColorMap.size % colorValues.length] ?? "",
      );
    }

    return {
      ...row,
      labelColor: labelColorMap.get(row.labelText) ?? "",
    };
  });
}

export function buildQuickReplyBatchItems(
  rows: QuickReplyImportParsedRow[],
  ensureResponse: WorkbenchQuickReplyCategoryEnsureSuccessResponse,
): WorkbenchQuickReplyBatchCreateRequest["items"] {
  const categoryIdByPath = new Map<string, string>();

  for (const category of ensureResponse.categories) {
    for (const child of category.children) {
      categoryIdByPath.set(`${category.title}:${child.title}`, child.id);
    }
  }

  return assignQuickReplyImportColors(rows).map((row) => ({
    categoryId:
      categoryIdByPath.get(`${row.primaryCategory}:${row.secondaryCategory}`) ??
      "",
    contentText: row.contentText,
    labelColor: row.labelColor,
    labelText: row.labelText,
    rowNumber: row.rowNumber,
  }));
}

export function chunkQuickReplyImportItems<T>(
  items: T[],
  size = QUICK_REPLY_BATCH_CREATE_LIMIT,
) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function validateParsedRow(row: QuickReplyImportParsedRow) {
  const errors: Array<{ message: string; rowNumber: number }> = [];

  if (!row.primaryCategory) {
    errors.push({ message: "分类不能为空", rowNumber: row.rowNumber });
  }

  if (!row.secondaryCategory) {
    errors.push({ message: "话术分组不能为空", rowNumber: row.rowNumber });
  }

  if (!row.contentText) {
    errors.push({ message: "话术内容不能为空", rowNumber: row.rowNumber });
  }

  if (row.primaryCategory.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    errors.push({ message: "分类不能超过10个字", rowNumber: row.rowNumber });
  }

  if (row.secondaryCategory.length > QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH) {
    errors.push({ message: "话术分组不能超过10个字", rowNumber: row.rowNumber });
  }

  if (row.labelText.length > QUICK_REPLY_LABEL_TEXT_MAX_LENGTH) {
    errors.push({ message: "话术标题不能超过10个字", rowNumber: row.rowNumber });
  }

  if (row.contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
    errors.push({ message: "话术内容不能超过1000字", rowNumber: row.rowNumber });
  }

  return errors;
}

function buildQuickReplyImportSummary(
  rows: QuickReplyImportParsedRow[],
  errors: Array<{ message: string; rowNumber: number }>,
  totalRowCount: number,
) {
  const invalidRowNumbers = new Set(
    errors
      .filter((error) => error.rowNumber > 1)
      .map((error) => error.rowNumber),
  );
  const validRows = rows.filter((row) => !invalidRowNumbers.has(row.rowNumber));
  const distinctPrimary = new Set<string>();
  const distinctSecondary = new Set<string>();

  for (const row of validRows) {
    if (row.primaryCategory) {
      distinctPrimary.add(row.primaryCategory);
    }

    if (row.primaryCategory && row.secondaryCategory) {
      distinctSecondary.add(`${row.primaryCategory}:${row.secondaryCategory}`);
    }
  }

  return {
    creatableQuickReplyCount: validRows.length,
    distinctPrimaryCategoryCount: distinctPrimary.size,
    distinctSecondaryCategoryCount: distinctSecondary.size,
    errorCount: errors.length,
    totalRowCount,
  };
}

export type QuickReplyImportFailureResult = {
  errorMsg: string;
  errors: Array<{ message: string; rowNumber: number }>;
  importedCount: number;
  ok: false;
};

export type QuickReplyImportFailureDisplay = {
  errors: Array<{ message: string; rowNumber: number }>;
  summary: string;
};

export function buildQuickReplyImportFailureDisplay(
  response: QuickReplyImportFailureResult,
): QuickReplyImportFailureDisplay {
  if (response.importedCount > 0) {
    return {
      summary: `导入中断，已成功导入 ${response.importedCount} 条，请检查后重试`,
      errors: response.errors.filter((error) => error.rowNumber > 0),
    };
  }

  if (response.errors.length > 0) {
    const summary = response.errorMsg || "导入失败";
    return {
      summary,
      errors: response.errors.filter(
        (error) =>
          error.rowNumber > 0 ||
          (error.rowNumber === 0 && error.message !== summary),
      ),
    };
  }

  return {
    summary: response.errorMsg || "导入失败，请检查后重试",
    errors: [],
  };
}

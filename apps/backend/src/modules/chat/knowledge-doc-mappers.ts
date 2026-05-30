import type { WorkbenchKnowledgeDocPageResponse } from "@chatai/contracts";

type JavaKnowledgeDocItem = {
  id?: number | string;
  name?: string;
  question?: string;
  title?: string;
};

export function mapJavaKnowledgeDocPage(data: unknown): WorkbenchKnowledgeDocPageResponse {
  if (!isRecord(data) || !Array.isArray(data.list)) {
    return { list: [] };
  }

  return {
    list: data.list.flatMap((item) => {
      const mapped = mapJavaKnowledgeDocItem(item);

      return mapped ? [mapped] : [];
    }),
  };
}

export function normalizeKnowledgeId(value: string) {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function mapJavaKnowledgeDocItem(item: unknown) {
  if (!isJavaKnowledgeDocItem(item)) {
    return undefined;
  }

  const id = item.id;

  return {
    id: String(id),
    name:
      readString(item.title) ??
      readString(item.name) ??
      readString(item.question) ??
      `FAQ ${String(id)}`,
  };
}

function isJavaKnowledgeDocItem(value: unknown): value is JavaKnowledgeDocItem {
  return isRecord(value) && value.id != null && value.id !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

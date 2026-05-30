import type { WorkbenchKnowledgePageResponse } from "@chatai/contracts";

type JavaKnowledgeItem = {
  createTimestamp?: number | string;
  docNum?: number | string;
  id?: number | string;
  knowledgeId?: number | string;
  name?: string;
  remark?: string;
};

export function mapJavaKnowledgePage(data: unknown): WorkbenchKnowledgePageResponse {
  if (!isRecord(data) || !Array.isArray(data.list)) {
    return { list: [] };
  }

  return {
    list: data.list.flatMap((item) => {
      const mapped = mapJavaKnowledgeItem(item);

      return mapped ? [mapped] : [];
    }),
  };
}

function mapJavaKnowledgeItem(item: unknown) {
  if (!isJavaKnowledgeItem(item)) {
    return undefined;
  }

  const id = readKnowledgeSetId(item);

  return {
    createTimestamp: readOptionalInteger(item.createTimestamp),
    docNum: readOptionalInteger(item.docNum),
    id: String(id),
    name: readString(item.name) ?? `知识集 ${String(id)}`,
    remark: readString(item.remark),
  };
}

function readKnowledgeSetId(item: JavaKnowledgeItem) {
  return item.knowledgeId ?? item.id;
}

function isJavaKnowledgeItem(value: unknown): value is JavaKnowledgeItem {
  if (!isRecord(value)) {
    return false;
  }

  const id = value.knowledgeId ?? value.id;

  return id != null && id !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return undefined;
}

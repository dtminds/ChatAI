import type { WorkbenchKnowledgeFaqAddResponse } from "@chatai/contracts";

/** Java wap-embed-knowledge-faq/add 工作台来源标识（当前 Java 侧接受 1；传 4 会返回「来源错误」） */
export const JAVA_KNOWLEDGE_FAQ_SOURCE = 4;

export function mapJavaKnowledgeFaqAdd(data: unknown): WorkbenchKnowledgeFaqAddResponse {
  if (typeof data === "string" && data.trim().length > 0) {
    return { docId: data.trim() };
  }

  if (isRecord(data) && typeof data.docId === "string" && data.docId.trim().length > 0) {
    return { docId: data.docId.trim() };
  }

  return { docId: "" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

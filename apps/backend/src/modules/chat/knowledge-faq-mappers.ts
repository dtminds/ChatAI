import type { WorkbenchKnowledgeFaqAddResponse } from "@chatai/contracts";

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

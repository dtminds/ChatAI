import { describe, expect, it } from "vitest";
import {
  applyAiMemoryOperations,
  createManualMemory,
  deleteManualMemory,
  emptyUserMemoryDocument,
  normalizeUserMemoryContent,
  parseUserMemoryDocument,
  updateManualMemory,
  UserMemoryDomainError,
} from "../../../../src/modules/ai-hosting/user-memory/user-memory-domain.js";

const now = 1_800_000_000_000;

describe("user memory domain", () => {
  it("validates stored documents instead of replacing corrupted JSON", () => {
    expect(() => parseUserMemoryDocument({ schemaVersion: 1, nextItemId: 1, manual: [], ai: [], pending: [] })).toThrow(UserMemoryDomainError);
    expect(() => parseUserMemoryDocument({ schemaVersion: 1, nextItemId: 1, manual: [{ id: 1 }], ai: [] })).toThrow(UserMemoryDomainError);
  });

  it("normalizes only whitespace and trailing punctuation", () => {
    expect(normalizeUserMemoryContent("  偏好  无糖。。。 ")).toBe("偏好 无糖");
    expect(normalizeUserMemoryContent("ABC")).toBe("ABC");
  });

  it("creates, edits and deletes manual memories with exact duplicate protection", () => {
    const created = createManualMemory(emptyUserMemoryDocument(), { category: "manual_note", content: " 重点服务。 " }, 7, now);
    expect(created.item).toMatchObject({ id: 1, content: "重点服务", updatedBySubUserId: 7 });
    expect(() => createManualMemory(created.document, { category: "profile", content: "重点服务" }, 7, now)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_CONTENT_DUPLICATE" }));
    const updated = updateManualMemory(created.document, 1, { category: "communication", content: "只发文字" }, 8, now + 1);
    expect(updated.manual[0]).toMatchObject({ id: 1, content: "只发文字", updatedBySubUserId: 8 });
    expect(deleteManualMemory(updated, 1, now + 2)).toMatchObject({ manual: [], ai: [] });
  });

  it("turns an edited AI item into manual and removes evidence", () => {
    const doc = emptyUserMemoryDocument();
    doc.nextItemId = 2;
    doc.ai.push({ id: 1, category: "preference", content: "偏好无糖", sourceSessionId: 10, evidenceMessageIds: [20], createdAt: now, updatedAt: now, expiresAt: null });
    const updated = updateManualMemory(doc, 1, { category: "preference", content: "偏好低糖" }, 9, now + 1);
    expect(updated.ai).toEqual([]);
    expect(updated.manual[0]).toEqual(expect.objectContaining({ id: 1, content: "偏好低糖", updatedBySubUserId: 9 }));
    expect(updated.manual[0]).not.toHaveProperty("sourceSessionId");
  });

  it("rejects invalid recent context expiry", () => {
    expect(() => createManualMemory(emptyUserMemoryDocument(), { category: "recent_context", content: "准备婚礼", expiresAt: now }, 1, now)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_CONTENT_INVALID" }));
  });

  it("applies AI operations only with customer evidence in the input window", () => {
    const result = applyAiMemoryOperations(emptyUserMemoryDocument(), [{ type: "add", category: "preference", content: "偏好无糖。", expiresAt: null, sourceSessionId: 10, evidenceMessageIds: [20] }], {
      now, sessionIds: [10], evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }],
    });
    expect(result.changed).toBe(true);
    expect(result.document.ai[0]).toMatchObject({ id: 1, content: "偏好无糖", sourceSessionId: 10 });
    expect(() => applyAiMemoryOperations(emptyUserMemoryDocument(), [{ type: "add", category: "preference", content: "偏好无糖", expiresAt: null, sourceSessionId: 10, evidenceMessageIds: [21] }], {
      now, sessionIds: [10], evidence: [{ messageId: 21, sessionId: 10, senderRole: "agent" }],
    })).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID" }));
  });

  it("never lets AI modify a manual item and rejects duplicate target operations", () => {
    const doc = createManualMemory(emptyUserMemoryDocument(), { category: "profile", content: "家有儿童" }, 1, now).document;
    const evidence = { now, sessionIds: [10], evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };
    expect(() => applyAiMemoryOperations(doc, [{ type: "remove", id: 1, sourceSessionId: 10, evidenceMessageIds: [20] }], evidence)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID" }));
  });

  it("deduplicates AI additions against manual and existing AI content", () => {
    let doc = createManualMemory(emptyUserMemoryDocument(), { category: "profile", content: "家有儿童" }, 1, now).document;
    const context = { now: now + 1, sessionIds: [10], evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };
    doc = applyAiMemoryOperations(doc, [{ type: "add", category: "profile", content: "家有儿童。", expiresAt: null, sourceSessionId: 10, evidenceMessageIds: [20] }], context).document;
    expect(doc.ai).toHaveLength(0);
    doc = applyAiMemoryOperations(doc, [{ type: "add", category: "preference", content: "偏好无糖", expiresAt: null, sourceSessionId: 10, evidenceMessageIds: [20] }], context).document;
    const next = applyAiMemoryOperations(doc, [{ type: "add", category: "preference", content: "偏好无糖。", expiresAt: null, sourceSessionId: 10, evidenceMessageIds: [20] }], { ...context, now: now + 2 }).document;
    expect(next.ai).toHaveLength(1);
    expect(next.ai[0]?.updatedAt).toBe(now + 2);
  });
});

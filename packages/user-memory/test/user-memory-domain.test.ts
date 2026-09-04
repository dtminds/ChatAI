import { describe, expect, it } from "vitest";
import {
  applyAiMemoryOperations,
  createManualMemory,
  deleteManualMemory,
  emptyUserMemoryDocument,
  filterActiveUserMemoryDocument,
  normalizeUserMemoryContent,
  parseUserMemoryDocument,
  updateManualMemory,
  UserMemoryDomainError,
} from "../src/user-memory-domain.js";

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
    const created = createManualMemory(emptyUserMemoryDocument(), { category: "preference", content: " 只在下午联系。 " }, 7, now);
    expect(created.item).toMatchObject({ id: 1, content: "只在下午联系", updatedBySubUserId: 7 });
    expect(() => createManualMemory(created.document, { category: "preference", content: "只在下午联系" }, 7, now)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_CONTENT_DUPLICATE" }));
    const updated = updateManualMemory(created.document, 1, { category: "preference", content: "只发文字" }, 8, now + 1);
    expect(updated.manual[0]).toMatchObject({ id: 1, content: "只发文字", updatedBySubUserId: 8 });
    expect(deleteManualMemory(updated, 1, now + 2)).toMatchObject({ manual: [], ai: [] });
  });

  it("rejects memory content longer than 100 characters", () => {
    expect(() =>
      createManualMemory(
        emptyUserMemoryDocument(),
        { category: "customer_profile", content: "身".repeat(101) },
        7,
        now,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "AGENT_USER_MEMORY_CONTENT_INVALID" }),
    );
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

  it("rejects invalid recent intent expiry and removes expired intent from read/model views", () => {
    expect(() => createManualMemory(emptyUserMemoryDocument(), { category: "recent_intent", content: "准备婚礼", expiresAt: now }, 1, now)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_CONTENT_INVALID" }));
    const document = createManualMemory(emptyUserMemoryDocument(), { category: "recent_intent", content: "准备婚礼", expiresAt: now + 1 }, 1, now).document;
    expect(filterActiveUserMemoryDocument(document, now + 2).manual).toEqual([]);
  });

  it("ignores expiresAt for non-recent_intent and still allows editing or deleting expired items", () => {
    const created = createManualMemory(emptyUserMemoryDocument(), { category: "customer_profile", content: "家有儿童", expiresAt: now - 1 }, 1, now);
    expect(created.item.expiresAt).toBeNull();
    const expired = createManualMemory(emptyUserMemoryDocument(), { category: "recent_intent", content: "准备婚礼", expiresAt: now + 1 }, 1, now).document;
    const updated = updateManualMemory(expired, 1, { category: "customer_profile", content: "家有儿童" }, 2, now + 2);
    expect(updated.manual[0]).toMatchObject({ id: 1, category: "customer_profile", content: "家有儿童", expiresAt: null, updatedBySubUserId: 2 });
    const stale = createManualMemory(emptyUserMemoryDocument(), { category: "recent_intent", content: "准备婚礼", expiresAt: now + 1 }, 1, now).document;
    expect(deleteManualMemory(stale, 1, now + 2)).toMatchObject({ manual: [], ai: [] });
  });

  it("keeps legacy AI short-term memory readonly until it expires", () => {
    const document = emptyUserMemoryDocument();
    document.nextItemId = 2;
    document.ai.push({ id: 1, category: "recent_intent", content: "两周内购买咖啡机", expiresAt: now + 14 * 86_400_000, createdAt: now, updatedAt: now });
    const context = { now, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };

    expect(applyAiMemoryOperations(document, [], context).document.ai).toEqual(document.ai);
    expect(() => applyAiMemoryOperations(document, [{ type: "remove", id: 1, evidenceMessageIds: [20] }], context)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID" }));
    expect(() => applyAiMemoryOperations(document, [{ type: "add", category: "recent_intent", content: "近期购买咖啡机", expiresAt: now + 7 * 86_400_000, evidenceMessageIds: [20] }], context)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID" }));
  });

  it("requires valid customer evidence for every AI memory operation", () => {
    const result = applyAiMemoryOperations(emptyUserMemoryDocument(), [{ type: "add", category: "preference", content: "偏好无糖。", expiresAt: null, evidenceMessageIds: [20] }], {
      now, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }],
    });
    expect(result.changed).toBe(true);
    expect(result.changes).toEqual({ added: 1, removed: 0, updated: 0 });
    expect(result.document.ai[0]).toMatchObject({ id: 1, content: "偏好无糖", sourceSessionId: 10, evidenceMessageIds: [20] });
    expect(() => applyAiMemoryOperations(emptyUserMemoryDocument(), [{ type: "add", category: "preference", content: "偏好低糖", expiresAt: null, evidenceMessageIds: [21] }], {
      now, evidence: [{ messageId: 21, sessionId: 10, senderRole: "agent" }],
    })).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID" }));
  });

  it("does not count expired cleanup as an AI memory removal", () => {
    const document = emptyUserMemoryDocument();
    document.nextItemId = 4;
    document.manual.push({ id: 1, category: "recent_intent", content: "已过期的人工意向", createdAt: now - 2, updatedAt: now - 2, expiresAt: now - 1, updatedBySubUserId: 1 });
    document.ai.push(
      { id: 2, category: "recent_intent", content: "已过期的 AI 意向", createdAt: now - 2, updatedAt: now - 2, expiresAt: now - 1 },
      { id: 3, category: "preference", content: "偏好无糖", createdAt: now - 2, updatedAt: now - 2, expiresAt: null },
    );

    const cleaned = applyAiMemoryOperations(document, [], { now, evidence: [] });

    expect(cleaned.changed).toBe(true);
    expect(cleaned.document.manual).toEqual([]);
    expect(cleaned.document.ai).toHaveLength(1);
    expect(cleaned.changes).toEqual({ added: 0, removed: 0, updated: 0 });

    const updated = applyAiMemoryOperations(document, [{ type: "update", id: 3, category: "preference", content: "偏好低糖", expiresAt: null, evidenceMessageIds: [20] }], { now, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] });
    expect(updated.changes).toEqual({ added: 0, removed: 0, updated: 1 });
  });

  it("never lets AI modify a manual item and rejects duplicate target operations", () => {
    const doc = createManualMemory(emptyUserMemoryDocument(), { category: "customer_profile", content: "家有儿童" }, 1, now).document;
    const evidence = { now, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };
    expect(() => applyAiMemoryOperations(doc, [{ type: "remove", id: 1, evidenceMessageIds: [20] }], evidence)).toThrowError(expect.objectContaining({ code: "AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID" }));
  });

  it("keeps remove and update operations when all additions cannot fit", () => {
    const document = emptyUserMemoryDocument();
    document.nextItemId = 21;
    document.ai = Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      category: "preference" as const,
      content: `原记忆${index + 1}`,
      createdAt: now - 1,
      updatedAt: now - 1,
      expiresAt: null,
    }));
    const context = { now, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };

    const overflow = applyAiMemoryOperations(document, [
      { type: "remove", id: 20, evidenceMessageIds: [20] },
      { type: "update", id: 1, category: "preference", content: "已更新的偏好", expiresAt: null, evidenceMessageIds: [20] },
      { type: "add", category: "preference", content: "新增偏好一", expiresAt: null, evidenceMessageIds: [20] },
      { type: "add", category: "preference", content: "新增偏好二", expiresAt: null, evidenceMessageIds: [20] },
    ], context);

    expect(overflow.document.ai).toHaveLength(19);
    expect(overflow.document.ai.map((item) => item.content)).not.toContain("新增偏好一");
    expect(overflow.document.ai.map((item) => item.content)).not.toContain("新增偏好二");
    expect(overflow.document.ai.find((item) => item.id === 1)?.content).toBe("已更新的偏好");
    expect(overflow.changes).toEqual({ added: 0, removed: 1, updated: 1 });

    const exactFit = applyAiMemoryOperations(document, [
      { type: "remove", id: 20, evidenceMessageIds: [20] },
      { type: "add", category: "preference", content: "新增偏好一", expiresAt: null, evidenceMessageIds: [20] },
    ], context);

    expect(exactFit.document.ai).toHaveLength(20);
    expect(exactFit.document.ai).toEqual(expect.arrayContaining([expect.objectContaining({ id: 21, content: "新增偏好一" })]));
    expect(exactFit.changes).toEqual({ added: 1, removed: 1, updated: 0 });
  });

  it("deduplicates AI additions against manual and existing AI content", () => {
    let doc = createManualMemory(emptyUserMemoryDocument(), { category: "customer_profile", content: "家有儿童" }, 1, now).document;
    const context = { now: now + 1, evidence: [{ messageId: 20, sessionId: 10, senderRole: "customer" }] };
    doc = applyAiMemoryOperations(doc, [{ type: "add", category: "customer_profile", content: "家有儿童。", expiresAt: null, evidenceMessageIds: [20] }], context).document;
    expect(doc.ai).toHaveLength(0);
    doc = applyAiMemoryOperations(doc, [{ type: "add", category: "preference", content: "偏好无糖", expiresAt: null, evidenceMessageIds: [20] }], context).document;
    const duplicate = applyAiMemoryOperations(doc, [{ type: "add", category: "preference", content: "偏好无糖。", expiresAt: null, evidenceMessageIds: [21] }], {
      now: now + 2,
      evidence: [{ messageId: 21, sessionId: 10, senderRole: "customer" }],
    });
    const next = duplicate.document;
    expect(duplicate.changed).toBe(false);
    expect(duplicate.changes).toEqual({ added: 0, removed: 0, updated: 0 });
    expect(next.ai).toHaveLength(1);
    expect(next.ai[0]).toMatchObject({
      evidenceMessageIds: [20],
      sourceSessionId: 10,
      updatedAt: now + 1,
    });
  });
});

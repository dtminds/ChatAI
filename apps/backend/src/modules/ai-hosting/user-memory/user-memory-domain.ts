import {
  AgentUserMemoryDocumentSchema,
  type AgentUserMemoryAiItem,
  type AgentUserMemoryCategory,
  type AgentUserMemoryDocument,
  type AgentUserMemoryManualItem,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";

export const USER_MEMORY_ITEM_LIMIT = 20;
export const USER_MEMORY_CONTENT_LIMIT = 100;
export const USER_MEMORY_MAX_OPERATIONS = 40;
export const USER_MEMORY_RECENT_INTENT_MAX_MS = 180 * 24 * 60 * 60 * 1000;

export type UserMemoryDomainErrorCode =
  | "AGENT_USER_MEMORY_CONTENT_DUPLICATE"
  | "AGENT_USER_MEMORY_CONTENT_INVALID"
  | "AGENT_USER_MEMORY_DATA_INVALID"
  | "AGENT_USER_MEMORY_ITEM_NOT_FOUND"
  | "AGENT_USER_MEMORY_LIMIT_REACHED"
  | "AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID"
  | "AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID";

export class UserMemoryDomainError extends Error {
  constructor(public readonly code: UserMemoryDomainErrorCode, message: string) {
    super(message);
    this.name = "UserMemoryDomainError";
  }
}

export type UserMemoryEvidence = {
  messageId: number;
  senderRole: string;
  sessionId: number;
};

export type UserMemoryChangeCounts = {
  added: number;
  removed: number;
  updated: number;
};

type EvidenceFields = {
  evidenceMessageIds: number[];
};
export type UserMemoryAiOperation =
  | ({ type: "add"; category: AgentUserMemoryCategory; content: string; expiresAt: number | null } & EvidenceFields)
  | ({ type: "update"; id: number; category: AgentUserMemoryCategory; content: string; expiresAt: number | null } & EvidenceFields)
  | ({ type: "remove"; id: number } & EvidenceFields);

export function emptyUserMemoryDocument(): AgentUserMemoryDocument {
  return { schemaVersion: 1, nextItemId: 1, manual: [], ai: [] };
}

export function parseUserMemoryDocument(value: unknown): AgentUserMemoryDocument {
  if (!Value.Check(AgentUserMemoryDocumentSchema, value)) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_DATA_INVALID", "Invalid stored user-memory document");
  }
  const ids = [...value.manual, ...value.ai].map((item) => item.id);
  if (new Set(ids).size !== ids.length || value.nextItemId <= Math.max(0, ...ids)) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_DATA_INVALID", "Invalid user-memory item identifiers");
  }
  if (ids.length > USER_MEMORY_ITEM_LIMIT) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_DATA_INVALID", "User-memory item limit exceeded");
  }
  return structuredClone(value);
}

export function normalizeUserMemoryContent(content: string) {
  return content.trim().replace(/\s+/gu, " ").replace(/[。．，,；;：:.]+$/gu, "").trim();
}

function normalizeExpiresAt(category: AgentUserMemoryCategory, expiresAt: number | null | undefined) {
  return category === "recent_intent" ? expiresAt ?? null : null;
}

function validateContent(category: AgentUserMemoryCategory, content: string, expiresAt: number | null | undefined, now: number) {
  const normalized = normalizeUserMemoryContent(content);
  if (!normalized || normalized.length > USER_MEMORY_CONTENT_LIMIT) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_CONTENT_INVALID", "Invalid user-memory content");
  }
  if (category === "recent_intent") {
    if (expiresAt == null || expiresAt <= now || expiresAt > now + USER_MEMORY_RECENT_INTENT_MAX_MS) {
      throw new UserMemoryDomainError("AGENT_USER_MEMORY_CONTENT_INVALID", "recent_intent requires a future expiry within 180 days");
    }
  }
  return normalized;
}

/** Keep the targeted item even when expired so manual edit/delete can still reach it. */
function filterExpiredExcept(document: AgentUserMemoryDocument, now: number, keepItemId?: number): AgentUserMemoryDocument {
  return {
    ...document,
    manual: document.manual.filter((item) => item.id === keepItemId || item.expiresAt == null || item.expiresAt > now),
    ai: document.ai.filter((item) => item.id === keepItemId || item.expiresAt == null || item.expiresAt > now),
  };
}

function activeItems(document: AgentUserMemoryDocument, now: number) {
  return [...document.manual, ...document.ai].filter((item) => item.expiresAt == null || item.expiresAt > now);
}

function assertNoDuplicate(document: AgentUserMemoryDocument, normalized: string, now: number, ignoredId?: number) {
  if (activeItems(document, now).some((item) => item.id !== ignoredId && normalizeUserMemoryContent(item.content) === normalized)) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_CONTENT_DUPLICATE", "Duplicate user-memory content");
  }
}

function filterExpired(document: AgentUserMemoryDocument, now: number): AgentUserMemoryDocument {
  return {
    ...document,
    manual: document.manual.filter((item) => item.expiresAt == null || item.expiresAt > now),
    ai: document.ai.filter((item) => item.expiresAt == null || item.expiresAt > now),
  };
}

export function filterActiveUserMemoryDocument(documentValue: unknown, now: number): AgentUserMemoryDocument {
  return filterExpired(parseUserMemoryDocument(documentValue), now);
}

export function createManualMemory(
  documentValue: unknown,
  input: { category: AgentUserMemoryCategory; content: string; expiresAt?: number | null },
  actorSubUserId: number,
  now: number,
) {
  const document = filterExpired(parseUserMemoryDocument(documentValue), now);
  const expiresAt = normalizeExpiresAt(input.category, input.expiresAt);
  const content = validateContent(input.category, input.content, expiresAt, now);
  assertNoDuplicate(document, content, now);
  if (document.manual.length + document.ai.length >= USER_MEMORY_ITEM_LIMIT) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_LIMIT_REACHED", "User-memory item limit reached");
  }
  const item: AgentUserMemoryManualItem = {
    id: document.nextItemId,
    category: input.category,
    content,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    updatedBySubUserId: actorSubUserId,
  };
  document.nextItemId += 1;
  document.manual.push(item);
  return { document, item };
}

export function updateManualMemory(
  documentValue: unknown,
  itemId: number,
  input: { category: AgentUserMemoryCategory; content: string; expiresAt?: number | null },
  actorSubUserId: number,
  now: number,
) {
  const original = parseUserMemoryDocument(documentValue);
  const manualIndex = original.manual.findIndex((item) => item.id === itemId);
  const aiIndex = manualIndex < 0 ? original.ai.findIndex((item) => item.id === itemId) : -1;
  if (manualIndex < 0 && aiIndex < 0) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "User-memory item not found");
  }
  const document = filterExpiredExcept(original, now, itemId);
  const expiresAt = normalizeExpiresAt(input.category, input.expiresAt);
  const content = validateContent(input.category, input.content, expiresAt, now);
  assertNoDuplicate(document, content, now, itemId);
  if (manualIndex >= 0) {
    const currentIndex = document.manual.findIndex((item) => item.id === itemId);
    const current = document.manual[currentIndex]!;
    document.manual[currentIndex] = { ...current, category: input.category, content, expiresAt, updatedAt: now, updatedBySubUserId: actorSubUserId };
    return document;
  }
  const currentIndex = document.ai.findIndex((item) => item.id === itemId);
  const current = document.ai[currentIndex]!;
  document.ai.splice(currentIndex, 1);
  document.manual.push({ id: current.id, category: input.category, content, createdAt: current.createdAt, updatedAt: now, expiresAt, updatedBySubUserId: actorSubUserId });
  return document;
}

export function deleteManualMemory(documentValue: unknown, itemId: number, now: number) {
  const original = parseUserMemoryDocument(documentValue);
  const exists = original.manual.some((item) => item.id === itemId) || original.ai.some((item) => item.id === itemId);
  if (!exists) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "User-memory item not found");
  }
  const document = filterExpiredExcept(original, now, itemId);
  document.manual = document.manual.filter((item) => item.id !== itemId);
  document.ai = document.ai.filter((item) => item.id !== itemId);
  return document;
}

function resolveOperationEvidence(operation: UserMemoryAiOperation, evidenceById: Map<number, UserMemoryEvidence>) {
  const valid = [...new Set(operation.evidenceMessageIds ?? [])]
    .map((messageId) => evidenceById.get(messageId))
    .filter((evidence): evidence is UserMemoryEvidence => evidence?.senderRole === "customer");
  const sourceSessionId = valid[0]?.sessionId;
  if (!sourceSessionId) return undefined;
  const evidenceMessageIds = valid.filter((evidence) => evidence.sessionId === sourceSessionId).slice(0, 3).map((evidence) => evidence.messageId);
  return { evidenceMessageIds, sourceSessionId };
}

export function applyAiMemoryOperations(
  documentValue: unknown,
  operations: UserMemoryAiOperation[],
  context: { now: number; evidence: UserMemoryEvidence[] },
) {
  if (operations.length > USER_MEMORY_MAX_OPERATIONS) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "Too many model operations");
  }
  const original = parseUserMemoryDocument(documentValue);
  const activeOriginal = filterExpired(original, context.now);
  const document = structuredClone(activeOriginal);
  const evidenceById = new Map(context.evidence.map((item) => [item.messageId, item]));
  const operationEvidence = new Map<UserMemoryAiOperation, NonNullable<ReturnType<typeof resolveOperationEvidence>>>();
  const targeted = new Set<number>();
  for (const operation of operations) {
    const evidence = resolveOperationEvidence(operation, evidenceById);
    if (!evidence) {
      throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "AI operation requires customer evidence");
    }
    operationEvidence.set(operation, evidence);
    if (operation.type !== "add") {
      if (targeted.has(operation.id)) throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "Duplicate target operation");
      targeted.add(operation.id);
      const target = document.ai.find((item) => item.id === operation.id);
      if (!target) {
        throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "AI operation target does not exist");
      }
      if (target.category === "recent_intent") {
        throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "AI cannot modify short-term memory");
      }
    }
    if (operation.type === "add" || operation.type === "update") {
      if (operation.category === "recent_intent") {
        throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OPERATIONS_INVALID", "AI cannot create short-term memory");
      }
      validateContent(operation.category, operation.content, normalizeExpiresAt(operation.category, operation.expiresAt), context.now);
    }
  }

  const order = { remove: 0, update: 1, add: 2 } as const;
  const pendingAdds: Array<Extract<UserMemoryAiOperation, { type: "add" }>> = [];
  for (const operation of [...operations].sort((a, b) => order[a.type] - order[b.type])) {
    if (operation.type === "remove") {
      document.ai = document.ai.filter((item) => item.id !== operation.id);
      continue;
    }
    if (operation.type === "add") {
      pendingAdds.push(operation);
      continue;
    }
    const content = normalizeUserMemoryContent(operation.content);
    const expiresAt = normalizeExpiresAt(operation.category, operation.expiresAt);
    const evidence = operationEvidence.get(operation)!;
    const duplicateManual = document.manual.some((item) => normalizeUserMemoryContent(item.content) === content);
    if (duplicateManual) {
      document.ai = document.ai.filter((item) => item.id !== operation.id);
      continue;
    }
    const index = document.ai.findIndex((item) => item.id === operation.id);
    const current = document.ai[index]!;
    document.ai[index] = { ...current, category: operation.category, content, expiresAt, ...(evidence ?? {}), updatedAt: context.now };
  }

  const manualContents = new Set(document.manual.map((item) => normalizeUserMemoryContent(item.content)));
  const knownAiContents = new Set(document.ai.map((item) => normalizeUserMemoryContent(item.content)));
  const addCandidates = pendingAdds.flatMap((operation) => {
    const content = normalizeUserMemoryContent(operation.content);
    if (manualContents.has(content) || knownAiContents.has(content)) return [];
    knownAiContents.add(content);
    return [{
      operation,
      content,
      expiresAt: normalizeExpiresAt(operation.category, operation.expiresAt),
      evidence: operationEvidence.get(operation)!,
    }];
  });
  const availableSlots = USER_MEMORY_ITEM_LIMIT - document.manual.length - document.ai.length;
  if (addCandidates.length <= availableSlots) {
    for (const { operation, content, expiresAt, evidence } of addCandidates) {
      document.ai.push({ id: document.nextItemId++, category: operation.category, content, createdAt: context.now, updatedAt: context.now, expiresAt, ...evidence });
    }
  }

  const byContent = new Map<string, AgentUserMemoryAiItem>();
  for (const item of [...document.ai].sort((a, b) => a.id - b.id)) {
    const key = normalizeUserMemoryContent(item.content);
    const kept = byContent.get(key);
    if (!kept) byContent.set(key, item);
    else byContent.set(key, { ...kept, ...(item.sourceSessionId && item.evidenceMessageIds ? { sourceSessionId: item.sourceSessionId, evidenceMessageIds: item.evidenceMessageIds } : {}), updatedAt: item.updatedAt });
  }
  document.ai = [...byContent.values()].sort((a, b) => a.id - b.id);
  if (document.manual.length + document.ai.length > USER_MEMORY_ITEM_LIMIT) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_LIMIT_REACHED", "User-memory item limit reached");
  }
  const changed = JSON.stringify(document) !== JSON.stringify(original);
  return { changed, changes: countUserMemoryChanges(activeOriginal, document), document };
}

export function countUserMemoryChanges(before: AgentUserMemoryDocument, after: AgentUserMemoryDocument): UserMemoryChangeCounts {
  const beforeItems = new Map([...before.manual, ...before.ai].map((item) => [item.id, item]));
  const afterItems = new Map([...after.manual, ...after.ai].map((item) => [item.id, item]));
  let added = 0;
  let removed = 0;
  let updated = 0;
  for (const [id, item] of afterItems) {
    const previous = beforeItems.get(id);
    if (!previous) added += 1;
    else if (JSON.stringify(previous) !== JSON.stringify(item)) updated += 1;
  }
  for (const id of beforeItems.keys()) {
    if (!afterItems.has(id)) removed += 1;
  }
  return { added, removed, updated };
}

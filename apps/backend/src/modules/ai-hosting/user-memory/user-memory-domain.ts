import {
  AgentUserMemoryDocumentSchema,
  type AgentUserMemoryAiItem,
  type AgentUserMemoryCategory,
  type AgentUserMemoryDocument,
  type AgentUserMemoryManualItem,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";

export const USER_MEMORY_ITEM_LIMIT = 20;
export const USER_MEMORY_CONTENT_LIMIT = 200;
export const USER_MEMORY_MAX_OPERATIONS = 40;
export const USER_MEMORY_RECENT_CONTEXT_MAX_MS = 180 * 24 * 60 * 60 * 1000;

export type UserMemoryDomainErrorCode =
  | "AGENT_USER_MEMORY_CONTENT_DUPLICATE"
  | "AGENT_USER_MEMORY_CONTENT_INVALID"
  | "AGENT_USER_MEMORY_DATA_INVALID"
  | "AGENT_USER_MEMORY_ITEM_NOT_FOUND"
  | "AGENT_USER_MEMORY_LIMIT_REACHED"
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

type EvidenceFields = {
  evidenceMessageIds: number[];
  sourceSessionId: number;
};
export type UserMemoryAiOperation =
  | ({ type: "add"; category: AgentUserMemoryCategory; content: string; expiresAt: number | null } & EvidenceFields)
  | ({ type: "confirm"; id: number } & EvidenceFields)
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

function validateContent(category: AgentUserMemoryCategory, content: string, expiresAt: number | null | undefined, now: number, allowManualNote: boolean) {
  const normalized = normalizeUserMemoryContent(content);
  if (!normalized || normalized.length > USER_MEMORY_CONTENT_LIMIT || (!allowManualNote && category === "manual_note")) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_CONTENT_INVALID", "Invalid user-memory content");
  }
  if (category === "recent_context") {
    if (expiresAt == null || expiresAt <= now || expiresAt > now + USER_MEMORY_RECENT_CONTEXT_MAX_MS) {
      throw new UserMemoryDomainError("AGENT_USER_MEMORY_CONTENT_INVALID", "recent_context requires a future expiry within 180 days");
    }
  }
  return normalized;
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
  const content = validateContent(input.category, input.content, input.expiresAt, now, true);
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
    expiresAt: input.expiresAt ?? null,
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
  const document = filterExpired(parseUserMemoryDocument(documentValue), now);
  const content = validateContent(input.category, input.content, input.expiresAt, now, true);
  assertNoDuplicate(document, content, now, itemId);
  const manualIndex = document.manual.findIndex((item) => item.id === itemId);
  if (manualIndex >= 0) {
    const current = document.manual[manualIndex]!;
    document.manual[manualIndex] = { ...current, category: input.category, content, expiresAt: input.expiresAt ?? null, updatedAt: now, updatedBySubUserId: actorSubUserId };
    return document;
  }
  const aiIndex = document.ai.findIndex((item) => item.id === itemId);
  if (aiIndex < 0) throw new UserMemoryDomainError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "User-memory item not found");
  const current = document.ai[aiIndex]!;
  document.ai.splice(aiIndex, 1);
  document.manual.push({ id: current.id, category: input.category, content, createdAt: current.createdAt, updatedAt: now, expiresAt: input.expiresAt ?? null, updatedBySubUserId: actorSubUserId });
  return document;
}

export function deleteManualMemory(documentValue: unknown, itemId: number, now: number) {
  const document = filterExpired(parseUserMemoryDocument(documentValue), now);
  const before = document.manual.length + document.ai.length;
  document.manual = document.manual.filter((item) => item.id !== itemId);
  document.ai = document.ai.filter((item) => item.id !== itemId);
  if (document.manual.length + document.ai.length === before) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_ITEM_NOT_FOUND", "User-memory item not found");
  }
  return document;
}

function validateEvidence(operation: UserMemoryAiOperation, sessionIds: Set<number>, evidenceById: Map<number, UserMemoryEvidence>) {
  if (!sessionIds.has(operation.sourceSessionId) || operation.evidenceMessageIds.length < 1 || operation.evidenceMessageIds.length > 3 || new Set(operation.evidenceMessageIds).size !== operation.evidenceMessageIds.length) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", "Invalid operation evidence");
  }
  for (const messageId of operation.evidenceMessageIds) {
    const evidence = evidenceById.get(messageId);
    if (!evidence || evidence.sessionId !== operation.sourceSessionId || evidence.senderRole !== "customer") {
      throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", "Evidence is outside the customer input window");
    }
  }
}

export function applyAiMemoryOperations(
  documentValue: unknown,
  operations: UserMemoryAiOperation[],
  context: { now: number; sessionIds: number[]; evidence: UserMemoryEvidence[] },
) {
  if (operations.length > USER_MEMORY_MAX_OPERATIONS) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", "Too many model operations");
  }
  const original = parseUserMemoryDocument(documentValue);
  const document = filterExpired(original, context.now);
  const sessionIds = new Set(context.sessionIds);
  const evidenceById = new Map(context.evidence.map((item) => [item.messageId, item]));
  const targeted = new Set<number>();
  for (const operation of operations) {
    validateEvidence(operation, sessionIds, evidenceById);
    if (operation.type !== "add") {
      if (targeted.has(operation.id)) throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", "Duplicate target operation");
      targeted.add(operation.id);
      if (!document.ai.some((item) => item.id === operation.id)) {
        throw new UserMemoryDomainError("AGENT_USER_MEMORY_MODEL_OUTPUT_INVALID", "AI operation target does not exist");
      }
    }
    if (operation.type === "add" || operation.type === "update") {
      validateContent(operation.category, operation.content, operation.expiresAt, context.now, false);
    }
  }

  const order = { remove: 0, update: 1, confirm: 2, add: 3 } as const;
  for (const operation of [...operations].sort((a, b) => order[a.type] - order[b.type])) {
    if (operation.type === "remove") {
      document.ai = document.ai.filter((item) => item.id !== operation.id);
      continue;
    }
    if (operation.type === "confirm") {
      const index = document.ai.findIndex((item) => item.id === operation.id);
      const current = document.ai[index]!;
      document.ai[index] = { ...current, sourceSessionId: operation.sourceSessionId, evidenceMessageIds: [...operation.evidenceMessageIds], updatedAt: context.now };
      continue;
    }
    const content = normalizeUserMemoryContent(operation.content);
    if (operation.type === "update") {
      const duplicateManual = document.manual.some((item) => normalizeUserMemoryContent(item.content) === content);
      if (duplicateManual) {
        document.ai = document.ai.filter((item) => item.id !== operation.id);
        continue;
      }
      const index = document.ai.findIndex((item) => item.id === operation.id);
      const current = document.ai[index]!;
      document.ai[index] = { ...current, category: operation.category, content, expiresAt: operation.expiresAt, sourceSessionId: operation.sourceSessionId, evidenceMessageIds: [...operation.evidenceMessageIds], updatedAt: context.now };
      continue;
    }
    if (document.manual.some((item) => normalizeUserMemoryContent(item.content) === content)) continue;
    const duplicateIndex = document.ai.findIndex((item) => normalizeUserMemoryContent(item.content) === content);
    if (duplicateIndex >= 0) {
      const current = document.ai[duplicateIndex]!;
      document.ai[duplicateIndex] = { ...current, sourceSessionId: operation.sourceSessionId, evidenceMessageIds: [...operation.evidenceMessageIds], updatedAt: context.now };
      continue;
    }
    document.ai.push({ id: document.nextItemId++, category: operation.category, content, createdAt: context.now, updatedAt: context.now, expiresAt: operation.expiresAt, sourceSessionId: operation.sourceSessionId, evidenceMessageIds: [...operation.evidenceMessageIds] });
  }

  const byContent = new Map<string, AgentUserMemoryAiItem>();
  for (const item of [...document.ai].sort((a, b) => a.id - b.id)) {
    const key = normalizeUserMemoryContent(item.content);
    const kept = byContent.get(key);
    if (!kept) byContent.set(key, item);
    else byContent.set(key, { ...kept, sourceSessionId: item.sourceSessionId, evidenceMessageIds: item.evidenceMessageIds, updatedAt: item.updatedAt });
  }
  document.ai = [...byContent.values()].sort((a, b) => a.id - b.id);
  if (document.manual.length + document.ai.length > USER_MEMORY_ITEM_LIMIT) {
    throw new UserMemoryDomainError("AGENT_USER_MEMORY_LIMIT_REACHED", "User-memory item limit reached");
  }
  const changed = JSON.stringify(document) !== JSON.stringify(original);
  return { changed, document };
}

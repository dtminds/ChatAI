import { createHash } from "node:crypto";
import { isAiUsageEvent, type AiUsageEvent } from "@chatai/contracts";
import {
  sql,
  type Kysely,
  type Selectable,
  type Transaction,
} from "kysely";
import type { Database } from "./schema.js";

const AI_USAGE_OUTBOX_TABLE = "xy_wap_embed_ai_usage_outbox" as const;
export const AI_USAGE_OUTBOX_BATCH_LIMIT = 100;

export type AiUsageOutboxStatus =
  | "pending"
  | "leased"
  | "delivered"
  | "rejected"
  | "dead";

export type AiUsageOutboxRecord = {
  attempt: number;
  deliveredAt: Date | null;
  event: AiUsageEvent;
  id: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
  nextAttemptAt: Date;
  status: AiUsageOutboxStatus;
};

export type AiUsageOutboxEnqueueResult =
  | { id: number; kind: "inserted" }
  | { id: number; kind: "duplicate" };

export class AiUsageEventConflictError extends Error {
  readonly eventKey: string;
  readonly uid: number;

  constructor(uid: number, eventKey: string) {
    super(`AI usage event key already exists with a different payload: ${uid}/${eventKey}`);
    this.name = "AiUsageEventConflictError";
    this.uid = uid;
    this.eventKey = eventKey;
  }
}

export async function enqueueAiUsageEvent(
  transaction: Transaction<Database>,
  event: AiUsageEvent,
  now: Date,
): Promise<AiUsageOutboxEnqueueResult> {
  if (!isAiUsageEvent(event)) throw new Error("Invalid AI usage event");
  const payloadJson = canonicalJson(event);
  const payloadHash = createHash("sha256").update(payloadJson).digest("hex");
  try {
    const result = await transaction.insertInto(AI_USAGE_OUTBOX_TABLE).values({
      attempt: 0,
      billing_key: event.billingKey,
      business_id: event.businessId,
      business_type: event.businessType,
      capability: event.capability,
      delivered_at: null,
      event_key: event.eventKey,
      last_error_code: null,
      last_error_message: null,
      lease_expires_at: null,
      lease_owner: null,
      next_attempt_at: now,
      occurred_at: new Date(event.occurredAt),
      payload_hash: payloadHash,
      payload_json: payloadJson,
      status: "pending",
      uid: event.uid,
    }).executeTakeFirstOrThrow();
    return { id: normalizeId(result.insertId), kind: "inserted" };
  } catch (error) {
    if (!isDuplicateEntryError(error)) throw error;
  }

  const existing = await transaction.selectFrom(AI_USAGE_OUTBOX_TABLE)
    .select(["id", "payload_hash"])
    .where("uid", "=", event.uid)
    .where("event_key", "=", event.eventKey)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (existing.payload_hash !== payloadHash) {
    throw new AiUsageEventConflictError(event.uid, event.eventKey);
  }
  return { id: normalizeId(existing.id), kind: "duplicate" };
}

export async function claimAiUsageOutboxBatch(
  db: Kysely<Database>,
  input: {
    leaseExpiresAt: Date;
    leaseOwner: string;
    limit: number;
    now: Date;
  },
): Promise<AiUsageOutboxRecord[]> {
  const limit = boundAiUsageOutboxBatchLimit(input.limit);
  if (limit === 0) return [];
  return db.transaction().execute(async (transaction) => {
    const expiredRows = await transaction.selectFrom(AI_USAGE_OUTBOX_TABLE).selectAll()
      .where("status", "=", "leased")
      .where("lease_expires_at", "<=", input.now)
      .orderBy("lease_expires_at", "asc")
      .orderBy("id", "asc")
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .execute();
    const remaining = limit - expiredRows.length;
    const pendingRows = remaining === 0
      ? []
      : await transaction.selectFrom(AI_USAGE_OUTBOX_TABLE).selectAll()
          .where("status", "=", "pending")
          .where("next_attempt_at", "<=", input.now)
          .orderBy("next_attempt_at", "asc")
          .orderBy("id", "asc")
          .limit(remaining)
          .forUpdate()
          .skipLocked()
          .execute();
    const rows = [...expiredRows, ...pendingRows];
    if (rows.length === 0) return [];

    const ids = rows.map(row => row.id);
    await transaction.updateTable(AI_USAGE_OUTBOX_TABLE).set({
      attempt: sql<number>`attempt + 1`,
      last_error_code: null,
      last_error_message: null,
      lease_expires_at: input.leaseExpiresAt,
      lease_owner: input.leaseOwner,
      status: "leased",
    }).where("id", "in", ids)
      .where("status", "in", ["pending", "leased"])
      .executeTakeFirstOrThrow();

    return rows.map(row => mapOutboxRecord({
      ...row,
      attempt: row.attempt + 1,
      last_error_code: null,
      last_error_message: null,
      lease_expires_at: input.leaseExpiresAt,
      lease_owner: input.leaseOwner,
      status: "leased",
    }));
  });
}

export async function markAiUsageOutboxDelivered(
  db: Kysely<Database>,
  input: { deliveredAt: Date; id: number; leaseOwner: string },
) {
  return transitionLeasedOutbox(db, input, {
    delivered_at: input.deliveredAt,
    last_error_code: null,
    last_error_message: null,
    status: "delivered",
  });
}

export async function markAiUsageOutboxRetry(
  db: Kysely<Database>,
  input: {
    errorCode: string;
    errorMessage: string;
    id: number;
    leaseOwner: string;
    nextAttemptAt: Date;
  },
) {
  return transitionLeasedOutbox(db, input, {
    last_error_code: truncate(input.errorCode, 128),
    last_error_message: truncate(input.errorMessage, 512),
    next_attempt_at: input.nextAttemptAt,
    status: "pending",
  });
}

export async function markAiUsageOutboxRejected(
  db: Kysely<Database>,
  input: { errorCode: string; errorMessage: string; id: number; leaseOwner: string },
) {
  return transitionLeasedOutbox(db, input, {
    last_error_code: truncate(input.errorCode, 128),
    last_error_message: truncate(input.errorMessage, 512),
    status: "rejected",
  });
}

export async function markAiUsageOutboxDead(
  db: Kysely<Database>,
  input: { errorCode: string; errorMessage: string; id: number; leaseOwner: string },
) {
  return transitionLeasedOutbox(db, input, {
    last_error_code: truncate(input.errorCode, 128),
    last_error_message: truncate(input.errorMessage, 512),
    status: "dead",
  });
}

export function boundAiUsageOutboxBatchLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(Math.floor(limit), AI_USAGE_OUTBOX_BATCH_LIMIT);
}

async function transitionLeasedOutbox(
  db: Kysely<Database>,
  input: { id: number; leaseOwner: string },
  update: {
    delivered_at?: Date | null;
    last_error_code: string | null;
    last_error_message: string | null;
    next_attempt_at?: Date;
    status: Exclude<AiUsageOutboxStatus, "leased">;
  },
) {
  const result = await db.updateTable(AI_USAGE_OUTBOX_TABLE).set({
    ...update,
    lease_expires_at: null,
    lease_owner: null,
  }).where("id", "=", input.id)
    .where("status", "=", "leased")
    .where("lease_owner", "=", input.leaseOwner)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) === 1;
}

function mapOutboxRecord(
  row: Selectable<Database[typeof AI_USAGE_OUTBOX_TABLE]>,
): AiUsageOutboxRecord {
  if (!isAiUsageOutboxStatus(row.status)) {
    throw new Error(`Unknown AI usage outbox status: ${row.status}`);
  }
  const event = typeof row.payload_json === "string"
    ? JSON.parse(row.payload_json) as unknown
    : row.payload_json;
  if (!isAiUsageEvent(event)) {
    throw new Error("AI usage outbox contains an invalid event");
  }
  return {
    attempt: row.attempt,
    deliveredAt: row.delivered_at ? toDate(row.delivered_at) : null,
    event,
    id: normalizeId(row.id),
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at) : null,
    leaseOwner: row.lease_owner,
    nextAttemptAt: toDate(row.next_attempt_at),
    status: row.status,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}

function isDuplicateEntryError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}

function isAiUsageOutboxStatus(status: string): status is AiUsageOutboxStatus {
  return status === "pending"
    || status === "leased"
    || status === "delivered"
    || status === "rejected"
    || status === "dead";
}

function normalizeId(value: bigint | number | string | undefined) {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error("Database returned an invalid AI usage outbox id");
  }
  return normalized;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function truncate(value: string, length: number) {
  const characters = Array.from(value);
  return characters.length <= length ? value : characters.slice(0, length).join("");
}

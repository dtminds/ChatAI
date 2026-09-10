import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AiUsageEvent } from "@chatai/contracts";
import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AI_USAGE_OUTBOX_BATCH_LIMIT,
  AiUsageEventConflictError,
  claimAiUsageOutboxBatch,
  enqueueAiUsageEvent,
  markAiUsageOutboxDead,
  markAiUsageOutboxDelivered,
  markAiUsageOutboxRejected,
  markAiUsageOutboxRetry,
  type Database,
} from "../src/index.js";

const TABLE_PATTERN = /CREATE TABLE IF NOT EXISTS xy_wap_embed_ai_usage_outbox[\s\S]*?\n\) COMMENT='[^']*';/;

describe("MySQL AI usage outbox", () => {
  const databaseName = `chatai_ai_usage_${process.pid}_${randomBytes(6).toString("hex")}`;
  const connectionOptions = readMysqlTestConnectionOptions();
  const adminPool = mysql.createPool({
    ...connectionOptions,
    bigNumberStrings: true,
    connectionLimit: 2,
    supportBigNumbers: true,
    timezone: "+08:00",
  });
  let database: Kysely<Database> | undefined;
  let pool: ReturnType<typeof mysql.createPool> | undefined;

  beforeAll(async () => {
    await adminPool.promise().query("SET GLOBAL time_zone = '+08:00'");
    await adminPool.promise().query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    pool = mysql.createPool({
      ...connectionOptions,
      database: databaseName,
      bigNumberStrings: true,
      connectionLimit: 5,
      supportBigNumbers: true,
      timezone: "+08:00",
    });
    database = new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
    const schemaSql = await readFile(new URL("../../../docs/db/schema.sql", import.meta.url), "utf8");
    const ddl = schemaSql.match(TABLE_PATTERN)?.[0];
    if (!ddl) throw new Error("AI usage outbox DDL is missing from docs/db/schema.sql");
    await pool.promise().query(ddl);
  });

  beforeEach(async () => {
    await requireDatabase().deleteFrom("xy_wap_embed_ai_usage_outbox").execute();
  });

  afterAll(async () => {
    if (database) await database.destroy();
    await adminPool.promise().query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminPool.promise().end();
  });

  it("treats the same event payload as idempotent and rejects conflicting reuse", async () => {
    const db = requireDatabase();
    const usageEvent = event();
    const inserted = await db.transaction().execute(transaction =>
      enqueueAiUsageEvent(transaction, usageEvent, new Date("2026-09-10T08:01:00.000Z"))
    );
    const duplicate = await db.transaction().execute(transaction =>
      enqueueAiUsageEvent(transaction, reorderEvent(usageEvent), new Date("2026-09-10T08:02:00.000Z"))
    );

    expect(inserted).toMatchObject({ kind: "inserted" });
    expect(duplicate).toEqual({ id: inserted.id, kind: "duplicate" });
    await expect(db.transaction().execute(transaction => enqueueAiUsageEvent(transaction, {
      ...usageEvent,
      billingKey: "logical-session:42:manual:1",
    }, new Date("2026-09-10T08:03:00.000Z")))).rejects.toBeInstanceOf(AiUsageEventConflictError);
    const otherTenant = await db.transaction().execute(transaction => enqueueAiUsageEvent(transaction, {
      ...usageEvent,
      uid: 10,
    }, new Date("2026-09-10T08:04:00.000Z")));
    expect(otherTenant.kind).toBe("inserted");
    const count = await db.selectFrom("xy_wap_embed_ai_usage_outbox")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(2);
  });

  it("bounds claims and recovers an expired lease", async () => {
    const db = requireDatabase();
    const now = new Date("2026-09-10T09:00:00.000Z");
    await db.transaction().execute(async transaction => {
      for (let index = 0; index < AI_USAGE_OUTBOX_BATCH_LIMIT + 1; index += 1) {
        await enqueueAiUsageEvent(transaction, event({ eventKey: `insight-job:${index}` }), now);
      }
    });
    const firstClaim = await claimAiUsageOutboxBatch(db, {
      leaseExpiresAt: new Date("2026-09-10T09:01:00.000Z"),
      leaseOwner: "worker-a",
      limit: AI_USAGE_OUTBOX_BATCH_LIMIT + 50,
      now,
    });
    expect(firstClaim).toHaveLength(AI_USAGE_OUTBOX_BATCH_LIMIT);
    expect(firstClaim.every(row => row.attempt === 1 && row.leaseOwner === "worker-a")).toBe(true);

    const secondClaim = await claimAiUsageOutboxBatch(db, {
      leaseExpiresAt: new Date("2026-09-10T09:03:00.000Z"),
      leaseOwner: "worker-b",
      limit: 2,
      now: new Date("2026-09-10T09:02:00.000Z"),
    });
    expect(secondClaim).toHaveLength(2);
    expect(secondClaim.some(row => row.attempt === 2)).toBe(true);
    expect(secondClaim.every(row => row.leaseOwner === "worker-b")).toBe(true);
  });

  it("fences lease ownership across delivered, retry, rejected, and dead transitions", async () => {
    const db = requireDatabase();
    const now = new Date("2026-09-10T10:00:00.000Z");
    const states = ["delivered", "retry", "rejected", "dead"] as const;
    for (const [index, state] of states.entries()) {
      await db.transaction().execute(transaction => enqueueAiUsageEvent(
        transaction,
        event({ eventKey: `transition:${state}:${index}` }),
        now,
      ));
    }
    const claimed = await claimAiUsageOutboxBatch(db, {
      leaseExpiresAt: new Date("2026-09-10T10:01:00.000Z"),
      leaseOwner: "worker-a",
      limit: 4,
      now,
    });
    expect(await markAiUsageOutboxDelivered(db, {
      deliveredAt: now,
      id: claimed[0]!.id,
      leaseOwner: "wrong-worker",
    })).toBe(false);
    expect(await markAiUsageOutboxDelivered(db, {
      deliveredAt: now,
      id: claimed[0]!.id,
      leaseOwner: "worker-a",
    })).toBe(true);
    expect(await markAiUsageOutboxRetry(db, {
      errorCode: "TIMEOUT",
      errorMessage: "timeout",
      id: claimed[1]!.id,
      leaseOwner: "worker-a",
      nextAttemptAt: new Date("2026-09-10T10:05:00.000Z"),
    })).toBe(true);
    expect(await markAiUsageOutboxRejected(db, {
      errorCode: "INVALID_EVENT",
      errorMessage: "invalid event",
      id: claimed[2]!.id,
      leaseOwner: "worker-a",
    })).toBe(true);
    expect(await markAiUsageOutboxDead(db, {
      errorCode: "ATTEMPTS_EXHAUSTED",
      errorMessage: "attempts exhausted",
      id: claimed[3]!.id,
      leaseOwner: "worker-a",
    })).toBe(true);

    const rows = await db.selectFrom("xy_wap_embed_ai_usage_outbox")
      .select(["event_key", "lease_owner", "status"])
      .orderBy("id", "asc")
      .execute();
    expect(rows).toEqual([
      { event_key: "transition:delivered:0", lease_owner: null, status: "delivered" },
      { event_key: "transition:retry:1", lease_owner: null, status: "pending" },
      { event_key: "transition:rejected:2", lease_owner: null, status: "rejected" },
      { event_key: "transition:dead:3", lease_owner: null, status: "dead" },
    ]);
    expect(await claimAiUsageOutboxBatch(db, {
      leaseExpiresAt: new Date("2026-09-10T10:05:00.000Z"),
      leaseOwner: "worker-b",
      limit: 10,
      now: new Date("2026-09-10T10:04:59.999Z"),
    })).toEqual([]);
    const retryClaim = await claimAiUsageOutboxBatch(db, {
      leaseExpiresAt: new Date("2026-09-10T10:06:00.000Z"),
      leaseOwner: "worker-b",
      limit: 10,
      now: new Date("2026-09-10T10:05:00.000Z"),
    });
    expect(retryClaim).toHaveLength(1);
    expect(retryClaim[0]).toMatchObject({
      attempt: 2,
      id: claimed[1]!.id,
      leaseOwner: "worker-b",
      status: "leased",
    });
  });

  function requireDatabase() {
    if (!database) throw new Error("MySQL test database is not initialized");
    return database;
  }
});

function event(overrides: Partial<AiUsageEvent> = {}): AiUsageEvent {
  return {
    billingKey: "logical-session:42:auto",
    billingModel: { creditMultiplier: 150, model: "doubao-seed-2.0-lite", modelId: 3 },
    businessSnapshot: { analysisMode: "automatic" },
    businessId: "42",
    businessType: "logical_session",
    capability: "conversation_insight",
    eventKey: "insight-job:99",
    modelUsages: [{
      inputTokens: 1_200,
      model: "ep-analysis",
      modelId: null,
      outputTokens: 300,
      provider: "volcengine_ark",
      requestCount: 2,
    }],
    occurredAt: "2026-09-10T08:00:00.000Z",
    schemaVersion: 1,
    uid: 9,
    ...overrides,
  } as AiUsageEvent;
}

function reorderEvent(value: AiUsageEvent): AiUsageEvent {
  return {
    uid: value.uid,
    schemaVersion: value.schemaVersion,
    occurredAt: value.occurredAt,
    modelUsages: value.modelUsages.map(usage => ({
      requestCount: usage.requestCount,
      provider: usage.provider,
      outputTokens: usage.outputTokens,
      modelId: usage.modelId,
      model: usage.model,
      inputTokens: usage.inputTokens,
    })),
    eventKey: value.eventKey,
    capability: value.capability,
    businessType: value.businessType,
    businessId: value.businessId,
    businessSnapshot: Object.fromEntries(Object.entries(value.businessSnapshot).reverse()),
    billingModel: {
      modelId: value.billingModel.modelId,
      model: value.billingModel.model,
      creditMultiplier: value.billingModel.creditMultiplier,
    },
    billingKey: value.billingKey,
  } as AiUsageEvent;
}

function readMysqlTestConnectionOptions() {
  return {
    host: readRequiredEnv("AI_USAGE_TEST_MYSQL_HOST"),
    password: readRequiredEnv("AI_USAGE_TEST_MYSQL_PASSWORD"),
    port: Number(readRequiredEnv("AI_USAGE_TEST_MYSQL_PORT")),
    user: readRequiredEnv("AI_USAGE_TEST_MYSQL_USER"),
  };
}

function readRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

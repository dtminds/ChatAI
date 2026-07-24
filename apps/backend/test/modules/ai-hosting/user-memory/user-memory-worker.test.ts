import { describe, expect, it, vi } from "vitest";
import { Kysely, MysqlDialect } from "kysely";
import type { Database } from "../../../../src/db/schema.js";
import {
  buildCandidateSessionQuery,
  buildUserMemoryMessagesQuery,
  groupCandidateSessions,
  resolveNextRunAfter,
  UserMemoryWorker,
} from "../../../../src/modules/ai-hosting/user-memory/user-memory-worker.js";

function createCompileOnlyDb() {
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool: {} as never }) });
}

describe("user memory candidate selection", () => {
  it("keeps first customer rank and all candidate-pool sessions in chronological order", () => {
    const groups = groupCandidateSessions([
      { id: 3, ended_at: 30, message_count: 10, platform: 5, third_external_userid: "a" },
      { id: 2, ended_at: 20, message_count: 9, platform: 5, third_external_userid: "b" },
      { id: 1, ended_at: 10, message_count: 8, platform: 5, third_external_userid: "a" },
    ]);
    expect(groups.map((group) => group.thirdExternalUserId)).toEqual(["a", "b"]);
    expect(groups[0]?.sessions.map((session) => session.id)).toEqual([1, 3]);
  });

  it("compiles a bounded single-chat query without filtering logical-session status", () => {
    const compiled = buildCandidateSessionQuery(createCompileOnlyDb(), {
      uid: 272,
      start: 100,
      end: 200,
      enabledAt: 120,
      limit: 1000,
    }).compile();

    expect(compiled.sql).toContain("`conversation`.`chat_type` = ?");
    expect(compiled.sql).toContain("`session`.`message_count` >= ?");
    expect(compiled.sql).toContain("order by `session`.`message_count` desc, `session`.`ended_at` desc, `session`.`id` desc");
    expect(compiled.sql).toContain("limit ?");
    expect(compiled.sql).not.toContain("`session`.`status`");
    expect(compiled.parameters).toEqual(expect.arrayContaining([272, 100, 200, 120, 5, 1, 1000]));
  });

  it("fetches the final 50 AI-eligible messages per session in chronological order", () => {
    const compiled = buildUserMemoryMessagesQuery(createCompileOnlyDb(), 272, [10, 11]).compile();

    expect(compiled.sql).toContain("row_number() over (partition by ownership.session_id order by ownership.source_message_time desc, ownership.source_message_id desc)");
    expect(compiled.sql).toContain("`ownership`.`uid` = ?");
    expect(compiled.sql).toContain("`ownership`.`included_for_ai` = ?");
    expect(compiled.sql).toContain("`row_number` <= ?");
    expect(compiled.sql).toContain("order by `source_message_time` asc, `source_message_id` asc");
    expect(compiled.parameters).toEqual(expect.arrayContaining([272, 10, 11, 1, 50]));
  });

  it("releases a run at the earliest pending item time instead of hot-looping", () => {
    const now = Date.parse("2026-07-24T02:00:00+08:00");
    expect(resolveNextRunAfter([
      { status: "succeeded", next_attempt_at: null },
      { status: "prepared", next_attempt_at: new Date(now + 30_000) },
      { status: "prepared", next_attempt_at: new Date(now + 60_000) },
    ], now).getTime()).toBe(now + 30_000);
    expect(resolveNextRunAfter([
      { status: "prepared", next_attempt_at: new Date(now - 1) },
    ], now).getTime()).toBe(now);
  });

  it("does not call the model when the selected item transition updates zero rows", async () => {
    const leaseUntil = new Date(Date.now() + 60_000);
    const run = {
      claim_token: "claim-1",
      config_generation: 2,
      id: 7,
      lease_until: leaseUntil,
      locked_by: "worker-1",
      status: "running",
      uid: 272,
    };
    const item = {
      attempt_count: 0,
      id: 11,
      run_id: 7,
      status: "prepared",
    };
    const query = (result: unknown) => {
      const builder = {
        executeTakeFirst: vi.fn().mockResolvedValue(result),
        forUpdate: () => builder,
        orderBy: () => builder,
        selectAll: () => builder,
        where: () => builder,
      };
      return builder;
    };
    const trx = {
      selectFrom: (table: string) => query(
        table === "xy_wap_embed_agent_user_memory_config"
          ? { active_run_id: 7, enabled: 1, generation: 2, uid: 272 }
          : run,
      ),
      updateTable: () => {
        const builder = {
          executeTakeFirst: vi.fn().mockResolvedValue({ numUpdatedRows: 0n }),
          set: () => builder,
          where: () => builder,
        };
        return builder;
      },
    };
    const db = {
      selectFrom: () => query(item),
      transaction: () => ({ execute: (callback: (transaction: typeof trx) => unknown) => callback(trx) }),
    };
    const complete = vi.fn();
    const worker = new UserMemoryWorker({
      customerLimitResolver: { resolve: () => 100 },
      db: db as never,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      provider: { complete } as never,
      workerId: "worker-1",
    });
    const internals = worker as unknown as {
      aggregateOrRelease: (claim: unknown) => Promise<void>;
      prepareInput: () => Promise<unknown>;
      processNextItem: (claim: unknown) => Promise<void>;
    };
    internals.prepareInput = vi.fn().mockResolvedValue({
      document: { ai: [], manual: [], nextId: 1, schemaVersion: 1 },
      manualUpdatedAt: null,
      messages: [{ occurredAt: 1, senderRole: "customer", sessionId: 1, sourceMessageId: 1, text: "偏好无糖" }],
      sessionIds: [1],
      version: 0,
    });
    internals.aggregateOrRelease = vi.fn().mockResolvedValue(undefined);

    await internals.processNextItem({ run, token: "claim-1" });

    expect(complete).not.toHaveBeenCalled();
    expect(internals.aggregateOrRelease).toHaveBeenCalledOnce();
  });
});

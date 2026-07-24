import { describe, expect, it } from "vitest";
import { Kysely, MysqlDialect } from "kysely";
import type { Database } from "../../../../src/db/schema.js";
import {
  buildCandidateSessionQuery,
  buildUserMemoryMessagesQuery,
  groupCandidateSessions,
  resolveNextRunAfter,
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
});

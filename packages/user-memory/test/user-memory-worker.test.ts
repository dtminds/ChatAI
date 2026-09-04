import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlDialect,
  MysqlIntrospector,
  MysqlQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import type { Database } from "@chatai/database";
import {
  buildUserMemoryMessageWindow,
  countSerializedUserMemoryMessageTokensConservatively,
  resolveUserMemoryEvidenceSessionIds,
  trimUserMemoryMessagesToTokenBudget,
} from "../src/user-memory-message-window.js";
import { buildUserMemoryPrompt, type UserMemoryInputMessage } from "../src/user-memory-provider.js";
import {
  buildCandidateSessionQuery,
  buildUserMemoryMessageDetailsQuery,
  buildUserMemoryMessagesQuery,
  groupCandidateSessions,
  UserMemoryWorker,
} from "../src/user-memory-worker.js";

function createCompileOnlyDb() {
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool: {} as never }) });
}

function message(id: number, sessionId: number, text: string) {
  return { occurredAt: id, senderRole: "customer", sessionId, sourceMessageId: id, text };
}

describe("user memory candidate selection", () => {
  it("skips locked run candidates while claiming work", async () => {
    const run = {
      claim_token: null,
      config_generation: 2,
      id: 7,
      lease_until: null,
      locked_by: null,
      phase: "selecting",
      run_after: new Date(Date.now() - 1_000),
      scheduled_for: new Date(Date.now() - 60_000),
      started_at: null,
      status: "pending",
      uid: 272,
    };
    const { db, queries } = createRecordingDatabase((query) => {
      if (query.sql.includes("from `xy_wap_embed_agent_user_memory_run`")) {
        return { rows: [run] };
      }
      if (query.sql.includes("from `xy_wap_embed_agent_user_memory_config`")) {
        return { rows: [{
          active_run_id: run.id,
          enabled: 1,
          extraction_instruction: "",
          generation: run.config_generation,
          uid: run.uid,
        }] };
      }
      if (query.sql.startsWith("update `xy_wap_embed_agent_user_memory_run`")) {
        return { numAffectedRows: 1n, rows: [] };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    });
    const worker = new UserMemoryWorker({
      customerLimitResolver: { resolve: () => 100 },
      db,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      provider: { complete: vi.fn() } as never,
      workerId: "worker-1",
    });
    const claimOne = (worker as unknown as {
      claimOne: () => Promise<unknown>;
    }).claimOne.bind(worker);

    await expect(claimOne()).resolves.toBeDefined();

    const claimSelects = queries.filter((query) => query.sql.startsWith("select"));
    expect(claimSelects[0]?.sql).toContain("for update skip locked");
    expect(claimSelects[1]?.sql).toContain("for update skip locked");
    await db.destroy();
  });

  it("groups by customer within the claimed UID and drops empty customer IDs before quota slicing", () => {
    const groups = groupCandidateSessions([
      { id: 4, conversation_id: 40, started_at: 40, message_count: 11, third_external_userid: "" },
      { id: 3, conversation_id: 30, started_at: 30, message_count: 10, third_external_userid: "a" },
      { id: 2, conversation_id: 20, started_at: 20, message_count: 9, third_external_userid: "b" },
      { id: 1, conversation_id: 10, started_at: 10, message_count: 8, third_external_userid: "a" },
    ]);
    expect(groups.map((group) => group.thirdExternalUserId)).toEqual(["a", "b"]);
    expect(groups[0]?.sessions.map((session) => session.id)).toEqual([1, 3]);
    expect(groups[0]?.sessions.map((session) => session.conversation_id)).toEqual([10, 30]);
    expect(groups.every((group) => group.platform === 5)).toBe(true);
    expect(groups.slice(0, 1)[0]?.thirdExternalUserId).toBe("a");
  });

  it("compiles a bounded logical-session-only candidate query for one UID", () => {
    const compiled = buildCandidateSessionQuery(createCompileOnlyDb(), {
      uid: 272,
      start: 121,
      end: 200,
      limit: 1000,
    }).compile();

    expect(compiled.sql).toContain("from `xy_wap_embed_logical_session` as `session`");
    expect(compiled.sql).not.toContain("join");
    expect(compiled.sql).not.toContain("xy_wap_embed_conversation");
    expect(compiled.sql).toContain("`session`.`conversation_id`");
    expect(compiled.sql).toContain("`session`.`message_count` >= ?");
    expect(compiled.sql).toContain("order by `session`.`message_count` desc");
    expect(compiled.sql).not.toContain("`session`.`started_at` desc");
    expect(compiled.sql).not.toContain("`session`.`id` desc");
    expect(compiled.sql).toContain("limit ?");
    expect(compiled.sql).not.toContain("`session`.`third_external_userid` !=");
    expect(compiled.sql).not.toContain("`session`.`status`");
    expect(compiled.sql).not.toContain("`session`.`ended_at`");
    expect(compiled.parameters).toEqual([272, 121, 200, 5, 1000]);
  });

  it("selects candidates from the start of the complete quota date instead of the enable time", async () => {
    const quotaDate = new Date("2026-08-05T12:00:00+08:00");
    const dayStart = Date.parse("2026-08-05T00:00:00+08:00");
    const dayEnd = Date.parse("2026-08-06T00:00:00+08:00");
    const leaseUntil = new Date(Date.now() + 60_000);
    const run = {
      candidate_session_limit: 200,
      claim_token: "claim-1",
      config_generation: 2,
      customer_limit: 100,
      id: 7,
      lease_until: leaseUntil,
      locked_by: "worker-1",
      quota_date: quotaDate,
      status: "running",
      uid: 272,
    };
    const { db, queries } = createRecordingDatabase((query) => {
      if (query.sql.includes("from `xy_wap_embed_logical_session` as `session`")) {
        return { rows: [] };
      }
      if (query.sql.includes("from `xy_wap_embed_agent_user_memory_config`")) {
        return { rows: [{ active_run_id: 7, enabled: 1, generation: 2, uid: 272 }] };
      }
      if (query.sql.includes("from `xy_wap_embed_agent_user_memory_run`")) {
        return { rows: [run] };
      }
      if (query.sql.startsWith("update")) {
        return { numAffectedRows: 1n, rows: [] };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    });
    const worker = new UserMemoryWorker({
      customerLimitResolver: { resolve: () => 100 },
      db,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      provider: { complete: vi.fn() } as never,
      workerId: "worker-1",
    });
    const selectCandidates = (worker as unknown as {
      selectCandidates: (claim: unknown) => Promise<void>;
    }).selectCandidates.bind(worker);

    await selectCandidates({ run, token: "claim-1" });

    expect(queries[0]?.sql).toContain("from `xy_wap_embed_logical_session` as `session`");
    expect(queries[0]?.parameters).toEqual([272, dayStart, dayEnd, 5, 200]);
    await db.destroy();
  });

  it("fetches the latest 100 AI-eligible messages across candidate conversations with fixed time bounds", () => {
    const compiled = buildUserMemoryMessagesQuery(createCompileOnlyDb(), {
      uid: 272,
      conversationIds: [10, 11],
      dayEnd: 500,
    }).compile();

    expect(compiled.sql).not.toContain("join");
    expect(compiled.sql).not.toContain("row_number");
    expect(compiled.sql).toContain("`ownership`.`uid` = ?");
    expect(compiled.sql).toContain("`ownership`.`conversation_id` in (?, ?)");
    expect(compiled.sql).toContain("`ownership`.`included_for_ai` = ?");
    expect(compiled.sql).toContain("`ownership`.`source_message_time` < ?");
    expect(compiled.sql).not.toContain("`ownership`.`source_message_time` > ?");
    expect(compiled.sql).toContain("order by `ownership`.`source_message_time` desc, `ownership`.`source_message_id` desc");
    expect(compiled.sql).toContain("limit ?");
    expect(compiled.parameters).toEqual([272, 10, 11, 1, 500, 100]);
  });

  it("fetches message details in one separate UID-scoped query", () => {
    const compiled = buildUserMemoryMessageDetailsQuery(createCompileOnlyDb(), 272, [101, 102]).compile();

    expect(compiled.sql).toContain("from `xy_wap_embed_msg_audit_info` as `message`");
    expect(compiled.sql).not.toContain("join");
    expect(compiled.sql).toContain("`message`.`uid` = ?");
    expect(compiled.sql).toContain("`message`.`id` in (?, ?)");
    expect(compiled.parameters).toEqual([272, 101, 102]);
  });

  it("counts the exact serialized message array including metadata and JSON escaping", () => {
    const messages = [message(1, 10, "引号\"、反斜杠\\、换行\n和 emoji 🍉")];

    expect(countSerializedUserMemoryMessageTokensConservatively(messages))
      .toBe(Buffer.byteLength(JSON.stringify(messages), "utf8"));
  });

  it("keeps the newest messages within budget and returns them in chronological order", () => {
    const newest = message(3, 30, "最新消息");
    const middle = message(2, 20, "中间消息");
    const oldest = message(1, 10, "最早消息");
    const budget = countSerializedUserMemoryMessageTokensConservatively([middle, newest]);

    const result = trimUserMemoryMessagesToTokenBudget([newest, middle, oldest], budget);

    expect(result).toEqual([middle, newest]);
    expect(countSerializedUserMemoryMessageTokensConservatively(result)).toBeLessThanOrEqual(budget);
    expect(resolveUserMemoryEvidenceSessionIds(result)).toEqual([20, 30]);
  });

  it("truncates an oversized latest message without splitting Unicode code points", () => {
    const newest = message(3, 30, "🍉".repeat(500));
    const budget = 300;

    const result = trimUserMemoryMessagesToTokenBudget([newest], budget);

    expect(result).toHaveLength(1);
    expect(result[0]?.text.length).toBeGreaterThan(0);
    expect(result[0]?.text).not.toContain("�");
    expect(countSerializedUserMemoryMessageTokensConservatively(result)).toBeLessThanOrEqual(budget);
  });

  it("builds evidence sessions from the final readable cross-session message window", () => {
    const messages = buildUserMemoryMessageWindow([
      { sender_role: "customer", session_id: 30, source_message_id: 3, source_message_time: 300 },
      { sender_role: "agent", session_id: 20, source_message_id: 2, source_message_time: 200 },
      { sender_role: "customer", session_id: 10, source_message_id: 1, source_message_time: 100 },
    ], [
      { content: JSON.stringify({ content: "最新客户消息" }), id: 3, msgtype: "text" },
      { content: JSON.stringify({ content: "客服上下文" }), id: 2, msgtype: "text" },
    ]);

    expect(messages.map((item) => item.sourceMessageId)).toEqual([2, 3]);
    expect(resolveUserMemoryEvidenceSessionIds(messages)).toEqual([20, 30]);
    expect(messages.some((item) => item.sessionId === 10)).toBe(false);
  });

  it("prepares current manual memory and recent messages when manual update is after the target day", async () => {
    const quotaDate = new Date("2026-08-03T12:00:00+08:00");
    const dayEnd = Date.parse("2026-08-04T00:00:00+08:00");
    const manualUpdatedAt = Date.parse("2026-08-04T00:30:00+08:00");
    const storedDocument = {
      schemaVersion: 1 as const,
      nextItemId: 3,
      manual: [{
        id: 1,
        category: "preference" as const,
        content: "偏好无糖",
        createdAt: manualUpdatedAt,
        updatedAt: manualUpdatedAt,
        expiresAt: null,
        updatedBySubUserId: 8,
      }],
      ai: [{
        id: 2,
        category: "customer_profile" as const,
        content: "家有儿童",
        createdAt: manualUpdatedAt,
        updatedAt: manualUpdatedAt,
        expiresAt: null,
        sourceSessionId: 50,
        evidenceMessageIds: [500],
      }],
    };
    const { db, queries } = createRecordingDatabase((query) => {
      if (query.sql.includes("from `xy_wap_embed_agent_user_memory`")) {
        return { rows: [{
          last_auto_quota_date: null,
          manual_updated_at: manualUpdatedAt,
          memories_json: JSON.stringify(storedDocument),
          version: 4,
        }] };
      }
      if (query.sql.includes("from `xy_wap_embed_logical_session` as `session`")) {
        return { rows: [
          { id: 11, conversation_id: 700 },
          { id: 12, conversation_id: 700 },
        ] };
      }
      if (query.sql.includes("from `xy_wap_embed_logical_session_message` as `ownership`")) {
        return { rows: [
          { sender_role: "customer", session_id: 99, conversation_id: 700, source_message_id: 1003, source_message_time: dayEnd - 1_000 },
          { sender_role: "agent", session_id: 98, conversation_id: 700, source_message_id: 1002, source_message_time: dayEnd - 2_000 },
          { sender_role: "customer", session_id: 99, conversation_id: 700, source_message_id: 1001, source_message_time: dayEnd - 3_000 },
        ] };
      }
      if (query.sql.includes("from `xy_wap_embed_msg_audit_info` as `message`")) {
        return { rows: [
          { id: 1001, msgtype: "text", content: JSON.stringify({ content: "历史客户消息" }) },
          { id: 1002, msgtype: "text", content: JSON.stringify({ content: "客服上下文" }) },
          { id: 1003, msgtype: "text", content: JSON.stringify({ content: "最新客户消息" }) },
        ] };
      }
      throw new Error(`Unexpected query: ${query.sql}`);
    });
    const worker = new UserMemoryWorker({
      customerLimitResolver: { resolve: () => 100 },
      db,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      provider: { complete: vi.fn() } as never,
      workerId: "worker-1",
    });
    const prepareInput = (worker as unknown as {
      prepareInput: (claim: unknown, item: unknown) => Promise<{
        document: typeof storedDocument;
        extractionInstruction: string;
        messages: UserMemoryInputMessage[];
        version: number;
      } | undefined>;
    }).prepareInput.bind(worker);

    const prepared = await prepareInput({
      extractionInstruction: "关注长期偏好",
      run: { quota_date: quotaDate },
    }, {
      platform: 5,
      session_ids_json: JSON.stringify([11, 12]),
      third_external_userid: "customer-1",
      uid: 272,
    });

    expect(prepared).toMatchObject({
      document: storedDocument,
      extractionInstruction: "关注长期偏好",
      version: 4,
    });
    expect(prepared?.messages.map((item) => item.sourceMessageId)).toEqual([1001, 1002, 1003]);
    expect([...new Set(prepared?.messages.map((item) => item.sessionId))]).toEqual([99, 98]);
    expect(queries).toHaveLength(4);
    expect(queries[1]?.parameters).toEqual([272, 11, 12]);
    expect(manualUpdatedAt).toBeGreaterThan(dayEnd);
    expect(queries[2]?.parameters).toEqual([272, 700, 1, dayEnd, 100]);
    expect(queries[2]?.sql).not.toContain("join");
    expect(queries[2]?.sql).not.toContain("`ownership`.`source_message_time` > ?");
    expect(queries[3]?.parameters).toEqual([272, 1003, 1002, 1001]);
    const userPrompt = buildUserMemoryPrompt({
      document: prepared!.document,
      extractionInstruction: prepared!.extractionInstruction,
      messages: prepared!.messages,
      now: dayEnd + 60 * 60_000,
    }).find((item) => item.role === "user");
    const modelInput = JSON.parse(userPrompt!.content) as {
      current: { ai: Array<{ content: string }>; manual: Array<{ content: string }> };
      messages: Array<{ sourceMessageId: number }>;
    };
    expect(modelInput.current.manual.map((item) => item.content)).toEqual(["偏好无糖"]);
    expect(modelInput.current.ai.map((item) => item.content)).toEqual(["家有儿童"]);
    expect(modelInput.messages.map((item) => item.sourceMessageId)).toEqual([1001, 1002, 1003]);
    await db.destroy();
  });

  it("does not call the model again after an item has already been attempted", async () => {
    const item = { attempt_count: 1, id: 11, run_id: 7, status: "submitted" };
    const builder = {
      executeTakeFirst: vi.fn().mockResolvedValue(item),
      orderBy: () => builder,
      selectAll: () => builder,
      where: () => builder,
    };
    const complete = vi.fn();
    const worker = new UserMemoryWorker({
      customerLimitResolver: { resolve: () => 100 },
      db: { selectFrom: () => builder } as never,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as never,
      provider: { complete } as never,
      workerId: "worker-1",
    });
    const internals = worker as unknown as {
      failItem: ReturnType<typeof vi.fn>;
      prepareInput: ReturnType<typeof vi.fn>;
      processNextItem: (claim: unknown) => Promise<void>;
    };
    internals.failItem = vi.fn().mockResolvedValue(undefined);
    internals.prepareInput = vi.fn();

    await internals.processNextItem({ run: { id: 7 }, token: "claim-1" });

    expect(internals.failItem).toHaveBeenCalledWith(
      expect.anything(),
      item,
      expect.objectContaining({ message: "AGENT_USER_MEMORY_MODEL_REQUEST_ALREADY_SUBMITTED" }),
      { forceTerminal: true },
    );
    expect(internals.prepareInput).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
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
      messages: [{ occurredAt: 1, senderRole: "customer", sessionId: 1, sourceMessageId: 1, text: "偏好无糖" }],
      version: 0,
    });
    internals.aggregateOrRelease = vi.fn().mockResolvedValue(undefined);

    await internals.processNextItem({ run, token: "claim-1" });

    expect(complete).not.toHaveBeenCalled();
    expect(internals.aggregateOrRelease).toHaveBeenCalledOnce();
  });
});

function createRecordingDatabase(resolve: (query: CompiledQuery) => QueryResult<unknown>) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);
      return resolve(query) as QueryResult<R>;
    },
    streamQuery: async function* <R>(): AsyncIterableIterator<QueryResult<R>> {
      yield { rows: [] };
    },
  };
  const fallback = new DummyDriver();
  const driver: Driver = {
    ...fallback,
    acquireConnection: async () => connection,
    beginTransaction: async () => undefined,
    commitTransaction: async () => undefined,
    destroy: async () => undefined,
    init: async () => undefined,
    releaseConnection: async () => undefined,
    rollbackTransaction: async () => undefined,
    releaseSavepoint: async () => undefined,
    rollbackToSavepoint: async () => undefined,
    savepoint: async () => undefined,
  };
  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (database) => new MysqlIntrospector(database),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
  });
  return { db, queries };
}

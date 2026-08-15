import { describe, expect, it } from "vitest";
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
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import {
  buildMessageQueryMessagesQuery,
  buildMessageQuerySeatQuery,
  executeMessageQuery,
  formatMessageQueryRow,
} from "../src/message-query-port.js";

describe("Workflow Message Query port", () => {
  it("builds an isolated msgtime query without joins", () => {
    const database = createCompileOnlyDatabase();
    const seatQuery = buildMessageQuerySeatQuery(database, { seatId: 101, uid: 9 }).compile();
    const messageQuery = buildMessageQueryMessagesQuery(database, {
      limit: 10,
      rangeEnd: 1_786_742_400_000,
      rangeStart: 1_786_738_800_000,
      seatId: 101,
      subjectId: "third-external-1",
      take: "latest",
      thirdUserId: "work-user-1",
      uid: 9,
    }).compile();

    expect(seatQuery.sql).toContain("from `xy_wap_embed_user_seat`");
    expect(seatQuery.sql).toContain("`uid` = ?");
    expect(seatQuery.sql).toContain("`id` = ?");
    expect(messageQuery.sql).toContain("from `xy_wap_embed_msg_audit_info`");
    expect(messageQuery.sql).not.toContain(" join ");
    expect(messageQuery.sql).toContain("`uid` = ?");
    expect(messageQuery.sql).toContain("`platform` = ?");
    expect(messageQuery.sql).toContain("`third_user_id` = ?");
    expect(messageQuery.sql).toContain("`third_external_id` = ?");
    expect(messageQuery.sql).toContain("`chat_type` = ?");
    expect(messageQuery.sql).toContain("`status` = ?");
    expect(messageQuery.sql).toContain("`revoke_status` = ?");
    expect(messageQuery.sql).toContain("`revoke_status` is null");
    expect(messageQuery.sql).toContain("`msgtime` >= ?");
    expect(messageQuery.sql).toContain("`msgtime` <= ?");
    expect(messageQuery.sql).not.toContain("create_time");
    expect(messageQuery.sql).toContain("order by `msgtime` desc, `id` desc");
    expect(messageQuery.sql).toContain("limit ?");
  });

  it("returns latest messages in chronological order with sender roles", async () => {
    const { database, queries } = createRecordingDatabase((query) => {
      if (query.sql.includes("xy_wap_embed_user_seat")) {
        return { rows: [{ third_userid: "work-user-1" }] };
      }
      return {
        rows: [
          {
            content: JSON.stringify({ text: "收到" }),
            from_type: 1,
            id: "9002",
            msgtime: 1_786_742_100_000,
            msgtype: "text",
          },
          {
            content: JSON.stringify({ content: "价格是多少" }),
            from_type: 2,
            id: "9001",
            msgtime: 1_786_741_800_000,
            msgtype: "text",
          },
        ],
      };
    });

    await expect(executeMessageQuery(database, {
      command: {
        limit: 2,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    })).resolves.toEqual({
      messageCount: 2,
      messageIds: [9001, 9002],
      rangeEnd: new Date(1_786_742_400_000).toISOString(),
      rangeStart: new Date(1_786_738_800_000).toISOString(),
      textContent: "客户: 价格是多少\n托管账号: 收到",
    });

    expect(queries).toHaveLength(2);
    expect(queries[1]?.parameters).toEqual(expect.arrayContaining([
      9,
      5,
      "work-user-1",
      "third-external-1",
      1_786_738_800_000,
      1_786_742_400_000,
      2,
    ]));
  });

  it("keeps oversized message content within the node output envelope", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [{
            content: JSON.stringify({ text: "很长的消息".repeat(5_000) }),
            from_type: 2,
            id: 9001,
            msgtime: 1_786_741_800_000,
            msgtype: "text",
          }],
        });

    const result = await executeMessageQuery(database, {
      command: {
        limit: 1,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "earliest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    });

    expect(result).toMatchObject({ messageCount: 1, messageIds: [9001] });
    expect(result.textContent).toMatch(/^客户: 很长的消息/);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(8 * 1_024);
    expect(result.textContent).toMatch(/\[内容已截断\]$/);
  });

  it("drops older messages first when the latest result exceeds the output envelope", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [
            messageRow(9003, `LATEST-START-${"c".repeat(10_000)}-LATEST-END`),
            messageRow(9002, `MIDDLE-${"b".repeat(5_000)}`),
            messageRow(9001, `EARLIEST-${"a".repeat(5_000)}`),
          ],
        });

    const result = await executeMessageQuery(database, {
      command: {
        limit: 3,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    });

    expect(result).toMatchObject({ messageCount: 1, messageIds: [9003] });
    expect(result.textContent).toMatch(/^\[内容已截断\]/);
    expect(result.textContent).not.toContain("LATEST-START-");
    expect(result.textContent).toMatch(/-LATEST-END$/);
    expect(result.textContent).not.toContain("MIDDLE-");
    expect(result.textContent).not.toContain("EARLIEST-");
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(8 * 1_024);
  });

  it("returns an empty result when no messages match", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : { rows: [] });

    await expect(executeMessageQuery(database, {
      command: {
        limit: 10,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    })).resolves.toMatchObject({
      messageCount: 0,
      messageIds: [],
      textContent: "",
    });
  });

  it("stops before querying messages when the managed account is unavailable", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));

    await expect(executeMessageQuery(database, {
      command: {
        limit: 10,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    })).rejects.toMatchObject({ code: "WORKFLOW_MESSAGE_QUERY_SEAT_UNAVAILABLE" });
    expect(queries).toHaveLength(1);
  });

  it("formats non-text messages without exposing raw payloads", () => {
    expect(formatMessageQueryRow({
      content: JSON.stringify({ fileSerialNo: "secret" }),
      from_type: 2,
      id: 1,
      msgtype: "image",
    })).toBe("客户: [图片]");
    expect(formatMessageQueryRow({
      content: JSON.stringify({ text: "自动回复" }),
      from_type: 3,
      id: 2,
      msgtype: "text",
    })).toBe("机器人: 自动回复");
  });
});

function messageRow(id: number, text: string) {
  return {
    content: JSON.stringify({ text }),
    from_type: 2,
    id,
    msgtype: "text",
  };
}

function createCompileOnlyDatabase() {
  return new Kysely<WorkflowDatabase>({
    dialect: new MysqlDialect({ pool: {} as never }),
  });
}

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
    releaseSavepoint: async () => undefined,
    rollbackToSavepoint: async () => undefined,
    rollbackTransaction: async () => undefined,
    savepoint: async () => undefined,
  };
  const database = new Kysely<WorkflowDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: db => new MysqlIntrospector(db),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
  });
  return { database, queries };
}

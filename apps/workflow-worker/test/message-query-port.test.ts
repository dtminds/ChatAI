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
  MysqlWorkflowMessageQueryPort,
} from "../src/message-query-port.js";

describe("Workflow Message Query port", () => {
  it("rejects a missing prepared thirdExternalUserId before querying MySQL", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));
    const port = new MysqlWorkflowMessageQueryPort(database);

    await expect(port.execute({
      command: {
        limit: 10,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      identities: {},
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_QUERY_SUBJECT_INVALID",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(0);
  });

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
      messages: [
        {
          id: 9001,
          parts: [{ text: "价格是多少", type: "text" }],
          role: "customer",
        },
        {
          id: 9002,
          parts: [{ text: "收到", type: "text" }],
          role: "agent",
        },
      ],
      rangeEnd: new Date(1_786_742_400_000).toISOString(),
      rangeStart: new Date(1_786_738_800_000).toISOString(),
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

  it("removes an oversized whole message without truncating its parts", async () => {
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

    expect(result).toMatchObject({ messageCount: 1, messages: [] });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(8 * 1_024);
  });

  it("drops older messages first when the latest result exceeds the output envelope", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [
            messageRow(9003, `LATEST-START-${"c".repeat(4_000)}-LATEST-END`),
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

    expect(result).toMatchObject({
      messageCount: 3,
      messages: [{ id: 9003, role: "customer" }],
    });
    expect(result.messages[0]?.parts).toEqual([{
      text: `LATEST-START-${"c".repeat(4_000)}-LATEST-END`,
      type: "text",
    }]);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(8 * 1_024);
  });

  it("drops newer messages first for an oversized earliest result", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [
            messageRow(9001, `EARLIEST-${"a".repeat(4_000)}`),
            messageRow(9002, `MIDDLE-${"b".repeat(5_000)}`),
            messageRow(9003, `LATEST-${"c".repeat(5_000)}`),
          ],
        });

    const result = await executeMessageQuery(database, {
      command: {
        limit: 3,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "earliest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    });

    expect(result).toMatchObject({
      messageCount: 3,
      messages: [{ id: 9001, role: "customer" }],
    });
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
      messages: [],
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
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_QUERY_SEAT_UNAVAILABLE",
      message: "执行所需数据不可用，流程已停止",
    });
    expect(queries).toHaveLength(1);
  });

  it("reports an invalid message id as a result error", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [{
            content: JSON.stringify({ text: "无效消息" }),
            from_type: 2,
            id: "invalid-id",
            msgtime: 1_786_741_800_000,
            msgtype: "text",
          }],
        });

    await expect(executeMessageQuery(database, {
      command: {
        limit: 1,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_QUERY_OUTPUT_INVALID",
      message: "返回结果异常，流程已停止",
    });
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

  it("preserves ordered multimodal parts and marks unsupported content", async () => {
    const { database } = createRecordingDatabase((query) => query.sql.includes("user_seat")
      ? { rows: [{ third_userid: "work-user-1" }] }
      : {
          rows: [{
            content: JSON.stringify([
              { msgtype: "text", text: "看下这个" },
              { fileUrl: "/media/error.png", msgtype: "image" },
              { msgtype: "text", text: "怎么处理？" },
              { msgtype: "voice" },
              { msgtype: "video", videoUrl: "https://media.example/demo.mp4" },
            ]),
            from_type: 2,
            id: 9001,
            msgtype: "mixed",
          }],
        });

    await expect(executeMessageQuery(database, {
      command: {
        limit: 1,
        rangeEnd: 1_786_742_400_000,
        rangeStart: 1_786_738_800_000,
        seatId: 101,
        take: "latest",
      },
      signal: new AbortController().signal,
      subjectId: "third-external-1",
      uid: 9,
    })).resolves.toMatchObject({
      messages: [{
        id: 9001,
        parts: [
          { text: "看下这个", type: "text" },
          { type: "image", url: "/media/error.png" },
          { text: "怎么处理？", type: "text" },
          { label: "语音", type: "unsupported" },
          { type: "video", url: "https://media.example/demo.mp4" },
        ],
        role: "customer",
      }],
    });
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

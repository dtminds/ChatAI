import { describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from "kysely";
import { WORKBENCH_MESSAGE_SOURCE } from "@chatai/contracts";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import { MysqlWorkflowAiCollectConversationPort } from "../src/ai-collect-conversation-port.js";

describe("MysqlWorkflowAiCollectConversationPort", () => {
  it("marks the opening message with its Workflow source", async () => {
    const { database } = createRecordingDatabase(() => ({
      rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }],
    }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      data: { optNo: "opt-1" },
      success: true,
    }), { status: 200 }));
    const port = new MysqlWorkflowAiCollectConversationPort(database, {
      baseUrl: "https://java.example.com",
      fetch: fetchImpl as typeof fetch,
    });

    await port.sendOpeningMessage({
      idempotencyKey: "9:run-1:collect-1:1:opening",
      message: "请提供订单号",
      seatId: 101,
      signal: new AbortController().signal,
      thirdExternalUserId: "external-1",
      uid: 9,
      workflowId: "31",
    });

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      source: WORKBENCH_MESSAGE_SOURCE.WORKFLOW,
      sourceId: "31",
    });
  });

  it("resolves only the active direct conversation scoped to the tenant and seat", async () => {
    const { database, queries } = createRecordingDatabase(query => query.sql.includes("user_seat")
      ? { rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }] }
      : { rows: [{ id: 501 }] });
    const port = new MysqlWorkflowAiCollectConversationPort(database, { baseUrl: "http://java.local" });

    await expect(port.resolveConversation({
      seatId: 101,
      thirdExternalUserId: "external-1",
      uid: 9,
    })).resolves.toEqual({ conversationId: 501 });

    expect(queries).toHaveLength(2);
    const conversationQuery = queries[1]!;
    expect(conversationQuery.sql).toContain("from `xy_wap_embed_conversation`");
    expect(conversationQuery.sql).toContain("`uid` = ?");
    expect(conversationQuery.sql).toContain("`platform` = ?");
    expect(conversationQuery.sql).toContain("`third_userid` = ?");
    expect(conversationQuery.sql).toContain("`third_external_userid` = ?");
    expect(conversationQuery.sql).toContain("`chat_type` = ?");
    expect(conversationQuery.sql).toContain("`biz_status` = ?");
    expect(conversationQuery.sql).toContain("order by `id` desc");
    expect(conversationQuery.sql).toContain("limit ?");
    expect(conversationQuery.parameters).toEqual([
      9,
      5,
      "work-user-1",
      "external-1",
      1,
      1,
      1,
    ]);
  });

  it("queries the scoped customer-message stream with a stable cursor and bounded page", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => messageRow(index + 1, 1_000 + index));
    const { database, queries } = createRecordingDatabase(query => query.sql.includes("user_seat")
      ? { rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }] }
      : { rows });
    const port = new MysqlWorkflowAiCollectConversationPort(database, { baseUrl: "http://java.local" });

    const result = await port.readCustomerMessages({
      after: { id: 900, timestamp: 999 },
      seatId: 101,
      thirdExternalUserId: "external-1",
      uid: 9,
      until: new Date(2_000),
    });

    expect(result).toMatchObject({
      cursor: { id: 50, timestamp: 1_049 },
      hasMore: true,
    });
    expect(result.messages).toHaveLength(50);
    expect(queries).toHaveLength(2);
    const messageQuery = queries[1]!;
    expect(messageQuery.sql).toContain("from `xy_wap_embed_msg_audit_info`");
    expect(messageQuery.sql).toContain("`uid` = ?");
    expect(messageQuery.sql).toContain("`platform` = ?");
    expect(messageQuery.sql).toContain("`third_user_id` = ?");
    expect(messageQuery.sql).toContain("`third_external_id` = ?");
    expect(messageQuery.sql).toContain("`chat_type` = ?");
    expect(messageQuery.sql).toContain("`from_type` = ?");
    expect(messageQuery.sql).toContain("`status` = ?");
    expect(messageQuery.sql).toContain("`revoke_status` = ?");
    expect(messageQuery.sql).toContain("`revoke_status` is null");
    expect(messageQuery.sql).toContain("`msgtime` <= ?");
    expect(messageQuery.sql).toContain("`msgtime` > ?");
    expect(messageQuery.sql).toContain("`msgtime` = ?");
    expect(messageQuery.sql).toContain("`id` > ?");
    expect(messageQuery.sql).toContain("order by `msgtime` asc, `id` asc");
    expect(messageQuery.sql).toContain("limit ?");
    expect(messageQuery.parameters).toEqual(expect.arrayContaining([
      9,
      5,
      "work-user-1",
      "external-1",
      1,
      2,
      1,
      2_000,
      999,
      900,
      51,
    ]));
  });

  it("advances the cursor only through messages retained by the output envelope", async () => {
    const { database } = createRecordingDatabase(query => query.sql.includes("user_seat")
      ? { rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }] }
      : {
          rows: [
            messageRow(1, 1_000, `FIRST-${"a".repeat(5_000)}`),
            messageRow(2, 1_001, `SECOND-${"b".repeat(5_000)}`),
          ],
        });
    const port = new MysqlWorkflowAiCollectConversationPort(database, { baseUrl: "http://java.local" });

    const result = await port.readCustomerMessages({
      after: null,
      seatId: 101,
      thirdExternalUserId: "external-1",
      uid: 9,
      until: new Date(2_000),
    });

    expect(result).toMatchObject({
      cursor: { id: 1, timestamp: 1_000 },
      hasMore: true,
      messages: [{ id: 1, role: "customer" }],
    });
    expect(Buffer.byteLength(JSON.stringify({ messages: result.messages }), "utf8"))
      .toBeLessThanOrEqual(8 * 1_024);
  });
});

function messageRow(id: number, msgtime: number, text = `message-${id}`) {
  return {
    content: JSON.stringify({ text }),
    from_type: 2,
    id,
    msgtime,
    msgtype: "text",
  };
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

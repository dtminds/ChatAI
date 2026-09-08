import { describe, expect, it } from "vitest";
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
import type { Database } from "@chatai/database";
import {
  WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING,
} from "@chatai/workflow-runtime";
import { MysqlWorkflowTicketCreateCapabilityPort } from "../src/ticket-create-capability-port.js";

describe("Workflow Ticket Create capability port", () => {
  it("creates a ticket from the Run-frozen seat and active ChatAI conversation", async () => {
    const { database, queries } = createRecordingDatabase(query => {
      if (query.sql.includes("xy_wap_embed_user_seat")) {
        return { rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }] };
      }
      if (query.sql.includes("xy_wap_embed_conversation") && query.sql.includes("select")) {
        return { rows: [{ id: 301 }] };
      }
      if (query.sql.includes("seat.host_sub_id as assignee_sub_user_id")) {
        return { rows: [{ assignee_sub_user_id: 102 }] };
      }
      if (query.sql.includes("insert into `xy_wap_embed_session_action_item`")) {
        return { insertId: 501n, rows: [] };
      }
      return { rows: [] };
    });

    await expect(new MysqlWorkflowTicketCreateCapabilityPort(database).execute(
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      request(),
    )).resolves.toEqual({});

    const sql = queries.map(query => query.sql).join("\n");
    expect(sql).toContain("xy_wap_embed_user_seat");
    expect(sql).toContain("xy_wap_embed_conversation");
    expect(sql).toContain("insert into `xy_internal_request_idempotent`");
    expect(sql).toContain("insert into `xy_wap_embed_session_action_item`");
    expect(sql).toContain("insert into `xy_wap_embed_ticket_activity`");
    expect(queries.find(query => query.sql.includes("insert into `xy_internal_request_idempotent`"))?.parameters)
      .toEqual(["9:run-1:ticket-create:2"]);
    expect(queries.find(query => query.sql.includes("insert into `xy_wap_embed_session_action_item`"))?.parameters)
      .toEqual(expect.arrayContaining(["workflow"]));
  });

  it("stops without creating a ticket when the active conversation is missing", async () => {
    const { database, queries } = createRecordingDatabase(query => {
      if (query.sql.includes("xy_wap_embed_user_seat")) {
        return { rows: [{ id: 101, platform: 5, third_userid: "work-user-1" }] };
      }
      return { rows: [] };
    });

    await expect(new MysqlWorkflowTicketCreateCapabilityPort(database).execute(
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      request(),
    )).rejects.toMatchObject({
      code: "WORKFLOW_TICKET_CREATE_CONVERSATION_NOT_FOUND",
      failureKind: "terminal",
    });
    expect(queries.some(query => query.sql.includes("insert into"))).toBe(false);
  });

  it("returns success for an existing shared idempotency key without resolving the conversation", async () => {
    const { database, queries } = createRecordingDatabase(query =>
      query.sql.includes("xy_internal_request_idempotent")
        ? { rows: [{ id: 401 }] }
        : { rows: [] });

    await expect(new MysqlWorkflowTicketCreateCapabilityPort(database).execute(
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      request(),
    )).resolves.toEqual({});

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain("xy_internal_request_idempotent");
  });

  it("rejects non-ChatAI subjects before reading the database", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));

    await expect(new MysqlWorkflowTicketCreateCapabilityPort(database).execute(
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      { ...request(), subjectType: "wecom_contact" },
    )).rejects.toMatchObject({
      code: "WORKFLOW_TICKET_CREATE_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(0);
  });

  it("rejects idempotency keys that cannot fit the shared table", async () => {
    const { database, queries } = createRecordingDatabase(() => ({ rows: [] }));

    await expect(new MysqlWorkflowTicketCreateCapabilityPort(database).execute(
      WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING.definition,
      { ...request(), idempotencyKey: "x".repeat(129) },
    )).rejects.toMatchObject({
      code: "WORKFLOW_TICKET_CREATE_REQUEST_INVALID",
      failureKind: "terminal",
    });
    expect(queries).toHaveLength(0);
  });
});

function request() {
  return {
    command: {
      description: "需要运营跟进",
      priority: "high" as const,
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      title: "处理客户需求",
    },
    deadlineAt: new Date("2026-09-08T10:00:00.000Z"),
    execution: {
      nodeId: "ticket-create",
      revision: 1,
      runId: "run-1",
      sequence: 2,
      workflowId: "workflow-1",
    },
    identities: { thirdExternalUserId: "customer-1" },
    idempotencyKey: "9:run-1:ticket-create:2",
    signal: new AbortController().signal,
    subjectId: "customer-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
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
  const database = new Kysely<Database>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: db => new MysqlIntrospector(db),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
  });
  return { database, queries };
}

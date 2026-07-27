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
import { describe, expect, it } from "vitest";
import type { Database } from "../../../src/db/schema";
import { TicketsRepository } from "../../../src/modules/tickets/tickets.repository";

describe("TicketsRepository", () => {
  it("scopes assigned and all ticket queries by tenant before view filters", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listTickets({
      globalAccess: false,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "assigned_to_me",
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("ticket.uid = ?");
    expect(sql).toContain("ticket.assignee_sub_user_id = ?");

    const all = createRecordingDatabase();
    await new TicketsRepository(all.db).listTickets({
      globalAccess: true,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "all",
    });
    expect(all.queries.map(normalizeSql).join("\n")).toContain("ticket.uid = ?");
  });

  it("uses host ownership for reception and access relations for unassigned", async () => {
    const reception = createRecordingDatabase();
    const receptionRepository = new TicketsRepository(reception.db);
    await receptionRepository.listTickets({
      globalAccess: false,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "reception",
    });
    expect(reception.queries.map(normalizeSql).join("\n")).toContain("host_sub_id = ?");

    const unassigned = createRecordingDatabase();
    const unassignedRepository = new TicketsRepository(unassigned.db);
    await unassignedRepository.listTickets({
      globalAccess: false,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "unassigned",
    });
    const sql = unassigned.queries.map(normalizeSql).join("\n");
    expect(sql).toContain("ticket.assignee_sub_user_id is null");
    expect(sql).toContain("relation.sub_id = ?");
    expect(sql).toContain("ticket.status = ?");
  });

  it("applies customer search before pagination and uses the fixed priority ordering", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listTickets({
      globalAccess: false,
      page: 2,
      pageSize: 20,
      search: "王女士",
      subUserId: 101,
      uid: 9001,
      view: "visible",
    });

    const listSql = queries.map(normalizeSql).find((sql) => sql.includes("limit ? offset ?")) ?? "";
    expect(listSql).toContain("contact.name like ?");
    expect(listSql).toContain("case when");
    expect(listSql).toContain("ticket.due_at < current_timestamp");
    expect(listSql).toContain("ticket.update_time desc");
    expect(listSql).toContain("ticket.created_by_sub_user_id = ?");
    expect(listSql).toContain("relation.sub_id = ?");
  });

  it("restricts customer conversation discovery to single chats and server-resolved identity", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listCustomerConversationIds({
      platform: 5,
      subUserId: 101,
      thirdExternalUserId: "customer-1",
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("xy_wap_embed_user_seat_sub_relation as relation");
    expect(sql).toContain("xy_wap_embed_user_seat as access_seat");
    expect(sql).toContain("relation.sub_id = ?");
    expect(sql).toContain("conversation.uid = ?");
    expect(sql).toContain("conversation.platform = ?");
    expect(sql).toContain("conversation.third_external_userid = ?");
    expect(sql).toContain("conversation.third_group_id = ?");
    expect(sql).toContain("conversation.chat_type = ?");
  });

  it("loads context sessions without requiring a summary and orders them newest first", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listSessionOptions({
      conversationId: 301,
      page: 1,
      pageSize: 20,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("left join xy_wap_embed_session_summary as summary");
    expect(sql).toContain("session.conversation_id = ?");
    expect(sql).toContain("coalesce(session.ended_at, session.last_message_at, session.started_at) desc");
    expect(sql).not.toContain("summary.snapshot_id is not null");
  });

  it("limits assignee candidates to active account members and excludes viewers", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listAssigneeOptions({ conversationId: 301, uid: 9001 });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("relation.sub_id");
    expect(sql).toContain("sub_user.status = ?");
    expect(sql).toContain("sub_user.role != ?");
    expect(sql).toContain("sub_user.type = ?");
  });

  it("reads raw recent messages and resolves open ownership through the existing source key", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listRecentMessageCandidates({
      conversation: {
        chatType: 1,
        conversationId: 301,
        platform: 5,
        thirdExternalUserId: "customer-1",
        thirdUserId: "account-1",
      },
      limit: 50,
      uid: 9001,
    });
    await repository.listOpenSessionAssignments({
      conversationId: 301,
      sourceMessageIds: [9001, 9002],
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("from xy_wap_embed_msg_audit_info as message");
    expect(sql).not.toContain("message.msgtype in");
    expect(sql).toContain("session_message.source_message_id in");
    expect(sql).toContain("session.status = ?");
  });

  it("creates the manual ticket and first activity in one transaction", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.createManualTicket({
      anchorMessageId: null,
      assigneeSubUserId: 101,
      conversationId: 301,
      createdBySubUserId: 101,
      description: "确认退款进度",
      dueAt: null,
      priority: "medium",
      sessionId: 401,
      title: "跟进退款",
      uid: 9001,
    })).resolves.toBe(501);

    const inserts = queries.filter((query) => normalizeSql(query).startsWith("insert into"));
    expect(inserts).toHaveLength(2);
    expect(normalizeSql(inserts[0]!)).toContain("insert into xy_wap_embed_session_action_item");
    expect(inserts[0]?.parameters).toEqual(expect.arrayContaining([
      "follow_up",
      "manual",
      "open",
    ]));
    expect(normalizeSql(inserts[1]!)).toContain("insert into xy_wap_embed_ticket_activity");
    expect(inserts[1]?.parameters).toEqual(expect.arrayContaining([
      "created",
      "sub_user",
    ]));
    expect(queries.map(normalizeSql).join("\n")).not.toContain("xy_wap_embed_insight_job");
  });

  it("creates an AI ticket and AI activity while resolving the current valid host", async () => {
    const { db, queries } = createRecordingDatabase({ hostSubUserId: 102 });
    const repository = new TicketsRepository(db);

    await expect(repository.createAiTicket({
      conversationId: 301,
      dueHint: "今天内",
      priority: "high",
      sessionId: 401,
      snapshotId: 701,
      title: "跟进退款",
      uid: 9001,
    })).resolves.toBe(501);

    const inserts = queries.filter((query) => normalizeSql(query).startsWith("insert into"));
    expect(inserts[0]?.parameters).toEqual(expect.arrayContaining([
      102,
      "follow_up",
      "ai",
      "open",
    ]));
    expect(inserts[1]?.parameters).toEqual(expect.arrayContaining([
      "created",
      "ai",
    ]));
    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("sub_user.id = seat.host_sub_id");
    expect(sql).toContain("sub_user.status = ?");
  });

  it("leaves an AI ticket unassigned when there is no valid current host", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).createAiTicket({
      conversationId: 301,
      dueHint: null,
      priority: "medium",
      sessionId: 401,
      snapshotId: 701,
      title: "确认物流",
      uid: 9001,
    });

    const ticketInsert = queries.find((query) =>
      normalizeSql(query).startsWith("insert into xy_wap_embed_session_action_item")
    );
    expect(ticketInsert?.parameters).toContain(null);
  });

  it("fences status updates and writes their activities in the same transaction", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.updateTicket({
      activities: [{
        activityType: "status_changed",
        detail: { after: "done", before: "open" },
      }],
      expectedStatuses: ["open"],
      operatorSubUserId: 101,
      ticketId: 501,
      uid: 9001,
      values: {
        completedAt: new Date("2026-07-27T08:00:00Z"),
        completedBySubUserId: 101,
        status: "done",
      },
    })).resolves.toBe(true);

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("update xy_wap_embed_session_action_item");
    expect(sql).toContain("status in (?)");
    expect(sql).toContain("insert into xy_wap_embed_ticket_activity");
  });

  it("claims with the fixed open and unassigned conditions", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.claimTicket({
      assigneeSubUserId: 101,
      ticketId: 501,
      uid: 9001,
    })).resolves.toBe(true);

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("assignee_sub_user_id is null");
    expect(sql).toContain("status = ?");
    expect(sql).toContain("insert into xy_wap_embed_ticket_activity");
  });

  it("reads activities in id order and evidence only from action_item records", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listTicketActivities({ ticketId: 501, uid: 9001 });
    await repository.listTicketEvidenceMessageIds({
      snapshotId: 701,
      ticketId: 501,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("activity.id asc");
    expect(sql).toContain("evidence.dimension_type = ?");
    expect(sql).toContain("evidence.dimension_record_id = ?");
  });
});

function createRecordingDatabase(options: { hostSubUserId?: number } = {}) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);

      if (query.sql.includes("insert into `xy_wap_embed_session_action_item`")) {
        return { insertId: 501n, rows: [] };
      }
      if (query.sql.includes("insert into `xy_wap_embed_ticket_activity`")) {
        return { insertId: 601n, rows: [] };
      }

      if (query.sql.includes("count(")) {
        return { rows: [{ total: 0 }] as R[] };
      }

      if (query.sql.includes("`seat`.`host_sub_id` as `assignee_sub_user_id`")) {
        return {
          rows: options.hostSubUserId == null
            ? []
            : [{ assignee_sub_user_id: options.hostSubUserId }] as R[],
        };
      }

      if (query.sql.startsWith("update")) {
        return { numAffectedRows: 1n, rows: [] };
      }

      return { rows: [] };
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

function normalizeSql(query: CompiledQuery) {
  return query.sql.replace(/`/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

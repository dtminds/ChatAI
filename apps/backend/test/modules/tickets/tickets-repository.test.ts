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
    expect(sql).toContain("ticket.status != ?");
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

  it("limits my active tickets to assigned open and in-progress records", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).listTickets({
      globalAccess: false,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "assigned_to_me_active",
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("ticket.assignee_sub_user_id = ?");
    expect(sql).toContain("ticket.status in (?, ?)");
  });

  it("filters conversation ticket pages by multiple active statuses", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).listTickets({
      conversationIds: [301],
      globalAccess: false,
      page: 1,
      pageSize: 20,
      statuses: ["open", "in_progress"],
      subUserId: 101,
      uid: 9001,
      view: "visible",
    });

    expect(queries.map(normalizeSql).join("\n")).toContain(
      "ticket.status in (?, ?)",
    );
  });

  it("counts assigned active tickets from the covering ticket index without joining conversations", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).countAssignedActiveTickets({
      assigneeSubUserId: 101,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("count(*)");
    expect(sql).toContain("from xy_wap_embed_session_action_item as ticket");
    expect(sql).toContain("ticket.uid = ?");
    expect(sql).toContain("ticket.assignee_sub_user_id = ?");
    expect(sql).toContain("ticket.status in (?, ?)");
    expect(sql).not.toContain("join xy_wap_embed_conversation");
    expect(sql).not.toContain("distinct");
  });

  it("counts active tickets for one conversation without joining conversations", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).countActiveConversationTickets({
      conversationId: 301,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("count(*)");
    expect(sql).toContain("from xy_wap_embed_session_action_item as ticket");
    expect(sql).toContain("ticket.uid = ?");
    expect(sql).toContain("ticket.conversation_id = ?");
    expect(sql).toContain("ticket.status in (?, ?)");
    expect(sql).not.toContain("join xy_wap_embed_conversation");
    expect(sql).not.toContain("distinct");
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
    const receptionSql = reception.queries.map(normalizeSql).join("\n");
    expect(receptionSql).toContain("host_sub_id = ?");
    expect(receptionSql).toContain("reception_seat.biz_status = ?");

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
    expect(sql).toContain("access_seat.biz_status = ?");
    expect(sql).toContain("ticket.status = ?");
  });

  it("searches only ticket id and title before pagination and uses the fixed priority ordering", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listTickets({
      globalAccess: false,
      page: 2,
      pageSize: 20,
      search: "退款",
      subUserId: 101,
      uid: 9001,
      view: "visible",
    });

    const listSql = queries.map(normalizeSql).find((sql) => sql.includes("limit ? offset ?")) ?? "";
    expect(listSql).toContain("cast(ticket.id as char) like ?");
    expect(listSql).toContain("ticket.title like ?");
    expect(listSql).not.toContain("contact.name like ?");
    expect(listSql).not.toContain("contact.real_name like ?");
    expect(listSql).not.toContain("left join xy_wap_embed_contact");
    expect(listSql).not.toContain("left join xy_wap_embed_sub_user as assignee");
    expect(listSql).toContain("case when");
    expect(listSql).toContain("ticket.due_at < current_timestamp");
    expect(listSql).toContain("ticket.update_time desc");
    expect(listSql).toContain("ticket.created_by_sub_user_id = ?");
    expect(listSql).toContain("relation.sub_id = ?");
  });

  it("hydrates display fields in page-scoped batch queries after ticket pagination", async () => {
    const { db, queries } = createRecordingDatabase({
      ticketPageRows: [{
        anchor_message_id: null,
        assignee_sub_user_id: 101,
        canceled_at: null,
        completed_at: null,
        conversation_id: 301,
        conversation_platform: 5,
        conversation_third_external_userid: "customer-1",
        conversation_third_userid: "account-1",
        create_time: new Date("2026-07-28T00:00:00Z"),
        created_by_sub_user_id: 102,
        description: null,
        due_at: null,
        due_hint: null,
        has_account_access: 1,
        overdue: 0,
        priority: "medium",
        session_id: null,
        snapshot_id: null,
        source_type: "manual",
        status: "open",
        ticket_id: 501,
        title: "跟进退款",
        update_time: new Date("2026-07-28T00:00:00Z"),
      }],
    });

    await new TicketsRepository(db).listTickets({
      globalAccess: true,
      page: 1,
      pageSize: 20,
      subUserId: 101,
      uid: 9001,
      view: "all",
    });

    const normalizedQueries = queries.map(normalizeSql);
    const pageSql = normalizedQueries.find((sql) => sql.includes("limit ? offset ?")) ?? "";
    expect(pageSql).not.toContain("join xy_wap_embed_contact");
    expect(pageSql).not.toContain("join xy_wap_embed_user_seat as seat");
    expect(pageSql).not.toContain("join xy_wap_embed_sub_user");
    expect(normalizedQueries).toContainEqual(expect.stringContaining(
      "select platform, third_external_userid, name, avatar from xy_wap_embed_contact",
    ));
    expect(normalizedQueries).toContainEqual(expect.stringContaining(
      "select id, platform, third_userid, third_user_name, third_avatar from xy_wap_embed_user_seat",
    ));
    const seatHydrationSql = normalizedQueries.find((sql) =>
      sql.startsWith("select id, platform, third_userid, third_user_name, third_avatar from xy_wap_embed_user_seat"),
    ) ?? "";
    expect(seatHydrationSql).not.toContain("biz_status");
    expect(normalizedQueries).toContainEqual(expect.stringContaining(
      "select id, name from xy_wap_embed_sub_user",
    ));
    expect(normalizedQueries.join("\n")).toContain("third_external_userid in (?)");
    expect(normalizedQueries.join("\n")).toContain("third_userid in (?)");
    expect(normalizedQueries.join("\n")).toContain("id in (?, ?)");
  });

  it("loads the conversation's latest message boundary with its identity", async () => {
    const { db, queries } = createRecordingDatabase();

    await new TicketsRepository(db).getConversationIdentity(9001, 301);

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("conversation.last_audit_info_id as last_audit_info_id");
    expect(sql).toContain("conversation.last_msgtime as last_msgtime");
    expect(sql).toContain("conversation.biz_status = ?");
  });

  it("loads context sessions without requiring a summary and orders them newest first", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listSessionOptions({
      conversationId: 301,
      limit: 5,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(queries).toHaveLength(1);
    expect(sql).not.toContain("count(");
    expect(sql).toContain("left join xy_wap_embed_session_summary as summary");
    expect(sql).toContain("session.next_close_at as next_close_at");
    expect(sql).toContain("session.conversation_id = ?");
    expect(sql).toContain("coalesce(session.ended_at, session.last_message_at, session.started_at) desc");
    expect(sql).toContain("limit ?");
    expect(queries[0]?.parameters).toContain(5);
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
      enforceWriteAccess: true,
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
    expect(sql).toContain("status != ?");
    expect(sql).toContain("assignee_sub_user_id = ?");
    expect(sql).toContain("created_by_sub_user_id = ?");
    expect(sql).toContain("insert into xy_wap_embed_ticket_activity");
  });

  it("claims only by assigning an unassigned non-deleted ticket without changing public status", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.claimTicket({
      assigneeSubUserId: 101,
      ticketId: 501,
      uid: 9001,
    })).resolves.toBe(true);

    const normalizedQueries = queries.map(normalizeSql);
    const updateSql = normalizedQueries.find((sql) =>
      sql.startsWith("update xy_wap_embed_session_action_item"),
    );
    expect(updateSql).toContain("assignee_sub_user_id is null");
    expect(updateSql).toContain("status != ?");
    expect(normalizedQueries.join("\n")).toContain("insert into xy_wap_embed_ticket_activity");
  });

  it("fences comments by the same current-writer predicate as ticket updates", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.addTicketComment({
      content: "已电话确认",
      enforceWriteAccess: true,
      operatorSubUserId: 101,
      ticketId: 501,
      uid: 9001,
    })).rejects.toThrow("TICKET_ACTIVITY_NOT_FOUND_AFTER_INSERT");

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("status != ?");
    expect(sql).toContain("assignee_sub_user_id = ?");
    expect(sql).toContain("created_by_sub_user_id = ?");
    expect(sql).toContain("insert into xy_wap_embed_ticket_activity");
  });

  it("deletes only a manual ticket by its creator and records the tombstone activity atomically", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await expect(repository.deleteTicket({
      createdBySubUserId: 101,
      ticketId: 501,
      uid: 9001,
    })).resolves.toBe(true);

    const normalizedQueries = queries.map(normalizeSql);
    const updateSql = normalizedQueries.find((sql) =>
      sql.startsWith("update xy_wap_embed_session_action_item"),
    );
    expect(updateSql).toContain("source_type = ?");
    expect(updateSql).toContain("created_by_sub_user_id = ?");
    expect(updateSql).toContain("status != ?");
    expect(queries.find((query) => normalizeSql(query).startsWith("update"))?.parameters)
      .toEqual(expect.arrayContaining(["deleted", "manual", 101]));
    expect(queries.find((query) => normalizeSql(query).startsWith("insert into xy_wap_embed_ticket_activity"))?.parameters)
      .toEqual(expect.arrayContaining(["deleted"]));
  });

  it("reads activities with a descending id cursor", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.listTicketActivities({
      beforeActivityId: 600,
      limit: 50,
      ticketId: 501,
      uid: 9001,
    });
    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("activity.id < ?");
    expect(sql).toContain("activity.id desc");
    expect(sql).toContain("limit ?");
  });

  it("loads one visible ticket without executing a list count", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.getTicketRecordById({
      globalAccess: false,
      subUserId: 101,
      ticketId: 501,
      uid: 9001,
    });

    expect(queries.some((query) => normalizeSql(query).includes("count("))).toBe(false);
  });

  it("checks child-resource access without hydrating ticket display data", async () => {
    const { db, queries } = createRecordingDatabase();
    const repository = new TicketsRepository(db);

    await repository.getTicketAccessRecordById({
      globalAccess: false,
      subUserId: 101,
      ticketId: 501,
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(queries).toHaveLength(1);
    expect(sql).not.toContain("count(");
    expect(sql).not.toContain("xy_wap_embed_contact");
    expect(sql).not.toContain("xy_wap_embed_sub_user");
    expect(sql).not.toContain("left join xy_wap_embed_user_seat");
  });
});

function createRecordingDatabase(options: {
  hostSubUserId?: number;
  ticketPageRows?: Record<string, unknown>[];
} = {}) {
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

      if (query.sql.includes("limit ? offset ?") && options.ticketPageRows) {
        return { rows: options.ticketPageRows as R[] };
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

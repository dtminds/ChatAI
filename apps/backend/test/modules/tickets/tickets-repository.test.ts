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
      thirdExternalUserId: "customer-1",
      uid: 9001,
    });

    const sql = queries.map(normalizeSql).join("\n");
    expect(sql).toContain("conversation.uid = ?");
    expect(sql).toContain("conversation.platform = ?");
    expect(sql).toContain("conversation.third_external_userid = ?");
    expect(sql).toContain("conversation.chat_type = ?");
  });
});

function createRecordingDatabase() {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);

      if (query.sql.includes("count(")) {
        return { rows: [{ total: 0 }] as R[] };
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

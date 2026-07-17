import { describe, expect, it, vi } from "vitest";
import { MATERIAL_COLLECTION_BIZ_TYPE } from "@chatai/contracts";
import type { MessageRow } from "../../../src/modules/chat/workbench-mappers.js";
import {
  decodeConversationListCursor,
  WorkbenchRepository,
} from "../../../src/modules/chat/workbench-repository.js";

function createFailingDb() {
  return {
    selectFrom() {
      throw new Error("database should not be queried for invalid ids");
    },
  };
}

function createHistoryMessagesDb(rows: MessageRow[], conversationOverrides: Record<string, unknown> = {}) {
  const messageQueries: Array<{
    limits: number[];
    orderBys: Array<[string, string | undefined]>;
    table: string;
    whereExpressions: unknown[];
    wheres: Array<[string, string, unknown]>;
  }> = [];

  return {
    messageQueries,
    selectFrom(table: string) {
      if (table === "xy_wap_embed_conversation as conversation") {
        return createQueryBuilder({
          conversation_external_id: "external-1",
          conversation_group_id: "",
          conversation_id: 88,
          chat_type: 1,
          platform: 5,
          seat_id: 12,
          third_userid: "seat-third-user-1",
          uid: 9001,
          ...conversationOverrides,
        });
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        const query = createQueryBuilder(rows);
        messageQueries.push({
          limits: query.limits,
          orderBys: query.orderBys,
          table,
          whereExpressions: query.whereExpressions,
          wheres: query.wheres,
        });
        return query;
      }

      if (
        table === "xy_wap_embed_group_member as member" ||
        table === "xy_wap_embed_user_seat" ||
        table === "xy_wap_embed_contact" ||
        table === "xy_wap_embed_customer_bind_relation"
      ) {
        return createQueryBuilder([]);
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createMessagesDb(
  rows: MessageRow[],
  quoteRows: MessageRow[] = [],
  conversationOverrides: Record<string, unknown> = {},
  hydrationRows: {
    contacts?: unknown[];
    groupMembers?: unknown[];
    seats?: unknown[];
  } = {},
) {
  const messageQueries: Array<{
    limits: number[];
    orderBys: Array<[string, string | undefined]>;
    table: string;
    whereExpressions: unknown[];
    wheres: Array<[string, string, unknown]>;
  }> = [];
  const hydrationQueries: Array<{
    joins: string[];
    table: string;
    wheres: Array<[string, string, unknown]>;
  }> = [];

  return {
    hydrationQueries,
    messageQueries,
    selectFrom(table: string) {
      if (table === "xy_wap_embed_conversation as conversation") {
        return createQueryBuilder({
          conversation_external_id: "external-1",
          conversation_group_id: "",
          conversation_id: 88,
          chat_type: 1,
          platform: 5,
          seat_id: 12,
          third_userid: "seat-third-user-1",
          uid: 9001,
          ...conversationOverrides,
        });
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        const queryIndex = messageQueries.filter((query) => query.table === table).length;
        const query = createQueryBuilder(queryIndex === 0 ? rows : quoteRows);
        messageQueries.push({
          limits: query.limits,
          orderBys: query.orderBys,
          table,
          whereExpressions: query.whereExpressions,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_group_member as member") {
        const query = createQueryBuilder(hydrationRows.groupMembers ?? []);
        hydrationQueries.push({
          joins: query.joins,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_user_seat") {
        const query = createQueryBuilder(hydrationRows.seats ?? []);
        hydrationQueries.push({
          joins: query.joins,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_contact") {
        const query = createQueryBuilder(hydrationRows.contacts ?? []);
        hydrationQueries.push({
          joins: query.joins,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_customer_bind_relation") {
        return createQueryBuilder([]);
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createMessagesBySeqsDb(
  rows: MessageRow[],
  quoteRows: MessageRow[] = [],
  conversationOverrides: Record<string, unknown> = {},
) {
  const messageQueries: Array<{
    table: string;
    wheres: Array<[string, string, unknown]>;
  }> = [];

  return {
    messageQueries,
    selectFrom(table: string) {
      if (table === "xy_wap_embed_conversation as conversation") {
        return createQueryBuilder({
          chat_type: 1,
          conversation_external_id: "external-1",
          conversation_group_id: "",
          conversation_id: 88,
          platform: 5,
          seat_id: 12,
          third_userid: "seat-third-user-1",
          uid: 9001,
          ...conversationOverrides,
        });
      }

      if (table === "xy_wap_embed_user_seat as seat") {
        return createQueryBuilder({
          id: 12,
          third_userid: "seat-third-user-1",
          uid: 9001,
          platform: 5,
        });
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        const queryIndex = messageQueries.filter((query) => query.table === table).length;
        const query = createQueryBuilder(queryIndex === 0 ? rows : quoteRows);
        messageQueries.push({
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (
        table === "xy_wap_embed_contact" ||
        table === "xy_wap_embed_customer_bind_relation" ||
        table === "xy_wap_embed_group_member as member"
      ) {
        return createQueryBuilder([]);
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createChatRecordDetailDb({
  detailRows,
  parentRow,
}: {
  detailRows: Array<Record<string, unknown>>;
  parentRow: MessageRow;
}) {
  const queries: Array<{
    orderBys: Array<[string, string | undefined]>;
    table: string;
    wheres: Array<[string, string, unknown]>;
  }> = [];

  return {
    queries,
    selectFrom(table: string) {
      if (table === "xy_wap_embed_conversation as conversation") {
        const query = createQueryBuilder({
          chat_type: 1,
          conversation_external_id: "external-1",
          conversation_group_id: "",
          conversation_id: 88,
          platform: 5,
          seat_id: 12,
          third_userid: "seat-user-001",
          uid: 9001,
        });
        queries.push({
          orderBys: query.orderBys,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_msg_audit_info as message") {
        const query = createQueryBuilder(parentRow);
        queries.push({
          orderBys: query.orderBys,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      if (table === "xy_wap_embed_msg_audit_chat_record as record") {
        const query = createQueryBuilder(detailRows);
        queries.push({
          orderBys: query.orderBys,
          table,
          wheres: query.wheres,
        });
        return query;
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

function createQueryBuilder(result: unknown) {
  let currentResult = result;
  const aggregateFns: string[] = [];
  const groupBys: string[] = [];
  const wheres: Array<[string, string, unknown]> = [];
  const limits: number[] = [];
  const offsets: number[] = [];
  const orderBys: Array<[string, string | undefined]> = [];
  const selections: unknown[] = [];
  const whereExpressions: unknown[] = [];
  const joins: string[] = [];
  const joinConditions: Array<{
    conditions: Array<[string, string, unknown]>;
    table: string;
    type: "innerJoin" | "leftJoin";
  }> = [];
  function buildExpression(column: string, operator: string, value: unknown) {
    return {
      column,
      operator,
      value,
    };
  }

  buildExpression.and = (expressions: unknown[]) => ({
    type: "and",
    expressions,
  });
  buildExpression.or = (expressions: unknown[]) => ({
    type: "or",
    expressions,
  });

  const expressionBuilder = Object.assign(buildExpression, {
    and(expressions: unknown[]) {
      return {
        type: "and",
        expressions,
      };
    },
    fn: {
      countAll() {
        aggregateFns.push("countAll");

        return {
          as(alias: string) {
            const count = Array.isArray(currentResult) ? currentResult.length : 0;

            currentResult = [{ [alias]: count }];
            return undefined;
          },
        };
      },
      coalesce() {
        return {
          as() {
            return undefined;
          },
        };
      },
      max() {
        aggregateFns.push("max");

        return {
          as() {
            return undefined;
          },
        };
      },
      sum() {
        aggregateFns.push("sum");

        return undefined;
      },
    },
    case() {
      return {
        else() {
          return this;
        },
        end() {
          return undefined;
        },
        then() {
          return this;
        },
        when() {
          return this;
        },
      };
    },
    val() {
      return {
        as() {
          return undefined;
        },
      };
    },
    selectFrom() {
      return {
        as() {
          return undefined;
        },
        select(selection?: unknown) {
          if (typeof selection === "function") {
            selection(expressionBuilder);
          }

          return this;
        },
        where() {
          return this;
        },
        whereRef() {
          return this;
        },
      };
    },
    or(expressions: unknown[]) {
      return {
        type: "or",
        expressions,
      };
    },
    eb: buildExpression,
    ref(column: string) {
      return {
        type: "ref",
        column,
      };
    },
  });

  return {
    aggregateFns,
    groupBys,
    joins,
    joinConditions,
    limits,
    offsets,
    orderBys,
    selections,
    whereExpressions,
    wheres,
    innerJoin(table: string, callback?: unknown) {
      joins.push("innerJoin");
      if (typeof callback === "function") {
        const conditions: Array<[string, string, unknown]> = [];
        const joinBuilder = {
          on(column: string, operator: string, value: unknown) {
            conditions.push([column, operator, value]);
            return this;
          },
          onRef(left: string, operator: string, right: string) {
            conditions.push([left, operator, right]);
            return this;
          },
        };
        callback(joinBuilder);
        joinConditions.push({ conditions, table, type: "innerJoin" });
      }
      return this;
    },
    leftJoin(table: string, callback?: unknown) {
      joins.push("leftJoin");
      if (typeof callback === "function") {
        const conditions: Array<[string, string, unknown]> = [];
        const joinBuilder = {
          on(column: string, operator: string, value: unknown) {
            conditions.push([column, operator, value]);
            return this;
          },
          onRef(left: string, operator: string, right: string) {
            conditions.push([left, operator, right]);
            return this;
          },
        };
        callback(joinBuilder);
        joinConditions.push({ conditions, table, type: "leftJoin" });
      }
      return this;
    },
    groupBy(columns: string[]) {
      groupBys.push(...columns);
      whereExpressions.push({
        type: "groupBy",
        columns,
      });
      return this;
    },
    limit(limit: number) {
      limits.push(limit);
      return this;
    },
    offset(offset: number) {
      offsets.push(offset);
      return this;
    },
    orderBy(column: string, direction?: string) {
      orderBys.push([column, direction]);
      return this;
    },
    select(selection?: unknown) {
      if (Array.isArray(selection)) {
        selections.push(...selection);
      } else if (selection !== undefined && typeof selection !== "function") {
        selections.push(selection);
      }

      if (typeof selection === "function") {
        selection(expressionBuilder);
        currentResult = Array.isArray(currentResult)
          ? currentResult.map((item) => ({ ...item, seat_unread_count: 6 }))
          : { ...(currentResult as object), seat_unread_count: 6 };
      }

      return this;
    },
    selectAll() {
      return this;
    },
    where(column: string, operator: string, value: unknown) {
      if (typeof column === "function") {
        whereExpressions.push(column(expressionBuilder));
        return this;
      }

      wheres.push([column, operator, value]);
      return this;
    },
    execute() {
      return Promise.resolve(Array.isArray(currentResult) ? currentResult : [currentResult]);
    },
    executeTakeFirst() {
      return Promise.resolve(Array.isArray(currentResult) ? currentResult[0] : currentResult);
    },
  };
}

function createFilteredRowsQueryBuilder<T extends Record<string, unknown>>(
  rows: T[],
  columnAliases: Record<string, keyof T & string>,
) {
  const query = createQueryBuilder(rows);

  query.execute = async () =>
    rows.filter((row) => matchesWhereFilters(row, query.wheres, columnAliases));
  query.executeTakeFirst = async () => (await query.execute())[0];

  return query;
}

function matchesWhereFilters<T extends Record<string, unknown>>(
  row: T,
  wheres: Array<[string, string, unknown]>,
  columnAliases: Record<string, keyof T & string>,
) {
  for (const [column, operator, value] of wheres) {
    const rowKey = columnAliases[column];

    if (!rowKey) {
      continue;
    }

    const rowValue = row[rowKey];

    if (operator === "=" && rowValue !== value) {
      return false;
    }

    if (operator === "in" && (!Array.isArray(value) || !value.includes(rowValue))) {
      return false;
    }
  }

  return true;
}

function createCacheMock(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    del: vi.fn(async (...keys: string[]) => {
      for (const key of keys) {
        store.delete(key);
      }
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    sadd: vi.fn(async () => undefined),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    smembers: vi.fn(async () => []),
  };
}

function createMaterialDb(results: Partial<Record<string, unknown>> = {}) {
  const selects: Array<{
    joinConditions: Array<{
      conditions: Array<[string, string, unknown]>;
      table: string;
      type: string;
    }>;
    limits: number[];
    offsets: number[];
    orderBys: Array<[string, string | undefined]>;
    table: string;
    whereExpressions: unknown[];
    wheres: Array<[string, string, unknown]>;
  }> = [];
  const inserts: Array<{
    table: string;
    values?: unknown;
  }> = [];
  const updates: Array<{
    table: string;
    values?: unknown;
    wheres: Array<[string, string, unknown]>;
  }> = [];

  return {
    inserts,
    selects,
    updates,
    insertInto(table: string) {
      const insert = { table, values: undefined as unknown };
      inserts.push(insert);

      return {
        values(values: unknown) {
          insert.values = values;
          return this;
        },
        execute() {
          return Promise.resolve([]);
        },
        executeTakeFirstOrThrow() {
          return Promise.resolve({ insertId: 1801 });
        },
      };
    },
    selectFrom(table: string) {
      const query = createQueryBuilder(results[table] ?? []);
      selects.push({
        joinConditions: query.joinConditions,
        limits: query.limits,
        offsets: query.offsets,
        orderBys: query.orderBys,
        table,
        whereExpressions: query.whereExpressions,
        wheres: query.wheres,
      });
      return query;
    },
    updateTable(table: string) {
      const query = createQueryBuilder([]);
      const update = {
        table,
        values: undefined as unknown,
        wheres: query.wheres,
      };
      updates.push(update);

      return {
        set(values: unknown) {
          update.values = values;
          return this;
        },
        where: query.where,
        execute() {
          return Promise.resolve([]);
        },
      };
    },
  };
}

function createConversationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chat_type: 1,
    create_time: 1_778_839_000_000,
    customer_avatar: "",
    customer_name: "微信客户",
    group_avatar: "",
    group_name: "",
    id: 88,
    last_message_content: "hello",
    last_message_type: "text",
    last_msgtime: 1_778_839_800_000,
    pinned_time: 0,
    reply: 0,
    seat_id: 12,
    third_external_userid: "customer-001",
    third_group_id: "",
    third_group_origin_userid: "",
    third_userid: "seat-user-001",
    unread_cnt: 0,
    verified: 1,
    ...overrides,
  };
}

function createConversationMessageRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    chat_type: 1,
    content: JSON.stringify({ text: "hello" }),
    conversation_external_id: "external-1",
    conversation_group_id: "",
    conversation_id: 88,
    from_type: 2,
    id: 829,
    msgid: "remote-msg-829",
    msgtime: 1_778_840_010_000,
    msgtype: "text",
    opt_no: null,
    revoke_status: 0,
    seat_id: 12,
    third_external_id: "external-1",
    third_from_id: "external-1",
    third_group_id: null,
    third_user_id: "seat-user-001",
    ...overrides,
  };
}

describe("WorkbenchRepository", () => {
  it("lists material groups scoped by tenant, business type, shared visibility, and sort order", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection_group: [
        {
          biz_type: 2,
          id: 8,
          sort: "10",
          sub_uid: 0,
          title: "共享文件",
          uid: 9001,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const groups = await repository.listMaterialGroups({
      bizType: 2,
      subUserId: "88",
      uid: 9001,
    });

    expect(groups).toEqual([
      { bizType: 2, id: "8", sort: 10, title: "共享文件" },
    ]);
    expect(db.selects[0]).toMatchObject({
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_material_collection_group",
      wheres: [
        ["uid", "=", 9001],
        ["biz_type", "=", 2],
        ["biz_status", "=", 1],
        ["sub_uid", "in", [0]],
      ],
    });
  });

  it("lists material collections through mapper and supports group filtering", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: [
        {
          biz_status: 1,
          biz_type: 2,
          content: JSON.stringify({ fileName: "报价.pdf", size: 20 }),
          create_time: 1_777_000_000_000,
          group_id: 9,
          id: 66,
          msg_info_id: 9101,
          op_sub_uid: 88,
          sort: 40,
          sub_uid: 0,
          title: "报价文件",
          uid: 9001,
          update_time: 1_777_000_005_000,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const result = await repository.listMaterialCollections({
      bizType: 2,
      groupId: "9",
      limit: 100,
      offset: 0,
      subUserId: "88",
      uid: 9001,
    });

    expect(result.items).toMatchObject([
      {
        bizType: 2,
        content: { fileName: "报价.pdf" },
        contentType: "file",
        groupId: "9",
        id: "66",
        msgInfoId: "9101",
        sort: 40,
        title: "报价文件",
      },
    ]);
    expect(result.total).toBe(1);
    expect(db.selects[0]).toMatchObject({
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_material_collection",
      wheres: [
        ["uid", "=", 9001],
        ["biz_type", "=", 2],
        ["biz_status", "=", 1],
        ["sub_uid", "in", [0]],
        ["group_id", "=", 9],
      ],
    });
  });

  it("adds title keyword filters to material collection list and count queries", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: [],
    });
    const repository = new WorkbenchRepository(db as never);

    await repository.listMaterialCollections({
      bizType: MATERIAL_COLLECTION_BIZ_TYPE.FILE,
      groupId: "9",
      keyword: "a\\b%_",
      limit: 20,
      offset: 20,
      subUserId: "88",
      uid: 9001,
    });

    expect(db.selects[0].whereExpressions).toContainEqual({
      column: "title",
      operator: "like",
      value: "%a\\\\b\\%\\_%",
    });
    expect(db.selects[0]).toMatchObject({
      limits: [20],
      offsets: [20],
    });
  });

  it("lists material collections with string default group id", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: [
        {
          biz_status: 1,
          biz_type: 1,
          content: JSON.stringify({ md5: "emotion-md5" }),
          create_time: 1_777_000_000_000,
          group_id: 0,
          id: 68,
          msg_info_id: 9102,
          op_sub_uid: 88,
          sort: 50,
          sub_uid: 88,
          title: "表情",
          uid: 9001,
          update_time: 1_777_000_005_000,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const result = await repository.listMaterialCollections({
      bizType: 1,
      groupId: "0",
      limit: 100,
      offset: 0,
      subUserId: "88",
      uid: 9001,
    });

    expect(result.items).toMatchObject([
      {
        bizType: 1,
        groupId: 0,
        id: "68",
        msgInfoId: "9102",
        title: "表情",
      },
    ]);
    expect(db.selects[0].wheres).toEqual([
      ["uid", "=", 9001],
      ["biz_type", "=", 1],
      ["biz_status", "=", 1],
      ["sub_uid", "in", [88]],
      ["group_id", "=", 0],
    ]);
  });

  it("lists expression collections scoped to the current sub user", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: [
        {
          biz_status: 1,
          biz_type: 1,
          content: JSON.stringify({ md5: "emotion-md5" }),
          create_time: 1_777_000_000_000,
          group_id: 0,
          id: 68,
          msg_info_id: 9103,
          op_sub_uid: 88,
          sort: 50,
          sub_uid: 88,
          title: "表情",
          uid: 9001,
          update_time: 1_777_000_005_000,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const result = await repository.listMaterialCollections({
      bizType: 1,
      groupId: 0,
      limit: 100,
      offset: 0,
      subUserId: "88",
      uid: 9001,
    });

    expect(result.items).toMatchObject([
      {
        bizType: 1,
        id: "68",
        msgInfoId: "9103",
        title: "表情",
      },
    ]);
    expect(db.selects[0].wheres).toEqual([
      ["uid", "=", 9001],
      ["biz_type", "=", 1],
      ["biz_status", "=", 1],
      ["sub_uid", "in", [88]],
      ["group_id", "=", 0],
    ]);
  });

  it("lists enterprise quick reply categories by shared scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply_category: [
        {
          biz_status: 1,
          create_time: new Date("2026-06-15T00:00:00Z"),
          id: 11,
          op_sub_uid: 9,
          parent_id: 0,
          scope_type: 1,
          sort: 100,
          sub_uid: 0,
          title: "售前",
          uid: 10001,
          update_time: new Date("2026-06-15T00:00:00Z"),
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const categories = await repository.listQuickReplyCategories({
      scopeType: 1,
      subUserId: "9",
      uid: 10001,
    });

    expect(categories).toEqual([
      {
        id: "11",
        parentId: 0,
        scopeType: 1,
        sort: 100,
        title: "售前",
      },
    ]);
    expect(db.selects[0]).toMatchObject({
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_quick_reply_category",
      wheres: [
        ["uid", "=", 10001],
        ["biz_status", "=", 1],
        ["scope_type", "=", 1],
        ["sub_uid", "=", 0],
      ],
    });
  });

  it("lists personal quick reply categories by current sub user scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply_category: [
        {
          id: 12,
          parent_id: 11,
          scope_type: 2,
          sort: "90",
          title: "致歉",
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const categories = await repository.listQuickReplyCategories({
      scopeType: 2,
      subUserId: "9",
      uid: 10001,
    });

    expect(categories).toEqual([
      {
        id: "12",
        parentId: "11",
        scopeType: 2,
        sort: 90,
        title: "致歉",
      },
    ]);
    expect(db.selects[0].wheres).toEqual([
      ["uid", "=", 10001],
      ["biz_status", "=", 1],
      ["scope_type", "=", 2],
      ["sub_uid", "=", 9],
    ]);
  });

  it("detects child quick reply categories in the requested scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply_category: [
        {
          id: 12,
          parent_id: 11,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.isChildQuickReplyCategory({
        categoryId: "12",
        scopeType: 2,
        subUserId: "9",
        uid: 10001,
      }),
    ).resolves.toBe(true);

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_quick_reply_category",
      wheres: [
        ["id", "=", 12],
        ["uid", "=", 10001],
        ["biz_status", "=", 1],
        ["scope_type", "=", 2],
        ["sub_uid", "=", 9],
      ],
    });
  });

  it("lists quick replies with pagination and normalized attachments", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply: [
        {
          attachments: JSON.stringify([
            {
              content: { href: "https://example.com", title: "活动" },
              materialCollectionId: "8",
              msgid: "1025656",
              type: "h5",
            },
          ]),
          biz_status: 1,
          category_id: 11,
          content_text: "您好",
          create_time: new Date("2026-06-15T00:00:00Z"),
          id: 21,
          label_color: "orange",
          label_text: "售前",
          op_sub_uid: 9,
          scope_type: 1,
          sort: 100,
          sub_uid: 0,
          uid: 10001,
          update_time: new Date("2026-06-15T00:00:01Z"),
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    const result = await repository.listQuickReplies({
      categoryId: "11",
      page: 1,
      pageSize: 50,
      scopeType: 1,
      subUserId: "9",
      uid: 10001,
    });

    expect(result).toEqual({
      items: [
        {
          attachments: [
            {
              content: { href: "https://example.com", title: "活动" },
              materialCollectionId: "8",
              msgid: "1025656",
              type: "h5",
            },
          ],
          categoryId: "11",
          contentText: "您好",
          createdAt: new Date("2026-06-15T00:00:00Z").getTime(),
          id: "21",
          labelColor: "orange",
          labelText: "售前",
          scopeType: 1,
          sort: 100,
          updatedAt: new Date("2026-06-15T00:00:01Z").getTime(),
        },
      ],
      total: 1,
    });
    expect(db.selects[0]).toMatchObject({
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_quick_reply",
      wheres: [
        ["uid", "=", 10001],
        ["biz_status", "=", 1],
        ["scope_type", "=", 1],
        ["sub_uid", "=", 0],
        ["category_id", "=", 11],
      ],
    });
    expect(db.selects[0].whereExpressions).toEqual([]);
    expect(db.selects[0]).toMatchObject({
      limits: [50],
      offsets: [0],
    });
  });

  it("adds keyword filters to quick reply list and count queries", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply: [],
    });
    const repository = new WorkbenchRepository(db as never);

    await repository.listQuickReplies({
      keyword: "a\\b%_",
      page: 2,
      pageSize: 20,
      scopeType: 2,
      subUserId: "9",
      uid: 10001,
    });

    expect(db.selects).toHaveLength(2);
    expect(db.selects[0].whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "content_text", operator: "like", value: "%a\\\\b\\%\\_%" },
        { column: "label_text", operator: "like", value: "%a\\\\b\\%\\_%" },
      ],
    });
    expect(db.selects[1].whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "content_text", operator: "like", value: "%a\\\\b\\%\\_%" },
        { column: "label_text", operator: "like", value: "%a\\\\b\\%\\_%" },
      ],
    });
    expect(db.selects[0]).toMatchObject({
      limits: [20],
      offsets: [20],
    });
  });

  it("lists quick reply category content with child and reply limits", async () => {
    const db = createMaterialDb({
      xy_wap_embed_quick_reply_category: [
        {
          id: 11,
          parent_id: 10,
          scope_type: 1,
          sort: 100,
          title: "报价",
        },
        {
          id: 12,
          parent_id: 10,
          scope_type: 1,
          sort: 90,
          title: "致歉",
        },
      ],
      xy_wap_embed_quick_reply: [
        {
          attachments: JSON.stringify([]),
          category_id: 11,
          content_text: "报价话术",
          id: 21,
          label_color: "",
          label_text: "",
          scope_type: 1,
          sort: 100,
        },
        {
          attachments: JSON.stringify([]),
          category_id: 12,
          content_text: "致歉话术",
          id: 22,
          label_color: "",
          label_text: "",
          scope_type: 1,
          sort: 90,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.listQuickReplyCategoryContent({
        categoryLimit: 50,
        parentCategoryId: "10",
        quickReplyLimit: 10_000,
        scopeType: 1,
        subUserId: "9",
        uid: 10001,
      }),
    ).resolves.toMatchObject({
      categories: [
        expect.objectContaining({ id: "11", title: "报价" }),
        expect.objectContaining({ id: "12", title: "致歉" }),
      ],
      quickReplies: [
        expect.objectContaining({ categoryId: "11", contentText: "报价话术" }),
        expect.objectContaining({ categoryId: "12", contentText: "致歉话术" }),
      ],
      truncated: {
        categories: false,
        quickReplies: false,
      },
    });
    expect(db.selects[0]).toMatchObject({
      limits: [51],
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_quick_reply_category",
      wheres: [
        ["uid", "=", 10001],
        ["biz_status", "=", 1],
        ["scope_type", "=", 1],
        ["sub_uid", "=", 0],
        ["parent_id", "=", 10],
      ],
    });
    expect(db.selects[1]).toMatchObject({
      limits: [10_001],
      orderBys: [
        ["sort", "desc"],
        ["id", "desc"],
      ],
      table: "xy_wap_embed_quick_reply",
      wheres: [
        ["uid", "=", 10001],
        ["biz_status", "=", 1],
        ["scope_type", "=", 1],
        ["sub_uid", "=", 0],
        ["category_id", "in", [11, 12]],
      ],
    });
  });

  it("creates quick reply categories and replies in the requested scope", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.createQuickReplyCategory({
        opSubUserId: "9",
        parentId: 0,
        scopeType: 1,
        sort: 100,
        subUserId: "9",
        title: "售前",
        uid: 10001,
      }),
    ).resolves.toBe("1801");

    await expect(
      repository.createQuickReply({
        attachments: [
          {
            content: { fileName: "报价单.pdf", fileUrl: "https://example.com/file.pdf" },
            materialCollectionId: "8",
            msgid: "1025656",
            type: "file",
          },
        ],
        categoryId: "11",
        contentText: "您好",
        labelColor: "orange",
        labelText: "售前",
        opSubUserId: "9",
        scopeType: 2,
        sort: 90,
        subUserId: "9",
        uid: 10001,
      }),
    ).resolves.toBe("1801");

    expect(db.inserts).toEqual([
      {
        table: "xy_wap_embed_quick_reply_category",
        values: {
          biz_status: 1,
          op_sub_uid: 9,
          parent_id: 0,
          scope_type: 1,
          sort: 100,
          sub_uid: 0,
          title: "售前",
          uid: 10001,
        },
      },
      {
        table: "xy_wap_embed_quick_reply",
        values: {
          attachments: JSON.stringify([
            {
              content: {
                fileName: "报价单.pdf",
                fileUrl: "https://example.com/file.pdf",
              },
              materialCollectionId: "8",
              msgid: "1025656",
              type: "file",
            },
          ]),
          biz_status: 1,
          category_id: 11,
          content_text: "您好",
          label_color: "orange",
          label_text: "售前",
          op_sub_uid: 9,
          scope_type: 2,
          sort: 90,
          sub_uid: 9,
          uid: 10001,
        },
      },
    ]);
  });

  it("batch creates quick replies with one insert statement", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.batchCreateQuickReplies({
        items: [
          {
            attachments: [],
            categoryId: "11",
            contentText: "您好",
            labelColor: "orange",
            labelText: "售前",
            sort: 90,
          },
          {
            attachments: [
              {
                content: { fileName: "报价单.pdf", fileUrl: "https://example.com/file.pdf" },
                materialCollectionId: "8",
                msgid: "1025656",
                type: "file",
              },
            ],
            categoryId: "12",
            contentText: "报价见附件",
            labelColor: "",
            labelText: "",
            sort: 89,
          },
        ],
        opSubUserId: "9",
        scopeType: 2,
        subUserId: "9",
        uid: 10001,
      }),
    ).resolves.toBeUndefined();

    expect(db.inserts).toEqual([
      {
        table: "xy_wap_embed_quick_reply",
        values: [
          {
            attachments: "[]",
            biz_status: 1,
            category_id: 11,
            content_text: "您好",
            label_color: "orange",
            label_text: "售前",
            op_sub_uid: 9,
            scope_type: 2,
            sort: 90,
            sub_uid: 9,
            uid: 10001,
          },
          {
            attachments: JSON.stringify([
              {
                content: {
                  fileName: "报价单.pdf",
                  fileUrl: "https://example.com/file.pdf",
                },
                materialCollectionId: "8",
                msgid: "1025656",
                type: "file",
              },
            ]),
            biz_status: 1,
            category_id: 12,
            content_text: "报价见附件",
            label_color: "",
            label_text: "",
            op_sub_uid: 9,
            scope_type: 2,
            sort: 89,
            sub_uid: 9,
            uid: 10001,
          },
        ],
      },
    ]);
  });

  it("updates quick reply categories only in the requested scope", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await repository.renameQuickReplyCategory({
      categoryId: "11",
      scopeType: 2,
      subUserId: "9",
      title: "新分类",
      uid: 10001,
    });
    await repository.topQuickReplyCategory({
      categoryId: "11",
      scopeType: 2,
      sort: 200,
      subUserId: "9",
      uid: 10001,
    });
    await repository.bottomQuickReplyCategory({
      categoryId: "11",
      scopeType: 2,
      sort: 100,
      subUserId: "9",
      uid: 10001,
    });
    await repository.deleteQuickReplyCategory({
      categoryId: "11",
      scopeType: 2,
      subUserId: "9",
      uid: 10001,
    });

    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_quick_reply_category",
        values: { title: "新分类" },
        wheres: [
          ["id", "=", 11],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply_category",
        values: { sort: 200 },
        wheres: [
          ["id", "=", 11],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply_category",
        values: { sort: 100 },
        wheres: [
          ["id", "=", 11],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply_category",
        values: { biz_status: 0 },
        wheres: [
          ["id", "=", 11],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
    ]);
  });

  it("updates quick replies only in the requested scope", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await repository.updateQuickReply({
      attachments: [
        {
          content: {
            fileName: "新报价单.pdf",
            fileUrl: "https://example.com/new-file.pdf",
          },
          materialCollectionId: "8",
          msgid: "1025656",
          type: "file",
        },
      ],
      categoryId: "12",
      contentText: "新话术",
      labelColor: "blue",
      labelText: "报价",
      quickReplyId: "21",
      scopeType: 2,
      subUserId: "9",
      uid: 10001,
    });
    await repository.topQuickReply({
      quickReplyId: "21",
      scopeType: 2,
      sort: 200,
      subUserId: "9",
      uid: 10001,
    });
    await repository.bottomQuickReply({
      quickReplyId: "21",
      scopeType: 2,
      sort: 100,
      subUserId: "9",
      uid: 10001,
    });
    await repository.deleteQuickReply({
      quickReplyId: "21",
      scopeType: 2,
      subUserId: "9",
      uid: 10001,
    });

    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_quick_reply",
        values: {
          attachments: JSON.stringify([
            {
              content: {
                fileName: "新报价单.pdf",
                fileUrl: "https://example.com/new-file.pdf",
              },
              materialCollectionId: "8",
              msgid: "1025656",
              type: "file",
            },
          ]),
          category_id: 12,
          content_text: "新话术",
          label_color: "blue",
          label_text: "报价",
        },
        wheres: [
          ["id", "=", 21],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply",
        values: { sort: 200 },
        wheres: [
          ["id", "=", 21],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply",
        values: { sort: 100 },
        wheres: [
          ["id", "=", 21],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply",
        values: { biz_status: 0 },
        wheres: [
          ["id", "=", 21],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
    ]);
  });

  it("moves quick reply categories and replies only in the requested scope", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await repository.moveQuickReplyCategory({
      categoryId: "11",
      parentId: "20",
      scopeType: 2,
      sort: 80,
      subUserId: "9",
      uid: 10001,
    });
    await repository.moveQuickReply({
      categoryId: "12",
      quickReplyId: "21",
      scopeType: 2,
      sort: 70,
      subUserId: "9",
      uid: 10001,
    });

    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_quick_reply_category",
        values: {
          parent_id: 20,
          sort: 80,
        },
        wheres: [
          ["id", "=", 11],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_quick_reply",
        values: {
          category_id: 12,
          sort: 70,
        },
        wheres: [
          ["id", "=", 21],
          ["uid", "=", 10001],
          ["scope_type", "=", 2],
          ["sub_uid", "=", 9],
          ["biz_status", "=", 1],
        ],
      },
    ]);
  });

  it("finds material message from the read-only platform message table by id and uid", async () => {
    const db = createMaterialDb({
      "xy_wap_embed_msg_audit_info as message": {
        chatType: 2,
        content: JSON.stringify({ title: "小程序卡片" }),
        fromType: 1,
        id: 988,
        msgid: "msg-mini-1",
        msgtime: 1_777_000_000_000,
        msgtype: "weapp",
        thirdFromId: "seat-third-user-1",
        thirdUserId: "seat-third-user-1",
        uid: 9001,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    const message = await repository.findMaterialMessage({
      msgInfoId: "988",
      uid: 9001,
    });

    expect(message).toMatchObject({
      chatType: 2,
      content: JSON.stringify({ title: "小程序卡片" }),
      fromType: 1,
      msgid: "msg-mini-1",
      msgtype: "weapp",
      thirdFromId: "seat-third-user-1",
      thirdUserId: "seat-third-user-1",
      uid: 9001,
    });
    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info as message",
      joinConditions: [],
      wheres: [
        ["message.id", "=", 988],
        ["message.uid", "=", 9001],
      ],
    });
    expect(db.selects[0].whereExpressions).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
    expect(db.updates).toHaveLength(0);
  });

  it("looks up material collections by duplicate domain including deleted rows", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: {
        biz_status: 0,
        biz_type: 2,
        content: null,
        create_time: 1_777_000_000_000,
        group_id: 9,
        id: 77,
        msg_info_id: 9101,
        op_sub_uid: 88,
        sort: 10,
        sub_uid: 88,
        title: "已删除文件",
        uid: 9001,
        update_time: 1_777_000_005_000,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    const lookup = await repository.findMaterialCollectionByMessage({
      bizType: 2,
      msgInfoId: "9101",
      subUid: 88,
      uid: 9001,
    });

    expect(lookup).toMatchObject({
      bizStatus: 0,
      id: "77",
      item: {
        id: "77",
        msgInfoId: "9101",
        title: "已删除文件",
      },
    });
    expect(db.selects[0].wheres).toEqual([
      ["uid", "=", 9001],
      ["biz_type", "=", 2],
      ["sub_uid", "=", 88],
      ["msg_info_id", "=", 9101],
    ]);
  });

  it("looks up active enterprise material collection msgInfoId for forward sends", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: {
        content: JSON.stringify({ title: "客户跟进小程序" }),
        msg_info_id: 1025657,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.findMaterialCollectionForForward({
        bizType: 3,
        id: "66",
        uid: 9001,
      }),
    ).resolves.toEqual({
      content: JSON.stringify({ title: "客户跟进小程序" }),
      msgInfoId: "1025657",
    });

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_material_collection",
      wheres: [
        ["id", "=", 66],
        ["uid", "=", 9001],
        ["biz_type", "=", 3],
        ["sub_uid", "=", 0],
        ["biz_status", "=", 1],
      ],
    });
  });

  it("looks up active expression material collection in current sub-user scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: {
        content: JSON.stringify({
          fileUrl: "https://example.com/expression.gif",
        }),
        msg_info_id: 1025658,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.findMaterialCollectionForForward({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION,
        id: "65",
        subUserId: "101",
        uid: 9001,
      }),
    ).resolves.toEqual({
      content: JSON.stringify({
        fileUrl: "https://example.com/expression.gif",
      }),
      msgInfoId: "1025658",
    });

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_material_collection",
      wheres: [
        ["id", "=", 65],
        ["uid", "=", 9001],
        ["biz_type", "=", MATERIAL_COLLECTION_BIZ_TYPE.EXPRESSION],
        ["sub_uid", "=", 101],
        ["biz_status", "=", 1],
      ],
    });
  });

  it("looks up active image material collection in enterprise scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: {
        content: JSON.stringify({
          fileUrl: "s5/msg/20260624/272/product.png",
        }),
        msg_info_id: 1025659,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.findMaterialCollectionForForward({
        bizType: MATERIAL_COLLECTION_BIZ_TYPE.IMAGE,
        id: "68",
        uid: 9001,
      }),
    ).resolves.toEqual({
      content: JSON.stringify({
        fileUrl: "s5/msg/20260624/272/product.png",
      }),
      msgInfoId: "1025659",
    });

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_material_collection",
      wheres: [
        ["id", "=", 68],
        ["uid", "=", 9001],
        ["biz_type", "=", MATERIAL_COLLECTION_BIZ_TYPE.IMAGE],
        ["sub_uid", "=", 0],
        ["biz_status", "=", 1],
      ],
    });
  });

  it("returns false when material group has active collections", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: { id: 66 },
    });
    const repository = new WorkbenchRepository(db as never);

    const empty = await repository.isMaterialGroupEmpty({
      bizType: 2,
      groupId: "9",
      uid: 9001,
    });

    expect(empty).toBe(false);
    expect(db.selects[0].wheres).toEqual([
      ["uid", "=", 9001],
      ["biz_type", "=", 2],
      ["group_id", "=", 9],
      ["biz_status", "=", 1],
    ]);
  });

  it("does not query when material group id is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.isMaterialGroupEmpty({
        bizType: 2,
        groupId: "invalid",
        uid: 9001,
      }),
    ).resolves.toBe(true);
  });

  it("creates material collection in the collection table", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    const insertedId = await repository.createMaterialCollection({
      bizType: 2,
      content: JSON.stringify({ fileName: "报价.pdf" }),
      groupId: "9",
      msgInfoId: "9102",
      opSubUserId: "88",
      sort: 40,
      subUid: 88,
      title: "报价文件",
      uid: 9001,
    });

    expect(insertedId).toBe("1801");
    expect(db.inserts).toEqual([
      {
        table: "xy_wap_embed_material_collection",
        values: {
          biz_status: 1,
          biz_type: 2,
          content: JSON.stringify({ fileName: "报价.pdf" }),
          group_id: 9,
          msg_info_id: 9102,
          op_sub_uid: 88,
          sort: 40,
          sub_uid: 88,
          title: "报价文件",
          uid: 9001,
        },
      },
    ]);
  });

  it("returns duplicate marker when material collection insert hits unique key", async () => {
    const duplicateKeyError = Object.assign(new Error("Duplicate entry"), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
    });
    const db = createMaterialDb();
    db.inserts.length = 0;
    const repository = new WorkbenchRepository({
      ...db,
      insertInto(table: string) {
        const insert = { table, values: undefined as unknown };
        db.inserts.push(insert);

        return {
          values(values: unknown) {
            insert.values = values;
            return this;
          },
          async executeTakeFirstOrThrow() {
            throw duplicateKeyError;
          },
        };
      },
    } as never);

    await expect(
      repository.createMaterialCollection({
        bizType: 2,
        content: null,
        groupId: "9",
        msgInfoId: "9103",
        opSubUserId: "88",
        sort: 40,
        subUid: 0,
        title: "报价文件",
        uid: 9001,
      }),
    ).resolves.toBe("DUPLICATE");
  });

  it("soft deletes, tops, and moves material collection rows", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await repository.deleteMaterialCollection({ id: "66", subUid: 101, uid: 9001 });
    await repository.topMaterialCollection({ id: "66", sort: 90, subUid: 101, uid: 9001 });
    await repository.moveMaterialCollection({
      groupId: "9",
      id: "66",
      sort: 12,
      subUid: 101,
      uid: 9001,
    });

    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_material_collection",
        values: { biz_status: 0 },
        wheres: [
          ["id", "=", 66],
          ["uid", "=", 9001],
          ["sub_uid", "=", 101],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_material_collection",
        values: { sort: 90 },
        wheres: [
          ["id", "=", 66],
          ["uid", "=", 9001],
          ["sub_uid", "=", 101],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_material_collection",
        values: { group_id: 9, sort: 12 },
        wheres: [
          ["id", "=", 66],
          ["uid", "=", 9001],
          ["sub_uid", "=", 101],
          ["biz_status", "=", 1],
        ],
      },
    ]);
  });

  it("looks up material collection operation scope", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection: {
        biz_type: 1,
        sub_uid: 101,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.findMaterialCollectionScope({ id: "66", uid: 9001 }),
    ).resolves.toEqual({
      bizType: 1,
      subUid: 101,
    });

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_material_collection",
      wheres: [
        ["id", "=", 66],
        ["uid", "=", 9001],
        ["biz_status", "=", 1],
      ],
    });
  });

  it("checks active enterprise material group existence", async () => {
    const db = createMaterialDb({
      xy_wap_embed_material_collection_group: {
        id: 9,
      },
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.hasActiveMaterialGroup({
        bizType: 4,
        groupId: "9",
        uid: 9001,
      }),
    ).resolves.toBe(true);

    expect(db.selects[0]).toMatchObject({
      table: "xy_wap_embed_material_collection_group",
      wheres: [
        ["id", "=", 9],
        ["uid", "=", 9001],
        ["biz_type", "=", 4],
        ["biz_status", "=", 1],
        ["sub_uid", "=", 0],
      ],
    });
  });

  it("restores material collection rows for duplicate recovery", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    await repository.restoreMaterialCollection({
      content: JSON.stringify({ fileName: "报价.pdf" }),
      groupId: "9",
      id: "66",
      msgInfoId: "9104",
      opSubUserId: "88",
      sort: 120,
      title: "恢复文件",
      uid: 9001,
    });

    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_material_collection",
        values: {
          biz_status: 1,
          content: JSON.stringify({ fileName: "报价.pdf" }),
          group_id: 9,
          msg_info_id: 9104,
          op_sub_uid: 88,
          sort: 120,
          title: "恢复文件",
        },
        wheres: [
          ["id", "=", 66],
          ["uid", "=", 9001],
        ],
      },
    ]);
  });

  it("creates and updates material group rows", async () => {
    const db = createMaterialDb();
    const repository = new WorkbenchRepository(db as never);

    const groupId = await repository.createMaterialGroup({
      bizType: 2,
      sort: 80,
      subUid: 88,
      title: "文件分组",
      uid: 9001,
    });
    await repository.renameMaterialGroup({
      bizType: 2,
      groupId: "9",
      title: "新文件分组",
      uid: 9001,
    });
    await repository.topMaterialGroup({ bizType: 2, groupId: "9", sort: 200, uid: 9001 });
    await repository.deleteMaterialGroup({ bizType: 2, groupId: "9", uid: 9001 });

    expect(groupId).toBe("1801");
    expect(db.inserts).toEqual([
      {
        table: "xy_wap_embed_material_collection_group",
        values: {
          biz_status: 1,
          biz_type: 2,
          sort: 80,
          sub_uid: 88,
          title: "文件分组",
          uid: 9001,
        },
      },
    ]);
    expect(db.updates).toEqual([
      {
        table: "xy_wap_embed_material_collection_group",
        values: { title: "新文件分组" },
        wheres: [
          ["id", "=", 9],
          ["uid", "=", 9001],
          ["biz_type", "=", 2],
          ["sub_uid", "=", 0],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_material_collection_group",
        values: { sort: 200 },
        wheres: [
          ["id", "=", 9],
          ["uid", "=", 9001],
          ["biz_type", "=", 2],
          ["sub_uid", "=", 0],
          ["biz_status", "=", 1],
        ],
      },
      {
        table: "xy_wap_embed_material_collection_group",
        values: { biz_status: 0 },
        wheres: [
          ["id", "=", 9],
          ["uid", "=", 9001],
          ["biz_type", "=", 2],
          ["sub_uid", "=", 0],
          ["biz_status", "=", 1],
        ],
      },
    ]);
  });

  it("rejects material collection creation when ids are invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.createMaterialCollection({
        bizType: 2,
        content: null,
        groupId: "bad",
        msgInfoId: "bad",
        opSubUserId: "88",
        sort: 40,
        subUid: 88,
        title: "报价文件",
        uid: 9001,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_MATERIAL_COLLECTION_INPUT",
      statusCode: 400,
    });
  });

  it("does not write material collection updates when ids are invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.topMaterialCollection({
        id: "bad",
        sort: 90,
        subUid: 88,
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.hasActiveMaterialGroup({
        bizType: 2,
        groupId: "bad",
        uid: 9001,
      }),
    ).resolves.toBe(false);
  });

  it("does not send NaN to MySQL when subUserId is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSubUser("sub-user-001")).resolves.toBeUndefined();
    await expect(
      repository.listSeats({
        platform: 5,
        subUserId: "sub-user-001",
        uid: 9001,
      } as never),
    ).resolves.toEqual([]);
    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "sub-user-001",
          uid: 9001,
        } as never,
        "1",
      ),
    ).resolves.toBe(false);
  });

  it("does not send NaN to MySQL when route ids are invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSeat("not-a-seat")).resolves.toBeUndefined();
    await expect(repository.getSeat("1e2")).resolves.toBeUndefined();
    await expect(repository.getSeat("1.2")).resolves.toBeUndefined();
    await expect(repository.getSeat(" 1")).resolves.toBeUndefined();
    await expect(repository.listConversations("not-a-seat")).resolves.toMatchObject({
      hasMore: false,
      items: [],
      snapshotAt: expect.any(Number),
    });
    await expect(
      repository.getConversationLookup("not-a-conversation"),
    ).resolves.toBeUndefined();
    await expect(
      repository.listMessages("not-a-conversation", { limit: 30 }),
    ).resolves.toEqual({
      filteredCount: 0,
      hasMore: false,
      messages: [],
      scannedCount: 0,
    });
    await expect(repository.listGroupMembers("not-a-conversation")).resolves.toBeUndefined();
    await expect(
      repository.listHistoryMessages("not-a-conversation", { limit: 30 }),
    ).resolves.toEqual({
      hasNext: false,
      hasPrev: false,
      messages: [],
    });
    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "1",
          uid: 9001,
        } as never,
        "not-a-seat",
      ),
    ).resolves.toBe(false);
  });

  it("loads seats from explicit workbench scope without querying sub-user platform", async () => {
    const queries: Array<{ query: ReturnType<typeof createQueryBuilder>; table: string }> = [];
    const observedTables: string[] = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_sub_user") {
            throw new Error("sub_user must not be queried for workbench platform scope");
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                avatar: "https://example.com/drc.png",
                host_sub_id: 11,
                id: 101,
                is_online: 0,
                platform: 5,
                third_user_name: "德瑞可",
                third_userid: "seat-user-001",
                uid: 9001,
              },
            ]);
            queries.push({ query, table });
            return query;
          }

          if (table === "xy_wap_embed_conversation") {
            const query = createQueryBuilder([
              {
                last_msgtime: 1_778_839_950_000,
                platform: 5,
                third_userid: "seat-user-001",
                uid: 9001,
                unread_cnt: 4,
              },
            ]);
            queries.push({ query, table });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listSeats({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual([
      expect.objectContaining({
        seatId: "101",
      }),
    ]);

    expect(observedTables).not.toContain("xy_wap_embed_sub_user");
    expect(queries[0]?.query.wheres).toContainEqual(["relation.sub_id", "=", 11]);
    expect(queries[0]?.query.wheres).toContainEqual(["relation.uid", "=", 9001]);
    expect(queries[0]?.query.wheres).toContainEqual(["relation.platform", "=", 5]);
  });

  it("filters seat list rows to the authenticated workbench platform", async () => {
    const queries: Array<{ query: ReturnType<typeof createQueryBuilder>; table: string }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createFilteredRowsQueryBuilder(
              [
                {
                  avatar: "https://example.com/drc.png",
                  biz_status: 1,
                  expire_time: null,
                  host_sub_id: 11,
                  id: 101,
                  is_online: 0,
                  platform: 5,
                  relation_sub_id: 11,
                  third_user_name: "德瑞可",
                  third_userid: "seat-user-001",
                  uid: 9001,
                },
                {
                  avatar: "https://example.com/other-platform.png",
                  biz_status: 1,
                  expire_time: null,
                  host_sub_id: 11,
                  id: 201,
                  is_online: 1,
                  platform: 6,
                  relation_sub_id: 11,
                  third_user_name: "跨平台席位",
                  third_userid: "seat-user-platform-6",
                  uid: 9001,
                },
              ],
              {
                "relation.platform": "platform",
                "relation.sub_id": "relation_sub_id",
                "relation.uid": "uid",
              },
            );
            queries.push({ query, table });
            return query;
          }

          if (table === "xy_wap_embed_conversation") {
            const query = createFilteredRowsQueryBuilder(
              [
                {
                  chat_type: 1,
                  last_msgtime: 1_778_839_950_000,
                  platform: 5,
                  third_userid: "seat-user-001",
                  uid: 9001,
                  unread_cnt: 4,
                },
                {
                  chat_type: 1,
                  last_msgtime: 1_778_839_960_000,
                  platform: 6,
                  third_userid: "seat-user-platform-6",
                  uid: 9001,
                  unread_cnt: 9,
                },
              ],
              {
                platform: "platform",
                third_userid: "third_userid",
                uid: "uid",
              },
            );
            queries.push({ query, table });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const seats = await repository.listSeats({
      platform: 5,
      subUserId: "11",
      uid: 9001,
    } as never);

    expect(seats.map((seat) => seat.seatId)).toEqual(["101"]);
    expect(seats.map((seat) => seat.unreadCount)).toEqual([4]);
    expect(queries[0]?.query.wheres).toContainEqual(["relation.platform", "=", 5]);
    expect(queries[1]?.query.wheres).toContainEqual(["platform", "=", 5]);
  });

  it("loads sidebar tuse secrets from explicit workbench scope without querying sub-user platform", async () => {
    const observedTables: string[] = [];
    const relationQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_sub_user") {
            throw new Error("sub_user must not be queried for tuse scope");
          }

          if (table === "xy_wap_embed_user_relation") {
            const query = createQueryBuilder({
              appid: "mid-001",
              iv_parameter: "1234567890abcdef",
              secret: "abcdef1234567890",
            });
            relationQueries.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getEmbedUserRelationTuseSecrets({
        platform: 5,
        uid: 9001,
      } as never),
    ).resolves.toEqual({
      appId: "mid-001",
      ivParameter: "1234567890abcdef",
      secret: "abcdef1234567890",
    });

    expect(observedTables).not.toContain("xy_wap_embed_sub_user");
    expect(relationQueries[0]?.wheres).toContainEqual(["uid", "=", 9001]);
    expect(relationQueries[0]?.wheres).toContainEqual(["platform", "=", 5]);
    expect(relationQueries[0]?.wheres).toContainEqual(["biz_status", "=", 1]);
  });

  it("loads the latest single conversation message summary by conversation scope", async () => {
    const createdAt = new Date("2026-06-29T10:00:00.000Z");
    const queries: Array<{ query: ReturnType<typeof createQueryBuilder>; table: string }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_msg_audit_info as message") {
            const query = createQueryBuilder({ create_time: createdAt, msgtype: "text" });
            queries.push({ query, table });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getLatestConversationMessageSummary({
        messageSourceThirdUserId: "seat-user-001",
        platform: 5,
        thirdExternalUserId: "external-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      createdAt: createdAt.getTime(),
      msgtype: "text",
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.query.wheres).toEqual([
      ["message.uid", "=", 9001],
      ["message.platform", "=", 5],
      ["message.third_user_id", "=", "seat-user-001"],
      ["message.third_external_id", "=", "external-001"],
    ]);
    expect(queries[0]?.query.orderBys).toEqual([["message.id", "desc"]]);
    expect(queries[0]?.query.limits).toEqual([1]);
  });

  it("loads the latest shadow group message summary from the opening-seat partition", async () => {
    const query = createQueryBuilder({
      create_time: new Date("2026-06-29T10:00:00.000Z"),
      msgtype: "text",
    });
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info as message");
          return query;
        },
      } as never,
    );

    await repository.getLatestConversationMessageSummary({
      messageSourceThirdUserId: "opening-seat-001",
      platform: 5,
      thirdGroupId: "group-001",
      uid: 9001,
    });

    expect(query.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "opening-seat-001",
    ]);
    expect(query.wheres).toContainEqual(["message.third_group_id", "=", "group-001"]);
  });

  it("does not query latest conversation message without a conversation target", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.getLatestConversationMessageSummary({
        messageSourceThirdUserId: "seat-user-001",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("loads seats by joining relation and seat before conversation aggregation", async () => {
    const queries: Array<{ query: ReturnType<typeof createQueryBuilder>; table: string }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                avatar: "https://example.com/drc.png",
                host_sub_id: 11,
                id: 101,
                is_online: 0,
                platform: 5,
                third_user_name: "德瑞可",
                third_userid: "seat-user-001",
                uid: 9001,
              },
              {
                avatar: "https://example.com/ndt.png",
                host_sub_id: 0,
                id: 102,
                is_online: 1,
                platform: 5,
                third_user_name: "念都堂",
                third_userid: "seat-user-002",
                uid: 9001,
              },
            ]);
            queries.push({ query, table });
            return query;
          }

          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation") {
            const query = createQueryBuilder([
              {
                last_msgtime: 1_778_839_950_000,
                platform: 5,
                third_userid: "seat-user-001",
                uid: 9001,
                unread_cnt: 4,
              },
              {
                last_msgtime: 1_778_839_900_000,
                platform: 5,
                third_userid: "seat-user-002",
                uid: 9001,
                unread_cnt: 9,
              },
            ]);
            queries.push({ query, table });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listSeats({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual([
      expect.objectContaining({
        seatId: "101",
        unreadCount: 4,
      }),
      expect.objectContaining({
        seatId: "102",
        unreadCount: 9,
      }),
    ]);

    expect(queries.map((query) => query.table)).toEqual([
      "xy_wap_embed_user_seat_sub_relation as relation",
      "xy_wap_embed_conversation",
    ]);
    expect(queries[0]?.query.joins).toEqual(["innerJoin", "leftJoin", "leftJoin"]);
    expect(queries[0]?.query.joinConditions).toEqual([
      {
        conditions: [
          ["seat.id", "=", "relation.user_seat_id"],
          ["seat.uid", "=", "relation.uid"],
          ["seat.platform", "=", "relation.platform"],
        ],
        table: "xy_wap_embed_user_seat as seat",
        type: "innerJoin",
      },
      {
        conditions: [
          ["seat_agent.user_seat_id", "=", "seat.id"],
          ["seat_agent.uid", "=", "seat.uid"],
        ],
        table: "xy_wap_embed_user_seat_agent as seat_agent",
        type: "leftJoin",
      },
      {
        conditions: [
          ["seat_group_agent.user_seat_id", "=", "seat.id"],
          ["seat_group_agent.uid", "=", "seat.uid"],
        ],
        table: "xy_wap_embed_user_seat_group_agent as seat_group_agent",
        type: "leftJoin",
      },
    ]);
    expect(queries[0]?.query.wheres).toContainEqual(["relation.uid", "=", 9001]);
    expect(queries[0]?.query.wheres).toContainEqual(["relation.platform", "=", 5]);
    expect(queries[0]?.query.wheres).not.toContainEqual(["seat.biz_status", "=", 1]);
    expect(queries[1]?.query.joins).toEqual([]);
    expect(queries[1]?.query.wheres).toContainEqual(["uid", "=", 9001]);
    expect(queries[1]?.query.wheres).toContainEqual(["platform", "=", 5]);
    expect(queries[1]?.query.wheres).not.toContainEqual(["uid", "in", [9001]]);
    expect(queries[1]?.query.wheres).not.toContainEqual(["platform", "in", [5]]);
    expect(queries[1]?.query.aggregateFns).toEqual(["sum", "max"]);
    expect(queries[1]?.query.groupBys).toEqual([
      "uid",
      "platform",
      "third_userid",
      "chat_type",
    ]);
  });

  it("loads seat details without joining conversations", async () => {
    const queryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            const query = createQueryBuilder([
              {
                avatar: "https://example.com/drc.png",
                host_sub_id: 11,
                id: 101,
                is_online: 0,
                platform: 5,
                third_user_name: "德瑞可",
                third_userid: "seat-user-001",
                uid: 9001,
              },
            ]);
            queryBuilders.push(query);
            return query;
          }

          if (table === "xy_wap_embed_conversation") {
            const query = createQueryBuilder([
              {
                last_msgtime: 1_778_839_950_000,
                platform: 5,
                third_userid: "seat-user-001",
                uid: 9001,
                unread_cnt: 3,
              },
            ]);
            queryBuilders.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(repository.getSeat("101")).resolves.toMatchObject({
      seatId: "101",
      unreadCount: 3,
    });

    expect(queryBuilders[0]?.joins).toEqual(["leftJoin", "leftJoin"]);
    expect(queryBuilders[0]?.joinConditions).toEqual([
      {
        conditions: [
          ["seat_agent.user_seat_id", "=", "xy_wap_embed_user_seat.id"],
          ["seat_agent.uid", "=", "xy_wap_embed_user_seat.uid"],
        ],
        table: "xy_wap_embed_user_seat_agent as seat_agent",
        type: "leftJoin",
      },
      {
        conditions: [
          ["seat_group_agent.user_seat_id", "=", "xy_wap_embed_user_seat.id"],
          ["seat_group_agent.uid", "=", "xy_wap_embed_user_seat.uid"],
        ],
        table: "xy_wap_embed_user_seat_group_agent as seat_group_agent",
        type: "leftJoin",
      },
    ]);
    expect(queryBuilders[1]?.joins).toEqual([]);
  });

  it("sorts seats with large ids without precision loss", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return createQueryBuilder([
              {
                avatar: "https://example.com/old.png",
                host_sub_id: 0,
                id: "9007199254740992",
                is_online: 0,
                platform: 5,
                third_user_name: "旧席位",
                third_userid: "seat-user-001",
                uid: 9001,
              },
              {
                avatar: "https://example.com/new.png",
                host_sub_id: 0,
                id: "9007199254740993",
                is_online: 0,
                platform: 5,
                third_user_name: "新席位",
                third_userid: "seat-user-002",
                uid: 9001,
              },
            ]);
          }

          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation") {
            return createQueryBuilder([
              {
                last_msgtime: 1_778_839_950_000,
                platform: 5,
                third_userid: "seat-user-001",
                uid: 9001,
                unread_cnt: 3,
              },
              {
                last_msgtime: 1_778_839_950_000,
                platform: 5,
                third_userid: "seat-user-002",
                uid: 9001,
                unread_cnt: 1,
              },
            ]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listSeats({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual([
      expect.objectContaining({
        seatId: "9007199254740993",
      }),
      expect.objectContaining({
        seatId: "9007199254740992",
      }),
    ]);
  });

  it("checks seat access by joining relation and seat without filtering seat status", async () => {
    const queryBuilders: Array<{
      joins: string[];
      table: string;
      wheres: Array<[string, string, unknown]>;
    }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                seat_id: 101,
                uid: 9001,
              },
            ]);
            queryBuilders.push({ joins: query.joins, table, wheres: query.wheres });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(true);

    expect(queryBuilders).toEqual([
      {
        joins: ["innerJoin"],
        table: "xy_wap_embed_user_seat_sub_relation as relation",
        wheres: [
          ["relation.sub_id", "=", 11],
          ["relation.uid", "=", 9001],
          ["relation.platform", "=", 5],
        ],
      },
    ]);
  });

  it("checks seat access from explicit workbench scope without querying sub-user platform", async () => {
    const observedTables: string[] = [];
    const relationQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_sub_user") {
            throw new Error("sub_user must not be queried for seat access scope");
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                seat_id: 101,
                uid: 9001,
              },
            ]);
            relationQueries.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(true);

    expect(observedTables).not.toContain("xy_wap_embed_sub_user");
    expect(relationQueries[0]?.wheres).toEqual([
      ["relation.sub_id", "=", 11],
      ["relation.uid", "=", 9001],
      ["relation.platform", "=", 5],
    ]);
  });

  it("checks seat access from cached seat-access snapshot without querying DB", async () => {
    const cache = createCacheMock({
      "chatai:seat-access:11": JSON.stringify({
        platform: 5,
        seatIds: ["101", "102"],
        uid: 9001,
        version: 1,
      }),
    });
    const repository = new WorkbenchRepository(createFailingDb() as never, cache);

    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(true);
    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "103",
      ),
    ).resolves.toBe(false);
    expect(cache.get).toHaveBeenCalledWith("chatai:seat-access:11");
  });

  it("falls back to DB when reading the seat-access cache fails", async () => {
    const cache = createCacheMock();
    cache.get.mockRejectedValueOnce(new Error("redis unavailable"));
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return createQueryBuilder([
              {
                platform: 5,
                seat_id: 101,
                uid: 9001,
              },
            ]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
      cache,
    );

    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(true);
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:seat-access:11",
      JSON.stringify({
        platform: 5,
        seatIds: ["101"],
        uid: 9001,
        version: 1,
      }),
      600,
    );
  });

  it("falls back to DB for JSON primitive seat-access cache entries", async () => {
    const cache = createCacheMock({
      "chatai:seat-access:11": "null",
    });
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return createQueryBuilder([
              {
                platform: 5,
                seat_id: 101,
                uid: 9001,
              },
            ]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
      cache,
    );

    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(true);
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:seat-access:11",
      JSON.stringify({
        platform: 5,
        seatIds: ["101"],
        uid: 9001,
        version: 1,
      }),
      600,
    );
  });

  it("writes a seat-access snapshot when relation scope misses cache", async () => {
    const cache = createCacheMock();
    const relationQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                seat_id: 101,
                uid: 9001,
              },
              {
                platform: 5,
                seat_id: 102,
                uid: 9001,
              },
            ]);
            relationQueries.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
      cache,
    );

    await expect(
      repository.getSeatEventScope({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual({
      platform: 5,
      seatIds: ["101", "102"],
      uid: 9001,
    });
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:seat-access:11",
      JSON.stringify({
        platform: 5,
        seatIds: ["101", "102"],
        uid: 9001,
        version: 1,
      }),
      600,
    );
    expect(relationQueries[0]?.wheres).toEqual([
      ["relation.sub_id", "=", 11],
      ["relation.uid", "=", 9001],
      ["relation.platform", "=", 5],
    ]);
  });

  it("reads active seat event scope from explicit workbench scope without querying sub-user platform", async () => {
    const observedTables: string[] = [];
    const relationQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_sub_user") {
            throw new Error("sub_user must not be queried for seat event scope");
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                seat_id: 12,
                uid: 272,
              },
              {
                platform: 5,
                seat_id: 13,
                uid: 272,
              },
            ]);
            relationQueries.push(query);

            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getSeatEventScope({
        platform: 5,
        subUserId: "101",
        uid: 272,
      } as never),
    ).resolves.toEqual({
      platform: 5,
      seatIds: ["12", "13"],
      uid: 272,
    });
    expect(observedTables).not.toContain("xy_wap_embed_sub_user");
    expect(relationQueries[0]?.wheres).toEqual([
      ["relation.sub_id", "=", 101],
      ["relation.uid", "=", 272],
      ["relation.platform", "=", 5],
    ]);
  });

  it("caches empty seat-access snapshots from the explicit workbench scope", async () => {
    const cache = createCacheMock();
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return createQueryBuilder([]);
          }

          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 9001,
            });
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
      cache,
    );

    await expect(
      repository.getSeatEventScope({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual({
      platform: 5,
      seatIds: [],
      uid: 9001,
    });
    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(false);
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:seat-access:11",
      JSON.stringify({
        platform: 5,
        seatIds: [],
        uid: 9001,
        version: 1,
      }),
      600,
    );
  });

  it("caches an empty seat-access snapshot without reading sub-user tenant scope", async () => {
    const cache = createCacheMock();
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return createQueryBuilder([]);
          }

          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
      cache,
    );

    await expect(
      repository.getSeatEventScope({
        platform: 5,
        subUserId: "11",
        uid: 9001,
      } as never),
    ).resolves.toEqual({
      platform: 5,
      seatIds: [],
      uid: 9001,
    });
    await expect(
      repository.canAccessSeat(
        {
          platform: 5,
          subUserId: "11",
          uid: 9001,
        } as never,
        "101",
      ),
    ).resolves.toBe(false);
    expect(cache.set).toHaveBeenCalledWith(
      "chatai:seat-access:11",
      JSON.stringify({
        platform: 5,
        seatIds: [],
        uid: 9001,
        version: 1,
      }),
      600,
    );
  });

  it("lists my customers grouped by contact identity and scoped by visible seats", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    let seatQueryCount = 0;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            const query = createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-12",
              uid: 9001,
            });
            queries.push({ table, query });
            return query;
          }
          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([
              {
                add_time: 100,
                biz_status: 1,
                bind_type: 1,
                description: "重点客户",
                id: 301,
                platform: 5,
                third_external_userid: "external-a",
                third_userid: "seat-user-12",
                uid: 9001,
              },
              {
                add_time: 200,
                biz_status: 1,
                bind_type: 2,
                description: "",
                id: 302,
                platform: 5,
                third_external_userid: "external-a",
                third_userid: "seat-user-13",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([
              {
                avatar: "https://example.com/customer-a.png",
                biz_status: 0,
                gender: 1,
                name: "客户A",
                platform: 5,
                real_name: "张三",
                third_external_userid: "external-a",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            seatQueryCount += 1;
            const query = createQueryBuilder(
              seatQueryCount === 1
                ? [
                    {
                      id: 12,
                      platform: 5,
                      third_avatar: "https://example.com/seat-12.png",
                      third_user_name: "销售一号",
                      third_userid: "seat-user-12",
                      uid: 9001,
                    },
                  ]
                : [
                    {
                      id: 12,
                      platform: 5,
                      third_avatar: "https://example.com/seat-12.png",
                      third_user_name: "销售一号",
                      third_userid: "seat-user-12",
                      uid: 9001,
                    },
                    {
                      id: 13,
                      platform: 5,
                      third_avatar: "https://example.com/seat-13.png",
                      third_user_name: "销售二号",
                      third_userid: "seat-user-13",
                      uid: 9001,
                    },
                  ],
            );
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listCustomers({
        platform: 5,
        scope: "mine",
        seatIds: ["12"],
        subUserId: "101",
        uid: 9001,
      }),
    ).resolves.toEqual({
      hasMore: false,
      items: [
        {
          avatar: "https://example.com/customer-a.png",
          bizStatus: 0,
          customerKey: "9001:5:external-a",
          gender: 1,
          name: "客户A",
          platform: 5,
          realName: "张三",
          relationCount: 2,
          seatRelations: [
            expect.objectContaining({
              bindId: "301",
              seatId: "12",
              seatName: "销售一号",
            }),
            expect.objectContaining({
              bindId: "302",
              seatId: "13",
              seatName: "销售二号",
            }),
          ],
          thirdExternalUserId: "external-a",
          uid: 9001,
        },
      ],
      total: 1,
    });
    const bindQuery = queries.find(
      (item) => item.table === "xy_wap_embed_customer_bind_relation as bind",
    )?.query;
    const accessibleSeatQuery = queries.find(
      (item) => item.table === "xy_wap_embed_user_seat as seat",
    )?.query;
    expect(accessibleSeatQuery?.joins).toEqual(["innerJoin"]);
    expect(accessibleSeatQuery?.joinConditions).toContainEqual({
      conditions: [
        ["relation.user_seat_id", "=", "seat.id"],
        ["relation.uid", "=", "seat.uid"],
        ["relation.platform", "=", "seat.platform"],
      ],
      table: "xy_wap_embed_user_seat_sub_relation as relation",
      type: "innerJoin",
    });
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.sub_id", "=", 101]);
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.uid", "=", 9001]);
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.platform", "=", 5]);
    expect(accessibleSeatQuery?.wheres).not.toContainEqual(["seat.biz_status", "=", 1]);
    expect(bindQuery?.joins).toEqual([]);
    expect(bindQuery?.wheres).toContainEqual(["bind.uid", "=", 9001]);
    expect(bindQuery?.wheres).toContainEqual(["bind.platform", "=", 5]);
    expect(bindQuery?.wheres).toContainEqual(["bind.third_userid", "=", "seat-user-12"]);
    expect(bindQuery?.orderBys).toEqual([
      ["bind.add_time", "desc"],
      ["bind.id", "desc"],
    ]);
  });

  it("limits my customer visible seat contexts to the explicit workbench scope", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listCustomers({
      platform: 5,
      scope: "mine",
      seatIds: [],
      subUserId: "101",
      uid: 9001,
    } as never);

    const accessibleSeatQuery = queries.find(
      (item) => item.table === "xy_wap_embed_user_seat as seat",
    )?.query;
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.sub_id", "=", 101]);
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.uid", "=", 9001]);
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.platform", "=", 5]);
    expect(accessibleSeatQuery?.joinConditions).toContainEqual({
      conditions: [
        ["relation.user_seat_id", "=", "seat.id"],
        ["relation.uid", "=", "seat.uid"],
        ["relation.platform", "=", "seat.platform"],
      ],
      table: "xy_wap_embed_user_seat_sub_relation as relation",
      type: "innerJoin",
    });
  });

  it("applies keyword and limit to my customer seat lists", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            const query = createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-12",
              uid: 9001,
            });
            queries.push({ table, query });
            return query;
          }
          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listCustomers({
      keyword: "张三",
      limit: 50,
      platform: 5,
      scope: "mine",
      seatIds: ["12"],
      subUserId: "101",
      uid: 9001,
    });

    const bindQuery = queries.find(
      (item) => item.table === "xy_wap_embed_customer_bind_relation as bind",
    )?.query;
    expect(bindQuery?.limits).toEqual([51]);
    expect(bindQuery?.joins).toEqual(["innerJoin"]);
    expect(bindQuery?.joinConditions[0]?.table).toBe("xy_wap_embed_contact as contact");
    expect(bindQuery?.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "contact.name", operator: "like", value: "%张三%" },
        { column: "contact.real_name", operator: "like", value: "%张三%" },
        { column: "bind.remark", operator: "like", value: "%张三%" },
      ],
    });
  });

  it("uses Date cursor bounds and encodes Date add time for my customer pages", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const cursorDate = new Date("2026-05-20T10:00:00.000Z");
    const nextCursorDate = new Date("2026-05-19T09:30:00.000Z");
    const cursor = Buffer.from(
      JSON.stringify({
        addTime: cursorDate.getTime(),
        bindId: 302,
      }),
      "utf8",
    ).toString("base64url");
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([
              {
                add_time: nextCursorDate,
                biz_status: 1,
                bind_type: 1,
                description: null,
                id: 301,
                platform: 5,
                third_external_userid: "external-a",
                third_userid: "seat-user-12",
                uid: 9001,
              },
              {
                add_time: new Date("2026-05-18T09:30:00.000Z"),
                biz_status: 1,
                bind_type: 1,
                description: null,
                id: 300,
                platform: 5,
                third_external_userid: "external-b",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([
              {
                avatar: "",
                biz_status: 1,
                gender: null,
                name: "客户A",
                platform: 5,
                real_name: "",
                third_external_userid: "external-a",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const result = await repository.listCustomers({
      cursor,
      limit: 1,
      platform: 5,
      scope: "mine",
      seatIds: ["12"],
      subUserId: "101",
      uid: 9001,
    });

    const bindQuery = queries.find(
      (item) => item.table === "xy_wap_embed_customer_bind_relation as bind",
    )?.query;
    expect(bindQuery?.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "bind.add_time", operator: "<", value: cursorDate },
        {
          type: "and",
          expressions: [
            { column: "bind.add_time", operator: "=", value: cursorDate },
            { column: "bind.id", operator: "<", value: "302" },
          ],
        },
      ],
    });
    expect(result.nextCursor).toBeTruthy();
    expect(
      JSON.parse(Buffer.from(result.nextCursor ?? "", "base64url").toString("utf8")),
    ).toEqual({
      addTime: nextCursorDate.getTime(),
      bindId: 301,
    });
  });

  it("searches all visible managed accounts with only a contact join", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 272,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                uid: 9001,
                user_seat_id: 12,
              },
              {
                platform: 5,
                uid: 9001,
                user_seat_id: 13,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
              {
                id: 13,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售二号",
                third_userid: "seat-user-13",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listCustomers({
      keyword: "张三",
      limit: 50,
      platform: 5,
      scope: "mine",
      seatIds: [],
      subUserId: "101",
      uid: 9001,
    });

    const bindQuery = queries.find(
      (item) => item.table === "xy_wap_embed_customer_bind_relation as bind",
    )?.query;
    expect(bindQuery?.joins).toEqual(["innerJoin"]);
    expect(bindQuery?.joinConditions[0]?.table).toBe("xy_wap_embed_contact as contact");
    expect(bindQuery?.wheres).toContainEqual([
      "bind.third_userid",
      "in",
      ["seat-user-12", "seat-user-13"],
    ]);
    expect(bindQuery?.joinConditions.some((join) =>
      join.table.includes("user_seat") || join.table.includes("conversation"),
    )).toBe(false);
  });

  it("lists all customers without sub-user or seat filters", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_contact as contact") {
            const query = createFilteredRowsQueryBuilder(
              [
                {
                  avatar: "",
                  biz_status: 1,
                  gender: null,
                  name: "客户B",
                  platform: 5,
                  real_name: "",
                  third_external_userid: "external-b",
                  uid: 9001,
                  update_time: new Date("2026-05-20T10:00:00.000Z"),
                },
                {
                  avatar: "",
                  biz_status: 1,
                  gender: null,
                  name: "跨平台客户",
                  platform: 6,
                  real_name: "",
                  third_external_userid: "external-platform-6",
                  uid: 9001,
                  update_time: new Date("2026-05-21T10:00:00.000Z"),
                },
              ],
              {
                "contact.platform": "platform",
                "contact.uid": "uid",
              },
            );
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const result = await repository.listCustomers({
      platform: 5,
      scope: "all",
      uid: 9001,
    });

    expect(result.items.map((item) => item.thirdExternalUserId)).toEqual(["external-b"]);
    expect(result).toMatchObject({
      hasMore: false,
      items: [
        {
          bizStatus: 1,
          customerKey: "9001:5:external-b",
          relationCount: 0,
          thirdExternalUserId: "external-b",
        },
      ],
      total: 1,
    });
    expect(queries[0]?.table).toBe("xy_wap_embed_contact as contact");
    expect(queries[0]?.query.wheres).not.toContainEqual(["relation.sub_id", "=", 101]);
    expect(queries[0]?.query.wheres.some(([column]) => column === "seat.id")).toBe(false);
  });

  it("paginates all customers from contact rows before hydrating relations", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([
              {
                avatar: "",
                biz_status: 1,
                gender: null,
                name: "客户B",
                platform: 5,
                real_name: "",
                third_external_userid: "external-b",
                uid: 9001,
                update_time: new Date("2026-05-20T10:00:00.000Z"),
              },
              {
                avatar: "",
                biz_status: 1,
                gender: null,
                name: "客户C",
                platform: 5,
                real_name: "",
                third_external_userid: "external-c",
                uid: 9001,
                update_time: new Date("2026-05-19T10:00:00.000Z"),
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([
              {
                add_time: 100,
                biz_status: 1,
                bind_type: 1,
                description: null,
                id: 301,
                platform: 5,
                third_external_userid: "external-b",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: 12,
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const result = await repository.listCustomers({
      limit: 1,
      platform: 5,
      scope: "all",
      uid: 9001,
    });

    expect(result).toMatchObject({
      hasMore: true,
      items: [
        {
          customerKey: "9001:5:external-b",
          relationCount: 1,
          seatRelations: [
            expect.objectContaining({
              seatId: "12",
            }),
          ],
        },
      ],
      nextCursor: expect.any(String),
    });
    expect(queries.map((item) => item.table)).toEqual([
      "xy_wap_embed_contact as contact",
      "xy_wap_embed_customer_bind_relation as bind",
      "xy_wap_embed_user_seat as seat",
    ]);
    expect(queries[0]?.query.joins).toEqual([]);
    expect(queries[0]?.query.wheres).toContainEqual(["contact.uid", "=", 9001]);
    expect(queries[0]?.query.wheres).toContainEqual(["contact.platform", "=", 5]);
    expect(queries[0]?.query.limits).toEqual([2]);
    expect(queries[1]?.query.wheres).toContainEqual([
      "bind.third_external_userid",
      "in",
      ["external-b"],
    ]);
    expect(queries.some((item) => item.table === "xy_wap_embed_conversation as conversation")).toBe(false);
  });

  it("does not hydrate customer recent conversation display while listing customers", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([
              {
                avatar: "",
                biz_status: 1,
                gender: null,
                name: "客户B",
                platform: 5,
                real_name: "",
                third_external_userid: "external-b",
                uid: 9001,
                update_time: new Date("2026-05-20T10:00:00.000Z"),
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listCustomers({
        platform: 5,
        scope: "all",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      items: [
        {
          customerKey: "9001:5:external-b",
        },
      ],
    });
    expect(queries.some((item) => item.table === "xy_wap_embed_conversation as conversation")).toBe(false);
  });

  it("applies all customer cursors to contact pagination", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_contact as contact") {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          if (
            table === "xy_wap_embed_customer_bind_relation as bind" ||
            table === "xy_wap_embed_conversation as conversation"
          ) {
            const query = createQueryBuilder([]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );
    const cursor = Buffer.from(
      JSON.stringify({
        thirdExternalUserId: "external-b",
        updateTime: 1_779_600_000_000,
      }),
      "utf8",
    ).toString("base64url");

    await repository.listCustomers({
      cursor,
      limit: 50,
      platform: 5,
      scope: "all",
      uid: 9001,
    });

    expect(queries[0]?.query.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "contact.update_time", operator: "<", value: new Date(1_779_600_000_000) },
        {
          type: "and",
          expressions: [
            {
              column: "contact.update_time",
              operator: "=",
              value: new Date(1_779_600_000_000),
            },
            {
              column: "contact.third_external_userid",
              operator: "<",
              value: "external-b",
            },
          ],
        },
      ],
    });
  });

  it("loads one tenant-level recent customer conversation on demand", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([
              {
                conversation_id: "9007199254740993",
                last_message_time: 1_779_600_000_000,
                platform: 5,
                third_external_userid: "external-b",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                id: "9007199254740995",
                platform: 5,
                third_avatar: "",
                third_user_name: "销售一号",
                third_userid: "seat-user-12",
                uid: 9001,
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getCustomerLastConversation({
        platform: 5,
        thirdExternalUserId: "external-b",
        uid: 9001,
      }),
    ).resolves.toEqual({
      conversationId: "9007199254740993",
      lastMessageTime: 1_779_600_000_000,
      seatAvatar: "",
      seatId: "9007199254740995",
      seatName: "销售一号",
    });
    expect(queries[0]?.query.wheres).toContainEqual(["conversation.uid", "=", 9001]);
    expect(queries[0]?.query.wheres).toContainEqual(["conversation.platform", "=", 5]);
    expect(queries[0]?.query.wheres).toContainEqual([
      "conversation.third_external_userid",
      "=",
      "external-b",
    ]);
    expect(queries[0]?.query.orderBys).toEqual([
      ["conversation.last_msgtime", "desc"],
      ["conversation.id", "desc"],
    ]);
    expect(queries[0]?.query.limits).toEqual([1]);
    expect(queries[0]?.query.joins).toEqual([]);
    expect(queries[1]?.query.wheres).toContainEqual(["seat.uid", "=", 9001]);
    expect(queries[1]?.query.wheres).toContainEqual(["seat.platform", "=", 5]);
    expect(queries[1]?.query.wheres).toContainEqual([
      "seat.third_userid",
      "in",
      ["seat-user-12"],
    ]);
  });

  it("loads tenant-level relation conversation timestamps on demand", async () => {
    const queries: Array<{ table: string; query: ReturnType<typeof createQueryBuilder> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([
              {
                last_message_time: 1_779_600_000_000,
                third_userid: "seat-user-12",
              },
              {
                last_message_time: 1_779_500_000_000,
                third_userid: "seat-user-13",
              },
            ]);
            queries.push({ table, query });
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listCustomerRelationConversations({
        platform: 5,
        thirdExternalUserId: "external-b",
        thirdUserIds: ["seat-user-12", "seat-user-13"],
        uid: 9001,
      }),
    ).resolves.toEqual([
      {
        lastMessageTime: 1_779_600_000_000,
        thirdUserId: "seat-user-12",
      },
      {
        lastMessageTime: 1_779_500_000_000,
        thirdUserId: "seat-user-13",
      },
    ]);
    expect(queries[0]?.query.joins).toEqual([]);
    expect(queries[0]?.query.wheres).toContainEqual(["conversation.uid", "=", 9001]);
    expect(queries[0]?.query.wheres).toContainEqual(["conversation.platform", "=", 5]);
    expect(queries[0]?.query.wheres).toContainEqual([
      "conversation.third_external_userid",
      "=",
      "external-b",
    ]);
    expect(queries[0]?.query.wheres).toContainEqual([
      "conversation.third_userid",
      "in",
      ["seat-user-12", "seat-user-13"],
    ]);
  });

  it("lists seats by ids with one batched query", async () => {
    const seatQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder([
              {
                avatar: "",
                full_auto_auth: 1,
                full_auto_switch: 1,
                host_sub_id: 101,
                id: 12,
                is_online: 1,
                last_message_time: new Date("2026-05-21T06:15:21.000Z"),
                third_user_name: "德瑞可",
                third_userid: "seat-third-user-1",
                unread_count: 7,
              },
              {
                avatar: "",
                host_sub_id: 202,
                id: 13,
                is_online: 0,
                last_message_time: new Date("2026-05-21T06:16:21.000Z"),
                third_user_name: "念都堂",
                third_userid: "seat-third-user-2",
                unread_count: 2,
              },
            ]);
            seatQueryBuilders.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(repository.getSeatsByIds(["13", "12", "12", "not-a-seat"])).resolves.toEqual([
      {
        seatAIHostingEnabled: true,
        seatAIAssistantEnabled: false,
        avatar: "",
        bizStatus: 1,
        description: "",
        expireTime: undefined,
        seatAIHostingAuth: true,
        fullAutoSwitch: true,
        seatGroupAIHostingEnabled: false,
        seatGroupAIAssistantEnabled: false,
        groupUnreadCount: 0,
        hostSubUserId: "101",
        lastMessageTime: new Date("2026-05-21T06:15:21.000Z").getTime(),
        loginStatus: "online",
        name: "德瑞可",
        operatorName: "德瑞可",
        phone: "",
        semiAutoAuth: false,
        semiAutoSwitch: false,
        seatId: "12",
        singleUnreadCount: 0,
        thirdUserId: "seat-third-user-1",
        unreadCount: 7,
      },
      {
        seatAIHostingEnabled: false,
        seatAIAssistantEnabled: false,
        avatar: "",
        bizStatus: 1,
        description: "",
        expireTime: undefined,
        seatAIHostingAuth: false,
        fullAutoSwitch: false,
        seatGroupAIHostingEnabled: false,
        seatGroupAIAssistantEnabled: false,
        groupUnreadCount: 0,
        hostSubUserId: "202",
        lastMessageTime: new Date("2026-05-21T06:16:21.000Z").getTime(),
        loginStatus: "offline",
        name: "念都堂",
        operatorName: "念都堂",
        phone: "",
        semiAutoAuth: false,
        semiAutoSwitch: false,
        seatId: "13",
        singleUnreadCount: 0,
        thirdUserId: "seat-third-user-2",
        unreadCount: 2,
      },
    ]);
    expect(seatQueryBuilders).toHaveLength(1);
    expect(seatQueryBuilders[0]?.wheres).toContainEqual(["seat.id", "in", ["13", "12"]]);
    expect(seatQueryBuilders[0]?.wheres).not.toContainEqual(["seat.biz_status", "=", 1]);
  });

  it("loads seat operate scope with agent mode auth flags", async () => {
    const queries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat as seat") {
            const query = createQueryBuilder({
              full_auto_auth: 1,
              host_sub_id: 101,
              id: 12,
              platform: 5,
              semi_auto_auth: 0,
              third_userid: "seat-third-user-1",
              uid: 9001,
            });
            queries.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(repository.getSeatOperateScope("12")).resolves.toEqual({
      seatAIHostingAuth: true,
      hostSubUserId: "101",
      platform: 5,
      seatId: "12",
      semiAutoAuth: false,
      thirdUserId: "seat-third-user-1",
      uid: 9001,
    });
    expect(queries[0]?.joinConditions).toContainEqual({
      conditions: [
        ["seat_agent.user_seat_id", "=", "seat.id"],
        ["seat_agent.uid", "=", "seat.uid"],
      ],
      table: "xy_wap_embed_user_seat_agent as seat_agent",
      type: "leftJoin",
    });
    expect(queries[0]?.wheres).toContainEqual(["seat.id", "=", 12]);
  });

  it("filters and limits conversation lists by requested chat mode", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([]);
            conversationQueryBuilders.push(query);

            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listConversations("12", {
      limit: 1000,
      mode: "single",
    });
    await repository.listConversations("12", {
      limit: 100,
      mode: "group",
    });

    expect(conversationQueryBuilders[0].wheres).toContainEqual([
      "conversation.chat_type",
      "=",
      1,
    ]);
    expect(conversationQueryBuilders[0].limits).toEqual([1001]);
    expect(conversationQueryBuilders[1].wheres).toContainEqual([
      "conversation.chat_type",
      "=",
      2,
    ]);
    expect(conversationQueryBuilders[1].limits).toEqual([101]);
  });

  it("keeps the conversation page query free of hydration joins", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([]);
            conversationQueryBuilders.push(query);

            return query;
          }

          return createQueryBuilder([]);
        },
      } as never,
    );

    await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(conversationQueryBuilders[0].joins).toEqual([]);
  });

  it("reuses the loaded seat when returning unread conversation summaries", async () => {
    let seatQueryCount = 0;
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const summaryQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            seatQueryCount += 1;

            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([]);
            conversationQueryBuilders.push(query);

            return query;
          }

          if (table === "xy_wap_embed_conversation") {
            const query = createQueryBuilder({
              group_unread_count: 2,
              single_unread_count: 3,
              total_unread_count: 5,
            });
            summaryQueryBuilders.push(query);

            return query;
          }

          return createQueryBuilder([]);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
      unreadOnly: true,
    });

    expect(seatQueryCount).toBe(1);
    expect(conversationQueryBuilders[0].wheres).toContainEqual([
      "conversation.unread_cnt",
      ">",
      0,
    ]);
    expect(summaryQueryBuilders[0].wheres).toEqual([
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["third_userid", "=", "seat-user-001"],
      ["biz_status", "=", 1],
    ]);
    expect(page.unreadSummary).toEqual({
      group: 2,
      single: 3,
      total: 5,
    });
  });

  it("does not snapshot-filter the initial conversation list by last message time", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([
              createConversationRow({
                chat_type: 2,
                id: 165,
                last_msgtime: null,
                third_external_userid: "",
                third_group_id: "group-001",
                unread_cnt: 4,
              }),
            ]);
            conversationQueryBuilders.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "group",
    });

    expect(conversationQueryBuilders[0].selections).toContain(
      "conversation.reply as reply",
    );
    expect(page.items).toEqual([
      expect.objectContaining({
        conversationId: "165",
        mode: "group",
        unreadCount: 4,
      }),
    ]);
  });

  it("applies stable cursor ordering and keyset bounds to conversation lists", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([]);
            conversationQueryBuilders.push(query);

            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listConversations("12", {
      cursor: {
        id: "88",
        lastMsgTime: 1_778_839_800_000,
        snapshotAt: 1_778_840_000_000,
      },
      limit: 30,
      mode: "single",
    });

    const query = conversationQueryBuilders[0];

    expect(query.orderBys).toEqual([
      ["conversation.last_msgtime", "desc"],
      ["conversation.id", "desc"],
    ]);
    expect(query.wheres).toContainEqual([
      "conversation.last_msgtime",
      "<=",
      1_778_840_000_000,
    ]);
    expect(query.whereExpressions).toEqual([
      {
        type: "or",
        expressions: [
          {
            column: "conversation.last_msgtime",
            operator: "<",
            value: 1_778_839_800_000,
          },
          {
            type: "and",
            expressions: [
              {
                column: "conversation.last_msgtime",
                operator: "=",
                value: 1_778_839_800_000,
              },
              {
                column: "conversation.id",
                operator: "<",
                value: "88",
              },
            ],
          },
        ],
      },
    ]);
  });

  it("does not filter cursor pages by pinned state", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([
              createConversationRow({
                id: 72,
                last_msgtime: 1_778_839_700_000,
                pinned_time: 1_778_839_950,
              }),
            ]);
            conversationQueryBuilders.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      cursor: {
        id: "88",
        lastMsgTime: 1_778_839_800_000,
        snapshotAt: 1_778_840_000_000,
      },
      limit: 30,
      mode: "single",
    });
    const query = conversationQueryBuilders[0];

    expect(query.wheres).not.toContainEqual([
      "conversation.pinned_time",
      "=",
      0,
    ]);
    expect(query.whereExpressions).toEqual([
      {
        type: "or",
        expressions: [
          {
            column: "conversation.last_msgtime",
            operator: "<",
            value: 1_778_839_800_000,
          },
          {
            type: "and",
            expressions: [
              {
                column: "conversation.last_msgtime",
                operator: "=",
                value: 1_778_839_800_000,
              },
              {
                column: "conversation.id",
                operator: "<",
                value: "88",
              },
            ],
          },
        ],
      },
    ]);
    expect(page.items).toEqual([
      expect.objectContaining({
        conversationId: "72",
        isPinned: true,
      }),
    ]);
  });

  it("returns a next cursor from the last visible conversation when more rows exist", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_778_840_000_000);
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 90,
                last_audit_info_id: 900,
                last_msgtime: 1_778_839_900_000,
                pinned_time: 1_778_839_950,
              }),
              createConversationRow({
                id: 88,
                last_audit_info_id: 880,
                last_msgtime: 1_778_839_800_000,
                pinned_time: 0,
              }),
              createConversationRow({
                id: 72,
                last_audit_info_id: 720,
                last_msgtime: 1_778_839_700_000,
                pinned_time: 0,
              }),
            ]);
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 2,
      mode: "single",
    });

    expect(page).toMatchObject({
      hasMore: true,
      items: [
        { conversationId: "90" },
        { conversationId: "88" },
      ],
      snapshotAt: 1_778_840_000_000,
    });
    expect(page.nextCursor).toBeDefined();
    expect(decodeConversationListCursor(page.nextCursor ?? "")).toEqual({
      id: "88",
      lastMsgTime: 1_778_839_800_000,
      snapshotAt: 1_778_840_000_000,
    });

    nowSpy.mockRestore();
  });

  it("hydrates conversation list display fields with independent page-scoped queries", async () => {
    const observedTables: string[] = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                last_audit_info_id: 538,
                third_external_userid: "external-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_msg_audit_info") {
            return createQueryBuilder({
              id: 538,
              content: "hello",
              msgtype: "text",
            });
          }

          if (table === "xy_wap_embed_contact") {
            return createQueryBuilder({
              avatar: "https://example.com/avatar.png",
              name: "客户名",
              real_name: "客户实名",
              third_external_userid: "external-001",
            });
          }

          if (table === "xy_wap_embed_customer_bind_relation") {
            return createQueryBuilder({
              remark: "客户备注",
              third_external_userid: "external-001",
            });
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(observedTables).toEqual([
      "xy_wap_embed_user_seat",
      "xy_wap_embed_conversation as conversation",
      "xy_wap_embed_msg_audit_info",
      "xy_wap_embed_contact",
      "xy_wap_embed_customer_bind_relation",
    ]);
    expect(page.items[0]).toMatchObject({
      conversationId: "88",
      customerAvatar: "https://example.com/avatar.png",
      customerName: "客户备注",
      contactOriginalName: "微信昵称：客户名",
      lastMessage: "hello",
    });
  });

  it("keeps single chat conversations sendable regardless of contact biz status", async () => {
    const observedContactQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_contact") {
            const query = createQueryBuilder({
              avatar: "https://example.com/inactive-contact.png",
              biz_status: 0,
              name: "失效客户",
              real_name: "失效客户实名",
              third_external_userid: "external-001",
            });
            observedContactQueries.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(observedContactQueries[0]?.wheres).not.toContainEqual([
      "biz_status",
      "=",
      1,
    ]);
    expect(page.items[0]).toMatchObject({
      bizStatus: 1,
      conversationId: "88",
      customerAvatar: "https://example.com/inactive-contact.png",
      customerName: "失效客户",
    });
  });

  it("falls back to contact name when bind remark is missing", async () => {
    const observedTables: string[] = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_contact") {
            return createQueryBuilder({
              avatar: "https://example.com/avatar.png",
              biz_status: 1,
              name: "客户名",
              real_name: "客户实名",
              third_external_userid: "external-001",
            });
          }

          if (table === "xy_wap_embed_customer_bind_relation") {
            return createQueryBuilder([]);
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(observedTables).toContain("xy_wap_embed_customer_bind_relation");
    expect(page.items[0]).toMatchObject({
      bizStatus: 1,
      conversationId: "88",
      customerName: "客户名",
      contactOriginalName: undefined,
    });
  });

  it("keeps inactive bind remarks for conversation display names", async () => {
    let bindQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_contact") {
            return createQueryBuilder({
              avatar: "https://example.com/avatar.png",
              biz_status: 1,
              name: "客户名",
              real_name: "客户实名",
              third_external_userid: "external-001",
            });
          }

          if (table === "xy_wap_embed_customer_bind_relation") {
            bindQuery = createQueryBuilder({
              bind_type: 1,
              biz_status: 0,
              remark: "失效绑定备注",
              third_external_userid: "external-001",
            });

            return bindQuery;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(bindQuery?.wheres).not.toContainEqual(["biz_status", "=", 1]);
    expect(page.items[0]).toMatchObject({
      customerBindType: 1,
      customerName: "失效绑定备注",
    });
  });

  it("falls back across empty conversation display names", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
              }),
              createConversationRow({
                id: 89,
                third_external_userid: "external-002",
              }),
            ]);
          }

          if (table === "xy_wap_embed_contact") {
            return createQueryBuilder([
              {
                avatar: "https://example.com/avatar-1.png",
                biz_status: 1,
                name: "客户名一",
                real_name: "",
                third_external_userid: "external-001",
              },
              {
                avatar: "https://example.com/avatar-2.png",
                biz_status: 1,
                name: "",
                real_name: "",
                third_external_userid: "external-002",
              },
            ]);
          }

          if (table === "xy_wap_embed_customer_bind_relation") {
            return createQueryBuilder([
              {
                remark: "",
                third_external_userid: "external-001",
              },
              {
                remark: "",
                third_external_userid: "external-002",
              },
            ]);
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "single",
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        conversationId: "88",
        customerName: "客户名一",
        contactOriginalName: undefined,
      }),
      expect.objectContaining({
        conversationId: "89",
        customerName: "未知客户",
        contactOriginalName: undefined,
      }),
    ]);
  });

  it("hydrates inactive group conversations and exposes group seat biz status", async () => {
    const observedGroupSeatQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                chat_type: 2,
                id: 89,
                third_external_userid: "",
                third_group_id: "group-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_group_seat") {
            const query = createQueryBuilder({
              avatar: "https://example.com/inactive-group.png",
              biz_status: 0,
              name: "失效群聊",
              third_group_id: "group-001",
              third_userid: "seat-user-001",
            });
            observedGroupSeatQueries.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "group",
    });

    expect(observedGroupSeatQueries[0]?.wheres).not.toContainEqual([
      "biz_status",
      "=",
      1,
    ]);
    expect(page.items[0]).toMatchObject({
      bizStatus: 0,
      conversationId: "89",
      customerAvatar: "https://example.com/inactive-group.png",
      customerName: "失效群聊",
    });
  });

  it("hydrates shadow group conversations from the opening seat group profile", async () => {
    const observedGroupSeatQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "reception-seat-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                chat_type: 2,
                id: 90,
                third_external_userid: "",
                third_group_id: "group-001",
                third_group_origin_userid: "opening-seat-001",
                third_userid: "reception-seat-001",
              }),
            ]);
          }

          if (table === "xy_wap_embed_group_seat") {
            const query = createQueryBuilder({
              avatar: "https://example.com/opening-group.png",
              biz_status: 1,
              name: "开通号群聊",
              remark: "开通号备注",
              third_group_id: "group-001",
              third_userid: "opening-seat-001",
            });
            observedGroupSeatQueries.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
      mode: "group",
    });

    expect(observedGroupSeatQueries[0]?.wheres).toContainEqual([
      "third_userid",
      "in",
      ["opening-seat-001"],
    ]);
    expect(page.items[0]).toMatchObject({
      conversationId: "90",
      customerAvatar: "https://example.com/opening-group.png",
      customerName: "开通号备注",
      mode: "group",
    });
  });

  it("defaults conversation biz status to inactive when display metadata is missing", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 88,
                third_external_userid: "missing-external-001",
              }),
              createConversationRow({
                chat_type: 2,
                id: 89,
                third_external_userid: "",
                third_group_id: "missing-group-001",
              }),
            ]);
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 30,
    });

    expect(page.items).toEqual([
      expect.objectContaining({
        bizStatus: 1,
        conversationId: "88",
        customerName: "未知客户",
      }),
      expect.objectContaining({
        bizStatus: 0,
        conversationId: "89",
        customerName: "未知群聊",
      }),
    ]);
  });

  it("hydrates last messages and cursors without losing bigint id precision", async () => {
    const observedAuditInfoQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: "9007199254740993",
                last_audit_info_id: "9007199254740995",
                third_external_userid: "external-001",
              }),
              createConversationRow({
                id: "9007199254740992",
                last_audit_info_id: "9007199254740996",
                third_external_userid: "external-002",
              }),
            ]);
          }

          if (table === "xy_wap_embed_msg_audit_info") {
            const query = createQueryBuilder({
              id: "9007199254740995",
              content: "bigint message",
              msgtype: "text",
            });
            observedAuditInfoQueries.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const page = await repository.listConversations("12", {
      limit: 1,
      mode: "single",
    });

    expect(observedAuditInfoQueries[0].wheres).toContainEqual([
      "id",
      "in",
      ["9007199254740995"],
    ]);
    expect(page.items[0]).toMatchObject({
      conversationId: "9007199254740993",
      lastMessage: "bigint message",
    });
    expect(decodeConversationListCursor(page.nextCursor ?? "")).toEqual({
      id: "9007199254740993",
      lastMsgTime: 1_778_839_800_000,
      snapshotAt: expect.any(Number),
    });
  });

  it("lists changed conversations by last message time without hydration joins", async () => {
    const conversationQueryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder([
              createConversationRow({
                id: 90,
                last_audit_info_id: 900,
                last_message_content: undefined,
                last_msgtime: 1_778_840_100_000,
              }),
            ]);
            conversationQueryBuilders.push(query);

            return query;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.listChangedConversations("12", {
      limit: 30,
      sinceLastMsgTime: 1_778_840_000_000,
    });

    const query = conversationQueryBuilders[0];

    expect(query.joins).toEqual([]);
    expect(query.selections).toContain("conversation.reply as reply");
    expect(query.orderBys).toEqual([
      ["conversation.last_msgtime", "asc"],
      ["conversation.id", "asc"],
    ]);
    expect(query.limits).toEqual([31]);
    expect(query.wheres).toContainEqual([
      "conversation.last_msgtime",
      ">",
      1_778_840_000_000,
    ]);
    expect(query.wheres).toContainEqual(["conversation.biz_status", "=", 1]);
  });

  it("lists messages by seqs in the conversation tenant scope", async () => {
    const messageRows = [
      createConversationMessageRow({
        id: 829,
        msgid: "remote-msg-829",
        msgtime: 1_778_840_010_000,
        third_external_id: "external-1",
        third_from_id: "external-1",
        third_user_id: "seat-user-001",
      }),
    ];
    const repository = new WorkbenchRepository(
      createMessagesBySeqsDb(messageRows) as never,
    );

    await expect(
      repository.listMessagesBySeqs("88", [829, 829, 0, Number.NaN]),
    ).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          msgid: "remote-msg-829",
          senderAvatar: "",
          senderName: "external-1",
          seq: 829,
        }),
      ],
    });
  });

  it("scopes message seq lookup to the single conversation key", async () => {
    const db = createMessagesBySeqsDb([
      createConversationMessageRow({
        id: 829,
        msgid: "remote-msg-829",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await repository.listMessagesBySeqs("88", [829]);

    expect(db.messageQueries[0]?.wheres).toContainEqual(["message.uid", "=", 9001]);
    expect(db.messageQueries[0]?.wheres).toContainEqual(["message.platform", "=", 5]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "seat-third-user-1",
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_external_id",
      "=",
      "external-1",
    ]);
  });

  it("scopes message seq lookup to the group conversation key", async () => {
    const db = createMessagesBySeqsDb(
      [
        createConversationMessageRow({
          chat_type: 2,
          conversation_external_id: "",
          conversation_group_id: "group-1",
          id: 829,
          msgid: "remote-msg-829",
          third_external_id: null,
          third_group_id: "group-1",
        }),
      ],
      [],
      {
        chat_type: 2,
        conversation_external_id: "",
        conversation_group_id: "group-1",
      },
    );
    const repository = new WorkbenchRepository(db as never);

    await repository.listMessagesBySeqs("88", [829]);

    expect(db.messageQueries[0]?.wheres).toContainEqual(["message.uid", "=", 9001]);
    expect(db.messageQueries[0]?.wheres).toContainEqual(["message.platform", "=", 5]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "seat-third-user-1",
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_group_id",
      "=",
      "group-1",
    ]);
  });

  it("hydrates quote previews when fetching messages by seqs", async () => {
    const db = createMessagesBySeqsDb(
      [
        createConversationMessageRow({
          content: JSON.stringify({
            content: "正式引用消息",
            quoteMsgId: 101,
          }),
          id: 102,
          msgid: "remote-msg-102",
          msgtype: "quote",
        }),
      ],
      [
        createConversationMessageRow({
          content: JSON.stringify({ text: "测试被引用" }),
          id: 101,
          msgid: "remote-msg-101",
          msgtype: "text",
          third_user_id: "seat-third-user-1",
        }),
      ],
    );
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessagesBySeqs("88", [102])).resolves.toMatchObject({
      messages: [
        {
          content: {
            quotedMessage: {
              contentType: "text",
              senderName: "external-1",
              text: "测试被引用",
            },
            quoteMsgId: "101",
            text: "正式引用消息",
          },
          contentType: "quote",
          msgid: "remote-msg-102",
        },
      ],
    });
    expect(db.messageQueries).toHaveLength(2);
  });

  it("loads chat record details by parent audit id in the conversation tenant scope", async () => {
    const db = createChatRecordDetailDb({
      parentRow: createConversationMessageRow({
        content: JSON.stringify({
          msgContent: ["范双飞：123"],
          msgTitle: "缪勇飞和范双飞的聊天记录",
        }),
        id: 830,
        msgid: "parent-chatrecord-msgid",
        msgtype: "chatrecord",
      }),
      detailRows: [
        {
          avatar: "https://cdn.example.com/avatar.png",
          content: JSON.stringify({ text: "第一条详情" }),
          corp_short_name: "",
          id: 18,
          msgid: "parent-chatrecord-msgid",
          msg_info_id: 830,
          msgtime: 1_778_840_020_000,
          msgtype: "text",
          name: "范双飞",
          opt_ser_no: null,
          origin_content: null,
          origin_msgtype: "text",
          platform: 5,
          status: 0,
          uid: 9001,
        },
      ],
    });
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.getChatRecordDetail(9001, 5, "88", 830),
    ).resolves.toMatchObject({
      messageSeq: 830,
      messages: [
        {
          content: { text: "第一条详情" },
          contentType: "text",
          msgid: "chatrecord:830:18",
          senderAvatar: "https://cdn.example.com/avatar.png",
          senderName: "范双飞",
          seq: 18,
          status: "sent",
        },
      ],
    });

    expect(db.queries[0]?.wheres).toContainEqual(["conversation.uid", "=", 9001]);
    expect(db.queries[0]?.wheres).toContainEqual(["conversation.platform", "=", 5]);
    expect(db.queries[0]?.wheres).toContainEqual(["conversation.id", "=", 88]);
    expect(db.queries[1]?.wheres).toContainEqual([
      "message.id",
      "=",
      830,
    ]);
    expect(db.queries[1]?.wheres).not.toContainEqual([
      "message.msgid",
      "=",
      "parent-chatrecord-msgid",
    ]);
    expect(db.queries[1]?.wheres).toContainEqual(["message.uid", "=", 9001]);
    expect(db.queries[1]?.wheres).toContainEqual(["message.platform", "=", 5]);
    expect(db.queries[1]?.wheres).toContainEqual([
      "message.third_external_id",
      "=",
      "external-1",
    ]);
    expect(db.queries[2]?.wheres).toContainEqual([
      "record.msg_info_id",
      "=",
      830,
    ]);
    expect(db.queries[2]?.wheres).not.toContainEqual([
      "record.msgid",
      "=",
      "parent-chatrecord-msgid",
    ]);
    expect(db.queries[2]?.wheres).toContainEqual(["record.uid", "=", 9001]);
    expect(db.queries[2]?.wheres).toContainEqual(["record.platform", "=", 5]);
    expect(db.queries[2]?.orderBys).toEqual([
      ["record.msgtime", "asc"],
      ["record.id", "asc"],
    ]);
  });

  it("skips changed conversation hydration when the poll change limit is exceeded", async () => {
    const observedTables: string[] = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder([
              createConversationRow({
                id: 90,
                last_audit_info_id: 900,
                last_msgtime: 1_778_840_100_000,
              }),
              createConversationRow({
                id: 91,
                last_audit_info_id: 901,
                last_msgtime: 1_778_840_101_000,
              }),
            ]);
          }

          throw new Error(`unexpected hydration table ${table}`);
        },
      } as never,
    );

    const result = await repository.listChangedConversations("12", {
      limit: 1,
      sinceLastMsgTime: 1_778_840_000_000,
    });

    expect(result).toMatchObject({
      hasMore: true,
      items: [],
      nextVersion: expect.any(Number),
    });
    expect(observedTables).toEqual([
      "xy_wap_embed_user_seat",
      "xy_wap_embed_conversation as conversation",
    ]);
  });

  it("does not update pinned state when the conversation id is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.updateConversationPinned({
        conversationId: "not-a-conversation",
        isPinned: true,
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not update seat host when the seat or sub-user id is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(
      repository.updateSeatHostSubUser({
        platform: 5,
        seatId: "not-a-seat",
        subUserId: "101",
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.updateSeatHostSubUser({
        platform: 5,
        seatId: "12",
        subUserId: "not-a-sub-user",
        uid: 9001,
      }),
    ).resolves.toBeUndefined();
  });

  it("updates seat host sub-user in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_user_seat");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateSeatHostSubUser({
      platform: 5,
      seatId: "12",
      subUserId: "101",
      uid: 9001,
    });

    expect(updates).toEqual([{ host_sub_id: 101 }]);
    expect(wheres).toEqual([
      ["id", "=", 12],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
  });

  it("updates both seat agent switches in a single tenant-scoped write", async () => {
    const updates: Array<{
      table: string;
      values?: Record<string, unknown>;
      wheres: Array<[string, string, unknown]>;
    }> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          const wheres: Array<[string, string, unknown]> = [];
          const update = { table, values: undefined, wheres } as {
            table: string;
            values?: Record<string, unknown>;
            wheres: Array<[string, string, unknown]>;
          };
          updates.push(update);

          return {
            set(values: Record<string, unknown>) {
              update.values = values;
              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);
              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_user_seat_agent");
          return createQueryBuilder({
            full_auto_switch: 1,
            semi_auto_switch: 1,
          });
        },
      } as never,
    );

    await expect(
      repository.updateSeatAgentModeSwitch({
        mode: "autoReply",
        platform: 5,
        seatId: "12",
        uid: 9001,
      }),
    ).resolves.toEqual({
      fullAutoSwitch: true,
      seatId: "12",
      semiAutoSwitch: true,
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      table: "xy_wap_embed_user_seat_agent",
      values: {
        full_auto_switch: 1,
        semi_auto_switch: 1,
      },
      wheres: [
        ["uid", "=", 9001],
        ["user_seat_id", "=", 12],
      ],
    });
  });

  it("lists user-seat update events by tenant scope without parsing event content", async () => {
    const broadcastQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_broadcast_event as event") {
            const query = createQueryBuilder([
              {
                category_bind_id: "12",
                create_time: new Date("2026-05-21T06:15:21.000Z"),
              },
            ]);
            broadcastQueries.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.listSeatUpdateEvents({
        afterCreateTime: 1_778_840_000_000,
        limit: 20,
        platform: 5,
        seatIds: ["12", "13"],
        uid: 272,
      }),
    ).resolves.toEqual([
      {
        eventTime: new Date("2026-05-21T06:15:21.000Z").getTime(),
        seatId: "12",
      },
    ]);
    expect(broadcastQueries[0]?.wheres).toEqual([
      ["event.uid", "=", 272],
      ["event.platform", "=", 5],
      ["event.category", "=", "user-seat"],
      ["event.category_bind_id", "in", ["12", "13"]],
      ["event.event", "=", "user-seat.update"],
      ["event.create_time", ">", new Date(1_778_840_000_000)],
    ]);
  });

  it("reads active seat event scope from sub-user seat relations", async () => {
    const relationQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_sub_user") {
            return createQueryBuilder({
              platform: 5,
              uid: 272,
            });
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const query = createQueryBuilder([
              {
                platform: 5,
                seat_id: 12,
                uid: 272,
              },
              {
                platform: 5,
                seat_id: 13,
                uid: 272,
              },
            ]);
            relationQueries.push(query);

            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getSeatEventScope({
        platform: 5,
        subUserId: "101",
        uid: 272,
      } as never),
    ).resolves.toEqual({
      platform: 5,
      seatIds: ["12", "13"],
      uid: 272,
    });
    expect(relationQueries[0]?.joins).toEqual(["innerJoin"]);
    expect(relationQueries[0]?.wheres).toEqual([
      ["relation.sub_id", "=", 101],
      ["relation.uid", "=", 272],
      ["relation.platform", "=", 5],
    ]);
    expect(relationQueries[0]?.joinConditions).toEqual([
      {
        conditions: [
          ["seat.id", "=", "relation.user_seat_id"],
          ["seat.uid", "=", "relation.uid"],
          ["seat.platform", "=", "relation.platform"],
        ],
        table: "xy_wap_embed_user_seat as seat",
        type: "innerJoin",
      },
    ]);
  });

  it("returns conversation tenant scope and takeover sub-user for Java write operations", async () => {
    const queryBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
    const observedTables: string[] = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          observedTables.push(table);

          if (table === "xy_wap_embed_conversation as conversation") {
            const query = createQueryBuilder({
              chat_type: 1,
              id: 88,
              platform: 5,
              seat_id: 12,
              seat_host_sub_id: 101,
              third_external_userid: "external-001",
              third_group_id: null,
              third_group_origin_userid: "should-not-affect-single-chat",
              third_userid: "seat-user-001",
              uid: 9001,
            });
            queryBuilders.push(query);
            return query;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(repository.getConversationLookup("88")).resolves.toEqual({
      chatType: 1,
      id: "88",
      isShadowGroup: false,
      messageSourceThirdUserId: "seat-user-001",
      platform: 5,
      seatHostSubUserId: "101",
      seatId: "12",
      seatUnreadCount: 6,
      thirdExternalUserId: "external-001",
      thirdGroupId: undefined,
      thirdGroupName: undefined,
      thirdUserId: "seat-user-001",
      uid: 9001,
      unreadCount: 0,
    });
    expect(observedTables).toEqual(["xy_wap_embed_conversation as conversation"]);
    expect(queryBuilders.flatMap((query) => query.joins)).toEqual([
      "innerJoin",
      "leftJoin",
    ]);
    expect(queryBuilders[0]?.wheres).not.toContainEqual([
      "conversation.biz_status",
      "=",
      1,
    ]);
  });

  it("filters conversation lookup by active status when explicitly requested", async () => {
    let conversationQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_conversation as conversation") {
            conversationQuery = createQueryBuilder({
              id: 88,
              platform: 5,
              seat_id: 12,
              seat_host_sub_id: 101,
              third_external_userid: "external-001",
              third_group_id: null,
              third_userid: "seat-user-001",
              uid: 9001,
            });
            return conversationQuery;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getConversationLookup("88", { activeOnly: true }),
    ).resolves.toMatchObject({
      id: "88",
      seatId: "12",
    });
    expect(conversationQuery?.wheres).toContainEqual([
      "conversation.biz_status",
      "=",
      1,
    ]);
  });

  it("loads conversation full-auto capability in seat and active binding scope", async () => {
    let capabilityQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_user_seat as seat");
          capabilityQuery = createQueryBuilder({
            customer_bind_type: 1,
            full_auto_auth: 1,
            full_auto_switch: 1,
            group_full_auto_auth: 0,
          });
          return capabilityQuery;
        },
      } as never,
    );

    await expect(
      repository.getConversationFullAutoCapability({
        platform: 5,
        seatId: "12",
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      customerBindType: 1,
      seatGroupAIHostingEnabled: false,
      seatFullAutoAuth: true,
      seatFullAutoSwitch: true,
    });
    expect(capabilityQuery?.wheres).toEqual([
      ["seat.id", "=", 12],
      ["seat.uid", "=", 9001],
      ["seat.platform", "=", 5],
      ["seat.third_userid", "=", "seat-user-001"],
    ]);
    expect(capabilityQuery?.joinConditions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conditions: expect.arrayContaining([
            ["bind.third_external_userid", "=", "external-001"],
            ["bind.biz_status", "=", 1],
          ]),
          table: "xy_wap_embed_customer_bind_relation as bind",
          type: "leftJoin",
        }),
      ]),
    );
  });

  it("returns group name from group seat lookup for sidebar iframe params", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          return createQueryBuilder({
            chat_type: 2,
            group_name: "原始群名",
            group_remark: "备注群名",
            id: 99,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 3,
            third_external_userid: null,
            third_group_id: "group-001",
            third_group_origin_userid: "opening-seat-001",
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 1,
          });
        },
      } as never,
    );

    await expect(repository.getConversationLookup("99")).resolves.toEqual({
      chatType: 2,
      id: "99",
      isShadowGroup: true,
      messageSourceThirdUserId: "opening-seat-001",
      platform: 5,
      seatHostSubUserId: "101",
      seatId: "12",
      seatUnreadCount: 6,
      thirdExternalUserId: undefined,
      thirdGroupId: "group-001",
      thirdGroupName: "备注群名",
      thirdUserId: "seat-user-001",
      uid: 9001,
      unreadCount: 1,
    });
  });

  it("marks opening and reception accounts in shadow group members", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_conversation as conversation") {
            return createQueryBuilder({
              conversation_id: 99,
              group_seat_id: 1001,
              platform: 5,
              third_group_id: "group-001",
              third_group_origin_userid: " opening-seat-001 ",
              third_userid: " reception-seat-001 ",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_group_member as member") {
            return createQueryBuilder([
              {
                avatar_url: "https://example.com/opening.png",
                name: "开通成员",
                nickname: null,
                third_user_id: " opening-seat-001 ",
                type: 2,
              },
              {
                avatar_url: "https://example.com/reception.png",
                name: "接待成员",
                nickname: null,
                third_user_id: " reception-seat-001 ",
                type: 1,
              },
              {
                avatar_url: "",
                name: "普通成员",
                nickname: null,
                third_user_id: "member-001",
                type: 0,
              },
            ]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(repository.listGroupMembers("99")).resolves.toMatchObject({
      items: [
        {
          displayName: "开通成员",
          isOpeningAccount: true,
          thirdUserId: " opening-seat-001 ",
        },
        {
          displayName: "接待成员",
          isReceptionAccount: true,
          thirdUserId: " reception-seat-001 ",
        },
        {
          displayName: "普通成员",
          thirdUserId: "member-001",
        },
      ],
    });
  });

  it("falls back to unknown group when group seat name is missing", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          return createQueryBuilder({
            group_name: null,
            group_remark: null,
            id: 100,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 6,
            third_external_userid: null,
            third_group_id: "group-002",
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 1,
          });
        },
      } as never,
    );

    await expect(repository.getConversationLookup("100")).resolves.toMatchObject({
      thirdGroupId: "group-002",
      thirdGroupName: "未知群聊",
    });
  });

  it("loads the latest full-auto answer status for a single conversation", async () => {
    let answerRecordQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_agent_answer_record");

          answerRecordQuery = createQueryBuilder({
            analyse_msg_id: 20,
            create_time: new Date("2026-06-26T08:00:00.000Z"),
            gen_status: 1,
            id: 27,
            send_status: 0,
            update_time: new Date("2026-06-26T08:00:02.000Z"),
          });
          return answerRecordQuery;
        },
      } as never,
    );

    await expect(
      repository.getLatestFullAutoAnswerStatus({
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      analyseMsgId: "20",
      createdAt: Date.parse("2026-06-26T08:00:00.000Z"),
      genStatus: 1,
      recordId: "27",
      sendStatus: 0,
      updatedAt: Date.parse("2026-06-26T08:00:02.000Z"),
    });
    expect(answerRecordQuery?.wheres).toEqual([
      ["uid", "=", 9001],
      ["third_userid", "=", "seat-user-001"],
      ["third_external_userid", "=", "external-001"],
      ["third_group_id", "=", ""],
      ["trigger_type", "=", 1],
    ]);
    expect(answerRecordQuery?.orderBys).toEqual([["id", "desc"]]);
    expect(answerRecordQuery?.limits).toEqual([1]);
  });

  it("normalizes nullable full-auto answer analyse message ids to an empty string", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_agent_answer_record");

          return createQueryBuilder({
            analyse_msg_id: null,
            create_time: new Date("2026-06-26T08:00:00.000Z"),
            gen_status: 0,
            id: 27,
            send_status: 0,
            update_time: new Date("2026-06-26T08:00:02.000Z"),
          });
        },
      } as never,
    );

    await expect(
      repository.getLatestFullAutoAnswerStatus({
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      analyseMsgId: "",
    });
  });

  it("reads message file transfer status by audit id in tenant scope", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info");
          const query = createQueryBuilder({
            content: JSON.stringify({
              downloadStatus: "finished",
              fileSerialNo: "serial-file-001",
              fileUrlExpireTime: 1778919538036,
              fileUrl: "chat-files/quote.pdf",
            }),
          });
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.getMessageFileDownloadStatus({
        auditId: 321,
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toEqual({
      downloadStatus: "finished",
      fileSerialNo: "serial-file-001",
      fileUrlExpireTime: 1778919538036,
      fileUrl: "https://b5.bokr.com.cn/chat-files/quote.pdf",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info",
      wheres: [
        ["id", "=", 321],
        ["uid", "=", 9001],
        ["platform", "=", 5],
      ],
    });
  });

  it("reads message raw content within the single conversation key", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info");
          const query = createQueryBuilder({
            content: JSON.stringify({
              fileUrl: "s5/msg/20260525/272/voice.amr",
            }),
          });
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.getMessageRawContent({
        auditId: 538,
        messageSourceThirdUserId: "seat-user-001",
        platform: 5,
        thirdExternalUserId: "external-001",
        uid: 9001,
      }),
    ).resolves.toBe(JSON.stringify({
      fileUrl: "s5/msg/20260525/272/voice.amr",
    }));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info",
      wheres: [
        ["id", "=", 538],
        ["uid", "=", 9001],
        ["platform", "=", 5],
        ["third_user_id", "=", "seat-user-001"],
        ["third_external_id", "=", "external-001"],
      ],
    });
  });

  it("reads shadow group message raw content from the opening-seat partition", async () => {
    const query = createQueryBuilder({ content: JSON.stringify({ fileUrl: "voice.amr" }) });
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info");
          return query;
        },
      } as never,
    );

    await repository.getMessageRawContent({
      auditId: 539,
      messageSourceThirdUserId: "opening-seat-001",
      platform: 5,
      thirdGroupId: "group-001",
      uid: 9001,
    });

    expect(query.wheres).toContainEqual(["third_user_id", "=", "opening-seat-001"]);
    expect(query.wheres).toContainEqual(["third_group_id", "=", "group-001"]);
  });

  it("finds retry message opt no only within the failed conversation message scope", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info as message");
          const query = createQueryBuilder({
            chat_type: 2,
            from_type: null,
            id: 538,
            opt_no: "failed-opt-538",
            third_from_id: "seat-user-001",
            third_user_id: "seat-user-001",
          });
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.findRetryMessage({
        conversationId: "conv-001",
        messageSourceThirdUserId: "seat-user-001",
        messageSeq: 538,
        platform: 5,
        receptionThirdUserId: "seat-user-001",
        thirdGroupId: "group-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      id: 538,
      optNo: "failed-opt-538",
      senderType: "agent",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info as message",
      wheres: [
        ["message.uid", "=", 9001],
        ["message.platform", "=", 5],
        ["message.third_user_id", "=", "seat-user-001"],
        ["message.id", "=", 538],
        ["message.status", "=", 0],
        ["message.third_group_id", "=", "group-001"],
      ],
    });
  });

  it("maps retry message sender from platform sender fields", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info as message");
          return createQueryBuilder({
            chat_type: 2,
            from_type: null,
            id: 539,
            opt_no: "failed-opt-539",
            third_from_id: "customer-member-001",
            third_user_id: "seat-user-001",
          });
        },
      } as never,
    );

    await expect(
      repository.findRetryMessage({
        conversationId: "conv-001",
        messageSourceThirdUserId: "seat-user-001",
        messageSeq: 539,
        platform: 5,
        receptionThirdUserId: "seat-user-001",
        thirdGroupId: "group-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      id: 539,
      optNo: "failed-opt-539",
      senderType: "customer",
    });
  });

  it("finds shadow group retry messages in the opening-seat partition and owns them by reception seat", async () => {
    const queries: Array<{ wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info as message");
          const query = createQueryBuilder({
            chat_type: 2,
            from_type: null,
            id: 540,
            opt_no: "failed-opt-540",
            third_from_id: "reception-seat-001",
            third_user_id: "opening-seat-001",
          });
          queries.push({ wheres: query.wheres });
          return query;
        },
      } as never,
    );

    await expect(
      repository.findRetryMessage({
        conversationId: "conv-shadow",
        messageSourceThirdUserId: "opening-seat-001",
        messageSeq: 540,
        platform: 5,
        receptionThirdUserId: "reception-seat-001",
        thirdGroupId: "group-001",
        uid: 9001,
      }),
    ).resolves.toEqual({
      id: 540,
      optNo: "failed-opt-540",
      senderType: "agent",
    });
    expect(queries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "opening-seat-001",
    ]);
  });

  it("finds async operation opt params in tenant and platform scope", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_async_operation");
          const query = createQueryBuilder({
            opt_params: JSON.stringify({
              msgData: {
                msgtype: "text",
                text: "hello",
              },
            }),
          });
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.findAsyncOperationByOptNo({
        optNo: "failed-opt-538",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toEqual({
      optParams: JSON.stringify({
        msgData: {
          msgtype: "text",
          text: "hello",
        },
      }),
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_async_operation",
      wheres: [
        ["opt_no", "=", "failed-opt-538"],
        ["uid", "=", 9001],
        ["platform", "=", 5],
      ],
    });
  });

  it("updates conversation pinned time in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_778_564_899_123);
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateConversationPinned({
      conversationId: "88",
      isPinned: true,
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ pinned_time: 1_778_564_899 }]);
    expect(wheres).toEqual([
      ["id", "=", 88],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
    nowSpy.mockRestore();
  });

  it("clears conversation pinned time in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable() {
          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where() {
              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.updateConversationPinned({
      conversationId: "88",
      isPinned: false,
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ pinned_time: 0 }]);
  });

  it("clears handoff_msg_id by conversation id", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);
              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);
              return this;
            },
            execute() {
              return Promise.resolve([{ numUpdatedRows: 1n }]);
            },
          };
        },
      } as never,
    );

    await expect(
      repository.clearConversationHandoff({
        conversationId: "88",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBe(true);
    expect(updates).toEqual([{ handoff_msg_id: 0 }]);
    expect(wheres).toEqual([
      ["id", "=", 88],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
  });

  it("accepts an idempotent handoff clear", async () => {
    const repository = new WorkbenchRepository(
      {
        updateTable() {
          return {
            set() {
              return this;
            },
            where() {
              return this;
            },
            execute() {
              return Promise.resolve([{ numUpdatedRows: 0n }]);
            },
          };
        },
      } as never,
    );

    await expect(
      repository.clearConversationHandoff({
        conversationId: "88",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBe(true);
  });

  it("hides a conversation in tenant scope", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const wheres: Array<[string, string, unknown]> = [];
    const repository = new WorkbenchRepository(
      {
        updateTable(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return {
            set(update: Record<string, unknown>) {
              updates.push(update);

              return this;
            },
            where(column: string, operator: string, value: unknown) {
              wheres.push([column, operator, value]);

              return this;
            },
            execute() {
              return Promise.resolve([]);
            },
          };
        },
      } as never,
    );

    await repository.hideConversation({
      conversationId: "88",
      platform: 5,
      uid: 9001,
    });

    expect(updates).toEqual([{ biz_status: 0 }]);
    expect(wheres).toEqual([
      ["id", "=", 88],
      ["uid", "=", 9001],
      ["platform", "=", 5],
      ["biz_status", "=", 1],
    ]);
  });

  it("ignores nullable third-party ids when collecting message hydration sources", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);
    const sources = await (
      repository as unknown as {
        getMessageHydrationSources: (
          rows: Array<{
            chat_type: number;
            conversation_external_id: string | null | undefined;
            conversation_group_id: string | null | undefined;
            from_type: number | null;
            third_external_id: string | null | undefined;
            third_from_id: string | null | undefined;
            third_group_id: string | null | undefined;
            third_user_id: string | null | undefined;
          }>,
          uid: number,
          platform: number,
        ) => Promise<{
          contactsByThirdExternalId: Map<string, unknown>;
          groupMembersByGroupAndThirdUserId: Map<string, unknown>;
          seatsByThirdUserId: Map<string, unknown>;
        }>;
      }
    ).getMessageHydrationSources(
      [
        {
          chat_type: 2,
          conversation_external_id: undefined,
          conversation_group_id: undefined,
          from_type: 2,
          third_external_id: null,
          third_from_id: null,
          third_group_id: undefined,
          third_user_id: undefined,
        },
        {
          chat_type: 1,
          conversation_external_id: undefined,
          conversation_group_id: undefined,
          from_type: 2,
          third_external_id: null,
          third_from_id: undefined,
          third_group_id: undefined,
          third_user_id: null,
        },
      ],
      9001,
      5,
    );

    expect(sources.contactsByThirdExternalId.size).toBe(0);
    expect(sources.groupMembersByGroupAndThirdUserId.size).toBe(0);
    expect(sources.seatsByThirdUserId.size).toBe(0);
  });

  it("keeps revoke event rows visible in historical message pages", async () => {
    const repository = new WorkbenchRepository(createMessagesDb([
      messageRow({
        content: JSON.stringify({ type: "revoke", revokeMsgId: "516" }),
        id: 103,
        msgid: "remote-msg-103",
        msgtype: "system",
      }),
      messageRow({
        content: JSON.stringify({ revokeMsgId: "515" }),
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "revoke",
      }),
      messageRow({
        content: JSON.stringify({ text: "visible" }),
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "text",
      }),
    ]) as never);

    await expect(repository.listMessages("88", { limit: 3 })).resolves.toMatchObject({
      filteredCount: 0,
      messages: [
        {
          content: {
            text: "visible",
          },
          contentType: "text",
          msgid: "remote-msg-101",
        },
        {
          content: {
            revokeMsgId: "515",
            text: "",
          },
          contentType: "revoke",
          msgid: "remote-msg-102",
        },
        {
          content: { text: "" },
          contentType: "system",
          msgid: "remote-msg-103",
        },
      ],
      nextBeforeSeq: 101,
      scannedCount: 3,
    });
  });

  it("loads shadow group messages with the opening seat third user id", async () => {
    const db = createMessagesDb(
      [
        messageRow({
          chat_type: 2,
          conversation_external_id: "",
          conversation_group_id: "group-1",
          from_type: 2,
          id: 201,
          msgid: "shadow-msg-201",
          third_external_id: null,
          third_from_id: "member-1",
          third_group_id: "group-1",
          third_user_id: "opening-seat-001",
        }),
      ],
      [],
      {
        chat_type: 2,
        conversation_external_id: "",
        conversation_group_id: "group-1",
        group_seat_id: 7788,
        third_group_origin_userid: "opening-seat-001",
        third_userid: "reception-seat-001",
      },
    );
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 1 })).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          msgid: "shadow-msg-201",
        }),
      ],
    });
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "opening-seat-001",
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_group_id",
      "=",
      "group-1",
    ]);
  });

  it("hydrates group message senders from the conversation group seat without active-status filters", async () => {
    const db = createMessagesDb(
      [
        messageRow({
          chat_type: 2,
          conversation_external_id: "",
          conversation_group_id: "group-1",
          conversation_group_seat_id: 7788,
          from_type: 2,
          id: 101,
          msgid: "remote-msg-101",
          third_external_id: null,
          third_from_id: "member-1",
          third_group_id: "group-1",
          third_user_id: "seat-third-user-1",
        }),
      ],
      [],
      {
        chat_type: 2,
        conversation_external_id: "",
        conversation_group_id: "group-1",
        group_seat_id: 7788,
      },
      {
        groupMembers: [
          {
            avatar: "https://example.com/member-1.png",
            name: "成员一",
            nickname: "群内成员一",
            third_userid: "member-1",
          },
        ],
      },
    );
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 1 })).resolves.toMatchObject({
      messages: [
        {
          msgid: "remote-msg-101",
          senderAvatar: "https://example.com/member-1.png",
          senderName: "群内成员一",
        },
      ],
    });

    const groupMemberQuery = db.hydrationQueries.find(
      (query) => query.table === "xy_wap_embed_group_member as member",
    );

    expect(groupMemberQuery?.joins).toEqual([]);
    expect(groupMemberQuery?.wheres).toContainEqual(["member.group_seat_id", "=", 7788]);
    expect(groupMemberQuery?.wheres).toContainEqual(["member.uid", "=", 9001]);
    expect(groupMemberQuery?.wheres).toContainEqual(["member.platform", "=", 5]);
    expect(groupMemberQuery?.wheres).toContainEqual([
      "member.third_userid",
      "in",
      ["member-1"],
    ]);
    expect(groupMemberQuery?.wheres).not.toContainEqual(["member.biz_status", "=", 1]);
    expect(groupMemberQuery?.wheres).not.toContainEqual(["group_seat.biz_status", "=", 1]);
  });

  it("hydrates quote previews from current page rows without an extra quote query", async () => {
    const db = createMessagesDb([
      messageRow({
        content: JSON.stringify({
          content: "正式引用消息",
          quoteMsgId: 101,
        }),
        from_type: 1,
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "quote",
      }),
      messageRow({
        content: JSON.stringify({ text: "测试被引用" }),
        from_type: 2,
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "text",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 2 })).resolves.toMatchObject({
      messages: [
        {
          content: { text: "测试被引用" },
          msgid: "remote-msg-101",
        },
        {
          content: {
            quotedMessage: {
              contentType: "text",
              senderName: "external-1",
              text: "测试被引用",
            },
            quoteMsgId: "101",
            text: "正式引用消息",
          },
          contentType: "quote",
          msgid: "remote-msg-102",
        },
      ],
    });
    expect(db.messageQueries).toHaveLength(1);
  });

  it("fetches missing quoted rows in one scoped query and normalizes previews", async () => {
    const db = createMessagesDb(
      [
        messageRow({
          content: JSON.stringify({
            content: "引用图片",
            quoteMsgId: 201,
          }),
          from_type: 1,
          id: 103,
          msgid: "remote-msg-103",
          msgtype: "quote",
        }),
        messageRow({
          content: JSON.stringify({
            content: "引用名片",
            quoteMsgId: 202,
          }),
          from_type: 1,
          id: 102,
          msgid: "remote-msg-102",
          msgtype: "quote",
        }),
      ],
      [
        messageRow({
          content: JSON.stringify({ fileUrl: "media/quote-image.jpg" }),
          from_type: 2,
          id: 201,
          msgid: "remote-msg-201",
          msgtype: "image",
        }),
        messageRow({
          content: JSON.stringify({
            avatar: "https://example.com/avatar.png",
            name: "binarywang",
          }),
          from_type: 2,
          id: 202,
          msgid: "remote-msg-202",
          msgtype: "card",
        }),
      ],
    );
    const repository = new WorkbenchRepository(db as never);

    await expect(repository.listMessages("88", { limit: 2 })).resolves.toMatchObject({
      messages: [
        {
          content: {
            quotedMessage: {
              contentType: "contact-card",
              imageUrl: "https://example.com/avatar.png",
              senderName: "external-1",
              title: "binarywang",
            },
            quoteMsgId: "202",
            text: "引用名片",
          },
        },
        {
          content: {
            quotedMessage: {
              contentType: "image",
              imageUrl: "https://b5.bokr.com.cn/media/quote-image.jpg",
              senderName: "external-1",
            },
            quoteMsgId: "201",
            text: "引用图片",
          },
        },
      ],
    });

    expect(db.messageQueries).toHaveLength(2);
    expect(
      [...((db.messageQueries[1]?.wheres.find(
        ([column, operator]) => column === "message.id" && operator === "in",
      )?.[2] as number[]) ?? [])].sort(),
    ).toEqual([201, 202]);
    expect(db.messageQueries[1]?.wheres).toContainEqual(["message.uid", "=", 9001]);
    expect(db.messageQueries[1]?.wheres).toContainEqual(["message.platform", "=", 5]);
    expect(db.messageQueries[1]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "seat-third-user-1",
    ]);
    expect(db.messageQueries[1]?.wheres).toContainEqual([
      "message.third_external_id",
      "=",
      "external-1",
    ]);
  });

  it("returns the latest history page ascending while querying newest rows first", async () => {
    const db = createHistoryMessagesDb([
      messageRow({
        content: JSON.stringify({ text: "newer" }),
        id: 103,
        msgid: "remote-msg-103",
        msgtime: 1_778_240_300_000,
      }),
      messageRow({
        content: JSON.stringify({ text: "middle" }),
        id: 102,
        msgid: "remote-msg-102",
        msgtime: 1_778_240_200_000,
      }),
      messageRow({
        content: JSON.stringify({ text: "older" }),
        id: 101,
        msgid: "remote-msg-101",
        msgtime: 1_778_240_100_000,
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    const page = await repository.listHistoryMessages("88", { limit: 2 });

    expect(db.messageQueries[0]?.orderBys).toEqual([["message.id", "desc"]]);
    expect(db.messageQueries[0]?.limits).toEqual([3]);
    expect(page).toMatchObject({
      hasNext: false,
      hasPrev: true,
      messages: [
        { msgid: "remote-msg-102", seq: 102 },
        { msgid: "remote-msg-103", seq: 103 },
      ],
    });
    expect(page.prevCursor).toBeDefined();
    expect(page.nextCursor).toBeDefined();
  });

  it("hydrates quote previews in history messages", async () => {
    const db = createHistoryMessagesDb([
      messageRow({
        content: JSON.stringify({
          content: "正式引用消息",
          quoteMsgId: 101,
        }),
        from_type: 1,
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "quote",
      }),
      messageRow({
        content: JSON.stringify({ text: "测试被引用" }),
        from_type: 2,
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "text",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    const page = await repository.listHistoryMessages("88", { limit: 2 });

    expect(page.messages).toMatchObject([
      {
        content: { text: "测试被引用" },
        msgid: "remote-msg-101",
      },
      {
        content: {
          quotedMessage: {
            contentType: "text",
            senderName: "external-1",
            text: "测试被引用",
          },
          quoteMsgId: "101",
          text: "正式引用消息",
        },
        contentType: "quote",
        msgid: "remote-msg-102",
      },
    ]);
    expect(db.messageQueries).toHaveLength(1);
  });

  it("normalizes string from_type when looking up revoke messages", async () => {
    const db = createMessagesDb([
      messageRow({
        from_type: "1" as unknown as number,
        id: 321,
        msgid: "remote-msg-321",
        status: 1,
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.getMessageForRevoke({
        conversationId: "88",
        messageSourceThirdUserId: "seat-third-user-1",
        messageSeq: 321,
        platform: 5,
        receptionThirdUserId: "seat-third-user-1",
        thirdExternalUserId: "external-1",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      senderType: "agent",
      seq: 321,
      status: "sent",
    });
  });

  it("looks up revoke messages by seq only", async () => {
    const db = createMessagesDb([
      messageRow({
        from_type: 1,
        id: 321,
        msgid: "321",
        status: 1,
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.getMessageForRevoke({
        conversationId: "88",
        messageSourceThirdUserId: "seat-third-user-1",
        messageSeq: 321,
        platform: 5,
        receptionThirdUserId: "seat-third-user-1",
        thirdExternalUserId: "external-1",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      senderType: "agent",
      seq: 321,
      status: "sent",
    });

    expect(db.messageQueries[0]?.wheres).toContainEqual(["message.id", "=", 321]);
    expect(db.messageQueries[0]?.whereExpressions).toEqual([]);
    expect(db.messageQueries[0]?.wheres).not.toContainEqual(["message.msgid", "=", "321"]);
  });

  it("keeps ordinary group revoke lookup and ownership on the current seat", async () => {
    const db = createMessagesDb([
      messageRow({
        chat_type: 2,
        from_type: null,
        id: 323,
        msgid: "remote-msg-323",
        status: 1,
        third_from_id: "seat-third-user-1",
        third_group_id: "group-1",
        third_user_id: "seat-third-user-1",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.getMessageForRevoke({
        conversationId: "88",
        messageSourceThirdUserId: "seat-third-user-1",
        messageSeq: 323,
        platform: 5,
        receptionThirdUserId: "seat-third-user-1",
        thirdGroupId: "group-1",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      senderType: "agent",
      seq: 323,
      status: "sent",
    });
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "seat-third-user-1",
    ]);
  });

  it("finds shadow group revoke messages in the opening-seat partition and owns them by reception seat", async () => {
    const db = createMessagesDb([
      messageRow({
        chat_type: 2,
        from_type: null,
        id: 322,
        msgid: "remote-msg-322",
        status: 1,
        third_from_id: "reception-seat-001",
        third_group_id: "group-1",
        third_user_id: "opening-seat-001",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.getMessageForRevoke({
        conversationId: "88",
        messageSourceThirdUserId: "opening-seat-001",
        messageSeq: 322,
        platform: 5,
        receptionThirdUserId: "reception-seat-001",
        thirdGroupId: "group-1",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      senderType: "agent",
      seq: 322,
      status: "sent",
    });
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_user_id",
      "=",
      "opening-seat-001",
    ]);
  });

  it("applies media scope with day and sender filters in history queries", async () => {
    const db = createHistoryMessagesDb([
      messageRow({
        content: JSON.stringify({ fileUrl: "media/image.jpg" }),
        id: 101,
        msgid: "remote-msg-101",
        msgtype: "image",
      }),
      messageRow({
        content: JSON.stringify({ fileUrl: "media/video.mp4" }),
        id: 102,
        msgid: "remote-msg-102",
        msgtype: "video",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    const page = await repository.listHistoryMessages("88", {
      day: "2026-05-19",
      limit: 30,
      scope: "media",
      senderId: "sender-1",
    });

    expect(db.messageQueries[0]?.orderBys).toEqual([["message.id", "asc"]]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.third_from_id",
      "=",
      "sender-1",
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtime",
      ">=",
      new Date(2026, 4, 19, 0, 0, 0, 0).getTime(),
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtime",
      "<=",
      new Date(2026, 4, 19, 23, 59, 59, 999).getTime(),
    ]);
    expect(db.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtype",
      "in",
      ["image", "video"],
    ]);
    expect(page.messages.map((message) => message.contentType)).toEqual(["image", "video"]);
  });

  it("filters history file, h5 and mini-program scopes by raw database msgtype", async () => {
    const fileDb = createHistoryMessagesDb([]);
    const h5Db = createHistoryMessagesDb([]);
    const miniProgramDb = createHistoryMessagesDb([]);

    await new WorkbenchRepository(fileDb as never).listHistoryMessages("88", {
      scope: "file",
    });
    await new WorkbenchRepository(h5Db as never).listHistoryMessages("88", {
      scope: "h5",
    });
    await new WorkbenchRepository(miniProgramDb as never).listHistoryMessages("88", {
      scope: "mini-program",
    });

    expect(fileDb.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtype",
      "=",
      "file",
    ]);
    expect(h5Db.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtype",
      "=",
      "link",
    ]);
    expect(miniProgramDb.messageQueries[0]?.wheres).toContainEqual([
      "message.msgtype",
      "=",
      "weapp",
    ]);
  });

  it("rejects history cursors when the filter snapshot does not match", async () => {
    const db = createHistoryMessagesDb([
      messageRow({
        id: 101,
        msgid: "remote-msg-101",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);
    const firstPage = await repository.listHistoryMessages("88", {
      limit: 1,
      scope: "file",
    });

    await expect(
      repository.listHistoryMessages("88", {
        cursor: firstPage.prevCursor,
        limit: 1,
        scope: "h5",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_HISTORY_CURSOR",
      message: "历史消息分页游标无效",
    });
  });

  it("rejects an empty history cursor instead of treating it as an initial page", async () => {
    const db = createHistoryMessagesDb([]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.listHistoryMessages("88", {
        cursor: "",
        limit: 1,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_HISTORY_CURSOR",
      message: "历史消息分页游标无效",
    });
    expect(db.messageQueries).toHaveLength(0);
  });

  it("rejects calendar-invalid history days", async () => {
    const db = createHistoryMessagesDb([]);
    const repository = new WorkbenchRepository(db as never);

    await expect(
      repository.listHistoryMessages("88", {
        day: "2026-02-31",
        limit: 1,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_HISTORY_DAY",
      message: "历史消息日期无效",
    });
    expect(db.messageQueries).toHaveLength(0);
  });

  it("escapes backslash, percent, and underscore in contact and group search keywords", async () => {
    const bindQuery = createQueryBuilder([
      {
        avatar: "",
        name: "测试客户",
        realName: "测试客户",
        remark: "客户备注",
        thirdExternalUserId: "external-001",
      },
    ]);
    const groupQuery = createQueryBuilder([
      {
        avatar: "",
        name: "测试群",
        remark: undefined,
        thirdGroupId: "group-001",
      },
    ]);
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            return bindQuery;
          }

          if (table === "xy_wap_embed_group_seat") {
            return groupQuery;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const contacts = await repository.searchContacts(9001, 5, "seat-user-001", "a\\b%_");
    const groups = await repository.searchGroups(9001, 5, "seat-user-001", "a\\b%_");

    expect(contacts).toEqual([
      {
        avatar: "",
        name: "测试客户",
        realName: "测试客户",
        remark: "客户备注",
        thirdExternalUserId: "external-001",
      },
    ]);
    expect(bindQuery.wheres).toContainEqual([
      "bind.third_userid",
      "=",
      "seat-user-001",
    ]);
    expect(bindQuery.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "contact.name", operator: "like", value: "%a\\\\b\\%\\_%" },
        { column: "contact.real_name", operator: "like", value: "%a\\\\b\\%\\_%" },
        { column: "bind.remark", operator: "like", value: "%a\\\\b\\%\\_%" },
      ],
    });
    expect(bindQuery.joinConditions).toContainEqual({
      conditions: [
        [
          "contact.third_external_userid",
          "=",
          "bind.third_external_userid",
        ],
        ["contact.uid", "=", "bind.uid"],
        ["contact.platform", "=", "bind.platform"],
        ["contact.biz_status", "=", 1],
      ],
      table: "xy_wap_embed_contact as contact",
      type: "innerJoin",
    });
    expect(bindQuery.joins).toEqual(["innerJoin"]);
    expect(groups).toEqual([
      {
        avatar: "",
        name: "测试群",
        thirdGroupId: "group-001",
      },
    ]);
    expect(groupQuery.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "name", operator: "like", value: "%a\\\\b\\%\\_%" },
        { column: "remark", operator: "like", value: "%a\\\\b\\%\\_%" },
      ],
    });
  });

  it("searches contacts within the requested seat bind scope", async () => {
    const bindQuery = createQueryBuilder([
      {
        avatar: "https://example.com/customer.png",
        name: "王帅",
        realName: "王帅",
        remark: "设计顾问",
        thirdExternalUserId: "external-001",
      },
    ]);
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_customer_bind_relation as bind") {
            return bindQuery;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    const contacts = await repository.searchContacts(9001, 5, "seat-user-001", "帅");

    expect(contacts).toEqual([
      {
        avatar: "https://example.com/customer.png",
        name: "王帅",
        realName: "王帅",
        remark: "设计顾问",
        thirdExternalUserId: "external-001",
      },
    ]);
    expect(bindQuery.wheres).toContainEqual(["bind.uid", "=", 9001]);
    expect(bindQuery.wheres).toContainEqual(["bind.platform", "=", 5]);
    expect(bindQuery.wheres).toContainEqual([
      "bind.third_userid",
      "=",
      "seat-user-001",
    ]);
    expect(bindQuery.wheres).toContainEqual(["bind.biz_status", "=", 1]);
    expect(bindQuery.whereExpressions).toContainEqual({
      type: "or",
      expressions: [
        { column: "contact.name", operator: "like", value: "%帅%" },
        { column: "contact.real_name", operator: "like", value: "%帅%" },
        { column: "bind.remark", operator: "like", value: "%帅%" },
      ],
    });
    expect(bindQuery.joinConditions).toContainEqual({
      conditions: [
        [
          "contact.third_external_userid",
          "=",
          "bind.third_external_userid",
        ],
        ["contact.uid", "=", "bind.uid"],
        ["contact.platform", "=", "bind.platform"],
        ["contact.biz_status", "=", 1],
      ],
      table: "xy_wap_embed_contact as contact",
      type: "innerJoin",
    });
    expect(bindQuery.limits).toContain(100);
  });

  it("hydrates a conversation only within the requested active seat scope", async () => {
    let conversationQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            conversationQuery = createQueryBuilder(
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
                third_userid: "seat-user-001",
              }),
            );
            return conversationQuery;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await repository.getHydratedConversation(9001, 5, "seat-user-001", "88");

    expect(conversationQuery?.wheres).toContainEqual([
      "conversation.third_userid",
      "=",
      "seat-user-001",
    ]);
    expect(conversationQuery?.wheres).not.toContainEqual([
      "conversation.biz_status",
      "=",
      1,
    ]);
  });

  it("hydrates a hidden conversation for get-or-create target reuse", async () => {
    let conversationQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_user_seat") {
            return createQueryBuilder({
              id: 12,
              platform: 5,
              third_userid: "seat-user-001",
              uid: 9001,
            });
          }

          if (table === "xy_wap_embed_conversation as conversation") {
            conversationQuery = createQueryBuilder(
              createConversationRow({
                id: 88,
                third_external_userid: "external-001",
                third_userid: "seat-user-001",
              }),
            );
            return conversationQuery;
          }

          if (
            table === "xy_wap_embed_msg_audit_info" ||
            table === "xy_wap_embed_contact" ||
            table === "xy_wap_embed_customer_bind_relation" ||
            table === "xy_wap_embed_group_seat"
          ) {
            return createQueryBuilder([]);
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.getHydratedConversation(9001, 5, "seat-user-001", "88"),
    ).resolves.toMatchObject({
      conversationId: "88",
    });

    expect(conversationQuery?.wheres).not.toContainEqual([
      "conversation.biz_status",
      "=",
      1,
    ]);
  });

});

function messageRow(overrides: Partial<MessageRow>): MessageRow {
  return {
    chat_type: 1,
    content: null,
    conversation_external_id: "external-1",
    conversation_group_id: "",
    conversation_id: 88,
    from_type: 3,
    id: 101,
    msgid: "remote-msg-101",
    msgtime: 1778240200000,
    msgtype: "text",
    seat_id: 12,
    third_external_id: "external-1",
    third_from_id: "",
    third_group_id: "",
    third_user_id: "seat-third-user-1",
    ...overrides,
  };
}

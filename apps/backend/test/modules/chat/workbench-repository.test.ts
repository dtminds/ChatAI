import { describe, expect, it, vi } from "vitest";
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

function createMessagesByIdsDb(
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

function createQueryBuilder(result: unknown) {
  let currentResult = result;
  const wheres: Array<[string, string, unknown]> = [];
  const limits: number[] = [];
  const orderBys: Array<[string, string | undefined]> = [];
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
      coalesce() {
        return {
          as() {
            return undefined;
          },
        };
      },
      max() {
        return {
          as() {
            return undefined;
          },
        };
      },
      sum() {
        return undefined;
      },
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
  });

  return {
    joins,
    joinConditions,
    limits,
    orderBys,
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
    orderBy(column: string, direction?: string) {
      orderBys.push([column, direction]);
      return this;
    },
    select(selection?: unknown) {
      if (typeof selection === "function") {
        selection(expressionBuilder);
        currentResult = Array.isArray(currentResult)
          ? currentResult.map((item) => ({ ...item, seat_unread_count: 6 }))
          : { ...(currentResult as object), seat_unread_count: 6 };
      }

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
    seat_id: 12,
    third_external_userid: "customer-001",
    third_group_id: "",
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
  it("does not send NaN to MySQL when subUserId is invalid", async () => {
    const repository = new WorkbenchRepository(createFailingDb() as never);

    await expect(repository.getSubUser("sub-user-001")).resolves.toBeUndefined();
    await expect(repository.listSeats("sub-user-001")).resolves.toEqual([]);
    await expect(repository.canAccessSeat("sub-user-001", "1")).resolves.toBe(false);
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
    await expect(repository.canAccessSeat("1", "not-a-seat")).resolves.toBe(false);
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
        scope: "mine",
        seatIds: ["12"],
        subUserId: "101",
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
      conditions: [["relation.user_seat_id", "=", "seat.id"]],
      table: "xy_wap_embed_user_seat_sub_relation as relation",
      type: "innerJoin",
    });
    expect(accessibleSeatQuery?.wheres).toContainEqual(["relation.sub_id", "=", 101]);
    expect(accessibleSeatQuery?.wheres).toContainEqual(["seat.biz_status", "=", 1]);
    expect(bindQuery?.joins).toEqual([]);
    expect(bindQuery?.wheres).toContainEqual(["bind.uid", "=", 9001]);
    expect(bindQuery?.wheres).toContainEqual(["bind.platform", "=", 5]);
    expect(bindQuery?.wheres).toContainEqual(["bind.third_userid", "=", "seat-user-12"]);
    expect(bindQuery?.orderBys).toEqual([
      ["bind.add_time", "desc"],
      ["bind.id", "desc"],
    ]);
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
      scope: "mine",
      seatIds: ["12"],
      subUserId: "101",
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
      scope: "mine",
      seatIds: ["12"],
      subUserId: "101",
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
      scope: "mine",
      seatIds: [],
      subUserId: "101",
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

    await expect(
      repository.listCustomers({
        platform: 5,
        scope: "all",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
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
        avatar: "",
        description: "",
        hostSubUserId: "101",
        lastMessageTime: new Date("2026-05-21T06:15:21.000Z").getTime(),
        loginStatus: "online",
        name: "德瑞可",
        operatorName: "德瑞可",
        phone: "",
        seatId: "12",
        thirdUserId: "seat-third-user-1",
        unreadCount: 7,
      },
      {
        avatar: "",
        description: "",
        hostSubUserId: "202",
        lastMessageTime: new Date("2026-05-21T06:16:21.000Z").getTime(),
        loginStatus: "offline",
        name: "念都堂",
        operatorName: "念都堂",
        phone: "",
        seatId: "13",
        thirdUserId: "seat-third-user-2",
        unreadCount: 2,
      },
    ]);
    expect(seatQueryBuilders).toHaveLength(1);
    expect(seatQueryBuilders[0]?.wheres).toContainEqual(["seat.id", "in", ["13", "12"]]);
    expect(seatQueryBuilders[0]?.wheres).toContainEqual(["seat.biz_status", "=", 1]);
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
      lastMessage: "hello",
    });
  });

  it("hydrates inactive single contact conversations and exposes contact biz status", async () => {
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
      bizStatus: 0,
      conversationId: "88",
      customerAvatar: "https://example.com/inactive-contact.png",
      customerName: "失效客户实名",
    });
  });

  it("uses customer bind remarks regardless of bind biz status for historical conversation display", async () => {
    const observedBindQueries: Array<ReturnType<typeof createQueryBuilder>> = [];
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
            const query = createQueryBuilder({
              biz_status: 2,
              remark: "历史备注",
              third_external_userid: "external-001",
            });
            observedBindQueries.push(query);

            return query;
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

    expect(observedBindQueries[0]?.wheres).not.toContainEqual([
      "biz_status",
      "=",
      1,
    ]);
    expect(page.items[0]).toMatchObject({
      conversationId: "88",
      customerName: "历史备注",
    });
  });

  it("uses customer bind biz status for private conversation availability", async () => {
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
            return createQueryBuilder({
              biz_status: 2,
              remark: "历史备注",
              third_external_userid: "external-001",
            });
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

    expect(page.items[0]).toMatchObject({
      bizStatus: 2,
      conversationId: "88",
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
      }),
      expect.objectContaining({
        conversationId: "89",
        customerName: "external-002",
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
        bizStatus: 0,
        conversationId: "88",
      }),
      expect.objectContaining({
        bizStatus: 0,
        conversationId: "89",
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

  it("lists messages by ids in the conversation tenant scope", async () => {
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
      createMessagesByIdsDb(messageRows) as never,
    );

    await expect(
      repository.listMessagesByIds("88", ["829", "829", "0", "bad"]),
    ).resolves.toMatchObject({
      messages: [
        expect.objectContaining({
          messageId: "remote-msg-829",
          senderAvatar: "",
          senderName: "external-1",
          seq: 829,
        }),
      ],
    });
  });

  it("scopes message id lookup to the single conversation key", async () => {
    const db = createMessagesByIdsDb([
      createConversationMessageRow({
        id: 829,
        msgid: "remote-msg-829",
      }),
    ]);
    const repository = new WorkbenchRepository(db as never);

    await repository.listMessagesByIds("88", ["829"]);

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

  it("scopes message id lookup to the group conversation key", async () => {
    const db = createMessagesByIdsDb(
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

    await repository.listMessagesByIds("88", ["829"]);

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

  it("hydrates quote previews when fetching messages by ids", async () => {
    const db = createMessagesByIdsDb(
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

    await expect(repository.listMessagesByIds("88", ["102"])).resolves.toMatchObject({
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
          messageId: "remote-msg-102",
        },
      ],
    });
    expect(db.messageQueries).toHaveLength(2);
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

    await expect(repository.getSeatEventScope("101")).resolves.toEqual({
      platform: 5,
      seatIds: ["12", "13"],
      uid: 272,
    });
    expect(relationQueries[0]?.joins).toEqual(["innerJoin"]);
    expect(relationQueries[0]?.wheres).toEqual([["relation.sub_id", "=", 101]]);
    expect(relationQueries[0]?.joinConditions).toEqual([
      {
        conditions: [
          ["seat.id", "=", "relation.user_seat_id"],
          ["seat.uid", "=", "relation.uid"],
          ["seat.platform", "=", "relation.platform"],
          ["seat.biz_status", "=", 1],
        ],
        table: "xy_wap_embed_user_seat as seat",
        type: "innerJoin",
      },
    ]);
  });

  it("returns conversation tenant scope and takeover sub-user for Java write operations", async () => {
    let conversationQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          conversationQuery = createQueryBuilder({
            id: 88,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 6,
            third_external_userid: "external-001",
            third_group_id: null,
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 2,
          });
          return conversationQuery;
        },
      } as never,
    );

    await expect(repository.getConversationLookup("88")).resolves.toEqual({
      id: "88",
      platform: 5,
      seatHostSubUserId: "101",
      seatId: "12",
      seatUnreadCount: 6,
      thirdExternalUserId: "external-001",
      thirdGroupId: undefined,
      thirdGroupName: undefined,
      thirdUserId: "seat-user-001",
      uid: 9001,
      unreadCount: 2,
    });
    expect(conversationQuery?.wheres).not.toContainEqual([
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
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          conversationQuery = createQueryBuilder({
            id: 88,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 6,
            third_external_userid: "external-001",
            third_group_id: null,
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 2,
          });
          return conversationQuery;
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

  it("returns group name from group seat lookup for sidebar iframe params", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation as conversation");

          return createQueryBuilder({
            group_name: "原始群名",
            group_remark: "备注群名",
            id: 99,
            platform: 5,
            seat_host_sub_id: 101,
            seat_id: 12,
            seat_unread_count: 3,
            third_external_userid: null,
            third_group_id: "group-001",
            third_userid: "seat-user-001",
            uid: 9001,
            unread_cnt: 1,
          });
        },
      } as never,
    );

    await expect(repository.getConversationLookup("99")).resolves.toEqual({
      id: "99",
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

  it("falls back to third group id when group seat name is missing", async () => {
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
      thirdGroupName: "group-002",
    });
  });

  it("reads quote content base64 from audit extend origin data", async () => {
    const queries: Array<{ table: string; wheres: Array<[string, string, unknown]> }> = [];
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_msg_audit_info_extend");
          const result = {
            origin_data: JSON.stringify({
              quote_content_base64: " base64-quote-content ",
            }),
          };
          const query = createQueryBuilder(result);
          queries.push({ table, wheres: query.wheres });

          return query;
        },
      } as never,
    );

    await expect(
      repository.getQuoteContentBase64({
        messageId: "remote-msg-538",
        platform: 5,
        uid: 9001,
      }),
    ).resolves.toBe("base64-quote-content");

    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatchObject({
      table: "xy_wap_embed_msg_audit_info_extend",
      wheres: [
        ["msgid", "=", "remote-msg-538"],
        ["platform", "=", 5],
        ["uid", "=", 9001],
      ],
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
        platform: 5,
        thirdExternalUserId: "external-001",
        thirdUserId: "seat-user-001",
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

  it("calculates seat unread after mark-read with a lightweight aggregate query", async () => {
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          expect(table).toBe("xy_wap_embed_conversation");

          return createQueryBuilder({
            unread_count: 5,
          });
        },
      } as never,
    );

    await expect(
      repository.getSeatUnreadCountAfterMarkRead({
        conversationId: "88",
        platform: 5,
        seatId: "12",
        uid: 9001,
      }),
    ).resolves.toBe(5);
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
          messageId: "remote-msg-101",
        },
        {
          content: {
            revokeMsgId: "515",
            text: "",
          },
          contentType: "revoke",
          messageId: "remote-msg-102",
        },
        {
          content: { text: "" },
          contentType: "system",
          messageId: "remote-msg-103",
        },
      ],
      nextBeforeSeq: 101,
      scannedCount: 3,
    });
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
          messageId: "remote-msg-101",
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
          messageId: "remote-msg-101",
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
          messageId: "remote-msg-102",
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
        { messageId: "remote-msg-102", seq: 102 },
        { messageId: "remote-msg-103", seq: 103 },
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
        messageId: "remote-msg-101",
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
        messageId: "remote-msg-102",
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
        messageId: "remote-msg-321",
        platform: 5,
        thirdExternalUserId: "external-1",
        thirdUserId: "seat-third-user-1",
        uid: 9001,
      }),
    ).resolves.toMatchObject({
      senderType: "agent",
      seq: 321,
      status: "sent",
    });
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

  it("finds hidden conversation ids by target for get-or-create reuse", async () => {
    let conversationQuery: ReturnType<typeof createQueryBuilder> | undefined;
    const repository = new WorkbenchRepository(
      {
        selectFrom(table: string) {
          if (table === "xy_wap_embed_conversation") {
            conversationQuery = createQueryBuilder({ id: 88 });
            return conversationQuery;
          }

          throw new Error(`unexpected table ${table}`);
        },
      } as never,
    );

    await expect(
      repository.findConversationIdByTarget(9001, 5, "seat-user-001", 1, "external-001"),
    ).resolves.toBe("88");

    expect(conversationQuery?.wheres).not.toContainEqual(["biz_status", "=", 1]);
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

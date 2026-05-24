import { afterEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { buildMockedApp } from "../../helpers/build-mocked-app";
import {
  addMockWhereClause,
  applyMockPaging,
  matchesMockWhereClauses,
  type MockWhereClause,
} from "../../helpers/mock-kysely";

describe("settings sub-account routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists sub-accounts with related WeCom seats", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        pagination: {
          page: 1,
          pageSize: 10,
          total: 3,
          totalPages: 1,
        },
        seats: [],
        subAccounts: [
          {
            account: "owner",
            id: "1",
            name: "主账号",
            role: "owner",
            seats: [],
            status: "active",
            type: 1,
          },
          {
            account: "agent001",
            id: "11",
            name: "客服一号",
            role: "operator",
            seats: [
              {
                avatarUrl: "https://example.com/drc.png",
                name: "德瑞可",
                seatId: "101",
              },
            ],
            status: "active",
            type: 0,
          },
          {
            account: "agent002",
            id: "12",
            name: "客服二号",
            role: "operator",
            seats: [],
            status: "disabled",
            type: 0,
          },
        ],
      },
      success: true,
    });
    expect(db.getSubAccountListWheres()).toContainEqual(["sub_user.uid", "=", 9001]);
    expect(db.getSubAccountListWheres()).toContainEqual(["limit", "=", 10]);
    expect(db.getSubAccountListWheres()).toContainEqual(["offset", "=", 0]);

    await app.close();
  });

  it("lists seat options with database keyword filtering and limit", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      query: {
        keyword: "德",
      },
      url: "/api/server/settings/seat-options",
    });

    expect(response.statusCode).toBe(200);
    expect(db.getSeatOptionWheres()).toContainEqual(["limit", "=", 20]);
    expect(response.json()).toEqual({
      data: {
        seats: [
          {
            avatarUrl: "https://example.com/drc.png",
            name: "德瑞可",
            seatId: "101",
          },
        ],
      },
      success: true,
    });

    await app.close();
  });

  it("returns paged sub-accounts and pagination metadata", async () => {
    const { app, authorization } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      query: {
        page: "1",
      },
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        pagination: {
          page: 1,
          pageSize: 10,
          total: 3,
          totalPages: 1,
        },
      },
      success: true,
    });

    await app.close();
  });

  it("filters sub-accounts by account keyword even when name does not match", async () => {
    const { app, authorization } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      query: {
        keyword: "agent002",
      },
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
        subAccounts: [
          {
            account: "agent002",
            id: "12",
            name: "客服二号",
            role: "operator",
            seats: [],
            status: "disabled",
            type: 0,
          },
        ],
      },
      success: true,
    });

    await app.close();
  });

  it("creates a sub-account in the current tenant and binds seats", async () => {
    vi.spyOn(argon2, "hash").mockResolvedValue("hashed-password");
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        account: "agent003",
        name: "客服三号",
        password: "Strong1!",
        role: "operator",
        seatIds: ["101", "102"],
      },
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        account: "agent003",
        id: "13",
        name: "客服三号",
        role: "operator",
        seats: [
          {
            avatarUrl: "https://example.com/drc.png",
            name: "德瑞可",
            seatId: "101",
          },
          {
            avatarUrl: "https://example.com/ndt.png",
            name: "念都堂",
            seatId: "102",
          },
        ],
        status: "active",
        type: 0,
      },
      success: true,
    });
    expect(db.insertedSubAccount).toMatchObject({
      account: "agent003",
      name: "客服三号",
      password_hash: "hashed-password",
      platform: 5,
      role: "operator",
      status: 1,
      type: 0,
      uid: 9001,
    });
    expect(db.insertedRelations).toEqual([
      {
        platform: 5,
        sub_id: 13,
        uid: 9001,
        user_seat_id: 101,
      },
      {
        platform: 5,
        sub_id: 13,
        uid: 9001,
        user_seat_id: 102,
      },
    ]);

    await app.close();
  });

  it("updates nickname and seat bindings without requiring a password change", async () => {
    const hashSpy = vi.spyOn(argon2, "hash");
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        name: "客服二号改",
        password: "",
        seatIds: ["102"],
      },
      url: "/api/server/settings/sub-accounts/12",
    });

    expect(response.statusCode).toBe(200);
    expect(db.updatedSubAccount).toEqual({
      name: "客服二号改",
      update_time: expect.any(Date),
    });
    expect(db.deletedRelationSubIds).toEqual([12]);
    expect(db.insertedRelations).toEqual([
      {
        platform: 5,
        sub_id: 12,
        uid: 9001,
        user_seat_id: 102,
      },
    ]);
    expect(hashSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it("revokes active sessions when a sub-account password changes", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        name: "客服二号",
        password: "Strong1!",
        seatIds: ["102"],
      },
      url: "/api/server/settings/sub-accounts/12",
    });

    expect(response.statusCode).toBe(200);
    expect(db.revokedSessionSubUserIds).toEqual([12]);

    await app.close();
  });

  it("expires existing access tokens when a sub-account role changes", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        name: "客服一号",
        password: "",
        role: "viewer",
        seatIds: ["101"],
      },
      url: "/api/server/settings/sub-accounts/11",
    });

    expect(response.statusCode).toBe(200);
    expect(db.updatedSubAccount).toMatchObject({
      role: "viewer",
    });
    expect(db.expiredAccessTokenSubUserIds).toEqual([11]);

    await app.close();
  });

  it("rejects weak sub-account passwords on create and update", async () => {
    const hashSpy = vi.spyOn(argon2, "hash");
    const { app, authorization } = await createSettingsApp();

    const createResponse = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        account: "agent003",
        name: "客服三号",
        password: "weak",
        role: "operator",
        seatIds: ["101"],
      },
      url: "/api/server/settings/sub-accounts",
    });
    const updateResponse = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        name: "客服二号改",
        password: "weak",
        seatIds: ["102"],
      },
      url: "/api/server/settings/sub-accounts/12",
    });

    expect(createResponse.statusCode).toBe(400);
    expect(updateResponse.statusCode).toBe(400);
    expect(createResponse.json()).toMatchObject({
      error: {
        code: "INVALID_SUB_ACCOUNT_PASSWORD",
        message: "密码必须包含大写字母、小写字母、数字、符号",
      },
      success: false,
    });
    expect(updateResponse.json()).toMatchObject({
      error: {
        code: "INVALID_SUB_ACCOUNT_PASSWORD",
        message: "密码必须包含大写字母、小写字母、数字、符号",
      },
      success: false,
    });
    expect(hashSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it("disables, enables, and deletes sub-accounts", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const disable = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: { status: "disabled" },
      url: "/api/server/settings/sub-accounts/11/status",
    });
    const enable = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: { status: "active" },
      url: "/api/server/settings/sub-accounts/11/status",
    });
    const remove = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/settings/sub-accounts/11",
    });

    expect(disable.statusCode).toBe(200);
    expect(enable.statusCode).toBe(200);
    expect(remove.statusCode).toBe(200);
    expect(db.statusUpdates).toEqual([2, 1, 0]);

    await app.close();
  });

  it("rejects disabling or deleting the main account", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const disable = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: { status: "disabled" },
      url: "/api/server/settings/sub-accounts/1/status",
    });
    const remove = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/settings/sub-accounts/1",
    });

    expect(disable.statusCode).toBe(400);
    expect(remove.statusCode).toBe(400);
    expect(db.statusUpdates).toEqual([]);

    await app.close();
  });
});

async function createSettingsApp() {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: ["admin"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "1",
  });
  const db = createSettingsDbMock();

  app.db = db as never;

  return {
    app,
    authorization: `Bearer ${token}`,
    db,
  };
}

function createSettingsDbMock() {
  const subUsers = [
    {
      account: "owner",
      id: 1,
      name: "主账号",
      platform: 5,
      role: "operator",
      status: 1,
      type: 1,
      uid: 9001,
    },
    {
      account: "agent001",
      id: 11,
      name: "客服一号",
      platform: 5,
      status: 1,
      type: 0,
      uid: 9001,
    },
    {
      account: "agent002",
      id: 12,
      name: "客服二号",
      platform: 5,
      role: "operator",
      status: 2,
      type: 0,
      uid: 9001,
    },
  ];
  const seats = [
    {
      biz_status: 1,
      third_avatar: "https://example.com/drc.png",
      id: 101,
      platform: 5,
      third_user_name: "德瑞可",
      uid: 9001,
    },
    {
      biz_status: 1,
      third_avatar: "https://example.com/ndt.png",
      id: 102,
      platform: 5,
      third_user_name: "念都堂",
      uid: 9001,
    },
  ];
  const relations = [
    {
      platform: 5,
      sub_id: 11,
      uid: 9001,
      user_seat_id: 101,
    },
  ];
  const state = {
    deletedRelationSubIds: [] as number[],
    insertedRelations: [] as Array<Record<string, unknown>>,
    insertedSubAccount: undefined as Record<string, unknown> | undefined,
    expiredAccessTokenSubUserIds: [] as number[],
    revokedSessionSubUserIds: [] as number[],
    seatOptionWheres: [] as MockWhereClause[],
    statusUpdates: [] as number[],
    subAccountListWheres: [] as MockWhereClause[],
    updatedSubAccount: undefined as Record<string, unknown> | undefined,
    getSeatOptionWheres() {
      return state.seatOptionWheres;
    },
    getSubAccountListWheres() {
      return state.subAccountListWheres;
    },
    getQueryValue(wheres: MockWhereClause[], column: string) {
      const clause = wheres.find(
        (whereClause): whereClause is [string, string, unknown] =>
          Array.isArray(whereClause) && whereClause[0] === column,
      );

      return clause?.[2];
    },
    selectFrom(table: string) {
      const wheres: MockWhereClause[] = [];
      const selectColumns: Array<string> = [];
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_user_seat") {
            state.seatOptionWheres = wheres;
            const filtered = seats.filter((seat) =>
              matchesMockWhereClauses(seat, wheres),
            );

            return applyMockPaging(
              filtered,
              state.getQueryValue(wheres, "limit") as number | undefined,
              state.getQueryValue(wheres, "offset") as number | undefined,
            ).map((seat) => ({
              avatarUrl: seat.third_avatar,
              id: seat.id,
              third_user_name: seat.third_user_name,
            }));
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            return [...relations, ...state.insertedRelations]
              .map((relation) => {
                const seat = seats.find((item) => item.id === relation.user_seat_id);

                return {
                  avatarUrl: seat?.third_avatar,
                  biz_status: 1,
                  name: seat?.third_user_name,
                  platform: relation.platform,
                  relation: relation,
                  seat_id: relation.user_seat_id,
                  sub_id: relation.sub_id,
                  uid: relation.uid,
                  user_seat_id: relation.user_seat_id,
                };
              })
              .filter((relation) =>
                matchesMockWhereClauses(relation as Record<string, unknown>, wheres),
              );
          }

          if (table === "xy_wap_embed_sub_user as sub_user") {
            state.subAccountListWheres = wheres;
            const limit = state.getQueryValue(wheres, "limit");
            const offset = state.getQueryValue(wheres, "offset");
            const filtered = subUsers.filter((subUser) =>
              matchesMockWhereClauses(subUser, wheres),
            );
            const sliced = applyMockPaging(filtered, limit as number | undefined, offset as number | undefined);

            if (selectColumns.some((column) => column.includes("count("))) {
              return [{ total: filtered.length }];
            }

            return sliced
              .map((subUser) => ({
                account: subUser.account,
                id: subUser.id,
                name: subUser.name,
                role: subUser.role,
                status: subUser.status,
                type: subUser.type,
              }));
          }

          throw new Error(`Unexpected execute table: ${table}`);
        },
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user_session") {
            return {
              expires_at: new Date(Date.now() + 1000),
              id: "501",
              refresh_token_hash: "hash",
              revoked_at: null,
              session_version: 1,
              sub_user_id: "1",
            };
          }

          if (table === "xy_wap_embed_sub_user") {
            if (state.getQueryValue(wheres, "account") !== undefined) {
              const account = state.getQueryValue(wheres, "account");

              return subUsers.find((subUser) => subUser.account === account);
            }

            if (state.getQueryValue(wheres, "id") !== undefined) {
              const id = state.getQueryValue(wheres, "id");

              return subUsers.find((subUser) => subUser.id === id);
            }

            return subUsers[0];
          }

          if (table === "xy_wap_embed_sub_user as sub_user") {
            if (selectColumns.some((column) => column.includes("count("))) {
              return (await builder.execute())[0];
            }

            const id = state.getQueryValue(wheres, "sub_user.id");

            if (id) {
              const subUser = subUsers.find((item) => item.id === id);

              return subUser
                ? {
                    account: subUser.account,
                    id: subUser.id,
                    name: subUser.name,
                    role: subUser.role,
                    status: subUser.status,
                    type: subUser.type,
                  }
                : undefined;
            }

            return subUsers[0];
          }

          throw new Error(`Unexpected executeTakeFirst table: ${table}`);
        },
        groupBy: () => builder,
        innerJoin: () => builder,
        leftJoin: () => builder,
        orderBy: () => builder,
        select: (selection?: unknown) => {
          if (Array.isArray(selection)) {
            selectColumns.push(...selection.map((item) => String(item)));
          }

          if (typeof selection === "function") {
            selectColumns.push("count(total)");
          }

          return builder;
        },
        where: (
          column: string | Parameters<typeof addMockWhereClause>[1],
          operator?: string,
          value?: unknown,
        ) => {
          addMockWhereClause(wheres, column, operator, value);
          return builder;
        },
        limit: (value: number) => {
          wheres.push(["limit", "=", value]);
          return builder;
        },
        offset: (value: number) => {
          wheres.push(["offset", "=", value]);
          return builder;
        },
      };

      return builder;
    },
    insertInto(table: string) {
      const builder = {
        execute: async () => [],
        executeTakeFirstOrThrow: async () => ({ insertId: 13 }),
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === "xy_wap_embed_sub_user") {
            state.insertedSubAccount = values as Record<string, unknown>;
            subUsers.push({
              account: String(state.insertedSubAccount.account),
              id: 13,
              name: String(state.insertedSubAccount.name),
              platform: Number(state.insertedSubAccount.platform),
              role: String(state.insertedSubAccount.role),
              status: Number(state.insertedSubAccount.status),
              type: Number(state.insertedSubAccount.type),
              uid: Number(state.insertedSubAccount.uid),
            });
          } else if (table === "xy_wap_embed_user_seat_sub_relation") {
            state.insertedRelations = Array.isArray(values) ? values : [values];
          } else {
            throw new Error(`Unexpected insert table: ${table}`);
          }

          return builder;
        },
      };

      return builder;
    },
    updateTable(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      let nextValues: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_sub_user_session") {
            const subUserId = wheres.find(([column]) => column === "sub_user_id")?.[2];

            if (typeof subUserId === "number") {
              if ("revoked_at" in nextValues) {
                state.revokedSessionSubUserIds.push(subUserId);
              } else if ("session_version" in nextValues) {
                state.expiredAccessTokenSubUserIds.push(subUserId);
              }
            }
          }

          return [];
        },
        set: (values: Record<string, unknown> | ((expressionBuilder: unknown) => Record<string, unknown>)) => {
          if (
            table !== "xy_wap_embed_sub_user" &&
            table !== "xy_wap_embed_sub_user_session"
          ) {
            throw new Error(`Unexpected update table: ${table}`);
          }

          if (table === "xy_wap_embed_sub_user") {
            const updateValues = values as Record<string, unknown>;

            if ("status" in updateValues) {
              state.statusUpdates.push(updateValues.status as number);
            } else {
              state.updatedSubAccount = updateValues;
            }
          } else {
            nextValues =
              typeof values === "function"
                ? values(
                    (column: string, operator: string, value: unknown) =>
                      column === "session_version" && operator === "+" && value === 1
                        ? 2
                        : undefined,
                  )
                : values;
          }

          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
    deleteFrom(table: string) {
      if (table !== "xy_wap_embed_user_seat_sub_relation") {
        throw new Error(`Unexpected delete table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        where: (_column: string, _operator: string, value: unknown) => {
          if (_column === "sub_id" && typeof value === "number") {
            state.deletedRelationSubIds.push(value);
          }

          return builder;
        },
      };

      return builder;
    },
  };

  return state;
}

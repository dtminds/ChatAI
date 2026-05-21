import { afterEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { buildMockedApp } from "../../helpers/build-mocked-app";

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
    expect(db.joinCalls).toEqual([]);
    expect(response.json()).toEqual({
      data: {
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
    expect(db.joinCalls).toEqual([]);
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
      third_avatar: "https://example.com/drc.png",
      id: 101,
      platform: 5,
      third_user_name: "德瑞可",
      uid: 9001,
    },
    {
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
    joinCalls: [] as Array<{ method: string; table: unknown }>,
    statusUpdates: [] as number[],
    subAccountListWheres: [] as Array<[string, string, unknown]>,
    updatedSubAccount: undefined as Record<string, unknown> | undefined,
    getSubAccountListWheres() {
      return state.subAccountListWheres;
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_user_seat") {
            return seats.map((seat) => ({
              avatarUrl: seat.third_avatar,
              id: seat.id,
              third_user_name: seat.third_user_name,
            }));
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const subId = wheres.find(([column]) => column === "relation.sub_id")?.[2];

            return [...relations, ...state.insertedRelations]
              .filter((relation) => subId === undefined || relation.sub_id === subId)
              .map((relation) => ({
                seat_id: relation.user_seat_id,
                sub_id: relation.sub_id,
              }));
          }

          if (table === "xy_wap_embed_sub_user as sub_user") {
            state.subAccountListWheres = wheres;

            return subUsers
              .filter((subUser) => {
                if (subUser.status === 0) {
                  return false;
                }

                const id = wheres.find(([column]) => column === "sub_user.id")?.[2];

                return id ? subUser.id === id : true;
              })
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
            if (wheres.some(([column]) => column === "account")) {
              const account = wheres.find(([column]) => column === "account")?.[2];

              return subUsers.find((subUser) => subUser.account === account);
            }

            if (wheres.some(([column]) => column === "id")) {
              const id = wheres.find(([column]) => column === "id")?.[2];

              return subUsers.find((subUser) => subUser.id === id);
            }

            return subUsers[0];
          }

          if (table === "xy_wap_embed_sub_user as sub_user") {
            const id = wheres.find(([column]) => column === "sub_user.id")?.[2];

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
        innerJoin: (table: unknown) => {
          state.joinCalls.push({ method: "innerJoin", table });
          return builder;
        },
        leftJoin: (table: unknown) => {
          state.joinCalls.push({ method: "leftJoin", table });
          return builder;
        },
        orderBy: () => builder,
        select: () => builder,
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
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
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_sub_user_session") {
            const subUserId = wheres.find(([column]) => column === "sub_user_id")?.[2];

            if (typeof subUserId === "number") {
              state.expiredAccessTokenSubUserIds.push(subUserId);
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

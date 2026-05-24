import { describe, expect, it } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("settings managed-account routes", () => {
  it("lists managed accounts with independent online status and related sub-accounts", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/managed-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        pagination: {
          page: 1,
          pageSize: 10,
          total: 2,
          totalPages: 1,
        },
        managedAccounts: [
          {
            avatarUrl: "https://example.com/drc.png",
            id: "101",
            name: "德瑞可",
            onlineStatus: "offline",
            subAccounts: [
              {
                account: "owner",
                id: "1",
                isTakingOver: false,
                name: "主账号",
                status: "active",
                type: 1,
              },
              {
                account: "agent001",
                id: "11",
                isTakingOver: true,
                name: "客服一号",
                status: "active",
                type: 0,
              },
              {
                account: "agent002",
                id: "12",
                isTakingOver: false,
                name: "客服二号",
                status: "active",
                type: 0,
              },
            ],
          },
          {
            avatarUrl: "https://example.com/ndt.png",
            id: "102",
            name: "念都堂",
            onlineStatus: "online",
            subAccounts: [],
          },
        ],
        subAccounts: [
          {
            account: "owner",
            id: "1",
            isTakingOver: false,
            name: "主账号",
            status: "active",
            type: 1,
          },
          {
            account: "agent001",
            id: "11",
            isTakingOver: false,
            name: "客服一号",
            status: "active",
            type: 0,
          },
          {
            account: "agent002",
            id: "12",
            isTakingOver: false,
            name: "客服二号",
            status: "active",
            type: 0,
          },
        ],
      },
      success: true,
    });
    await app.close();
  });

  it("updates the sub-accounts related to a managed account", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        subAccountIds: ["12"],
      },
      url: "/api/server/settings/managed-accounts/101/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(db.subAccountValidationWheres).toContainEqual(["sub_user.id", "in", [12]]);
    expect(db.deletedRelationSeatIds).toEqual([101]);
    expect(db.insertedRelations).toEqual([
      {
        platform: 5,
        sub_id: 12,
        uid: 9001,
        user_seat_id: 101,
      },
    ]);
    expect(response.json()).toMatchObject({
      data: {
        id: "101",
        subAccounts: [
          {
            id: "12",
            isTakingOver: false,
            name: "客服二号",
          },
        ],
      },
      success: true,
    });

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
      status: 1,
      type: 0,
      uid: 9001,
    },
  ];
  const seats = [
    {
      host_sub_id: 11,
      id: 101,
      is_online: 0,
      platform: 5,
      third_avatar: "https://example.com/drc.png",
      third_user_name: "德瑞可",
      uid: 9001,
    },
    {
      host_sub_id: 0,
      id: 102,
      is_online: 1,
      platform: 5,
      third_avatar: "https://example.com/ndt.png",
      third_user_name: "念都堂",
      uid: 9001,
    },
  ];
  const relations = [
    {
      platform: 5,
      sub_id: 1,
      uid: 9001,
      user_seat_id: 101,
    },
    {
      platform: 5,
      sub_id: 11,
      uid: 9001,
      user_seat_id: 101,
    },
    {
      platform: 5,
      sub_id: 12,
      uid: 9001,
      user_seat_id: 101,
    },
  ];
  const state = {
    deletedRelationSeatIds: [] as number[],
    insertedRelations: [] as Array<Record<string, unknown>>,
    subAccountValidationWheres: [] as Array<[string, string, unknown]>,
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_user_seat as seat") {
            return seats
              .filter((seat) => {
                const id = wheres.find(([column]) => column === "seat.id")?.[2];

                return id ? seat.id === id : true;
              })
              .map((seat) => ({
                avatarUrl: seat.third_avatar,
                host_sub_id: seat.host_sub_id,
                id: seat.id,
                is_online: seat.is_online,
                third_user_name: seat.third_user_name,
              }));
          }

          if (table === "xy_wap_embed_sub_user as sub_user") {
            state.subAccountValidationWheres = wheres;

            return subUsers
              .filter((subUser) => {
                if (subUser.status === 0) {
                  return false;
                }

                const idFilter = wheres.find(([column]) => column === "sub_user.id")?.[2];
                const typeFilter = wheres.find(([column]) => column === "sub_user.type")?.[2];

                if (
                  Array.isArray(idFilter) &&
                  !idFilter.includes(subUser.id)
                ) {
                  return false;
                }

                return typeFilter === undefined || subUser.type === typeFilter;
              })
              .map((subUser) => ({
                account: subUser.account,
                id: subUser.id,
                name: subUser.name,
                status: subUser.status,
                type: subUser.type,
              }));
          }

          if (table === "xy_wap_embed_user_seat_sub_relation as relation") {
            const seatId = wheres.find(([column]) => column === "relation.user_seat_id")?.[2];

            return [
              ...relations.filter((relation) =>
                !state.deletedRelationSeatIds.includes(relation.user_seat_id),
              ),
              ...state.insertedRelations,
            ]
              .filter((relation) => seatId === undefined || relation.user_seat_id === seatId)
              .map((relation) => {
                const subUser = subUsers.find((item) => item.id === relation.sub_id);
                const typeFilter = wheres.find(([column]) => column === "sub_user.type")?.[2];

                if (typeFilter !== undefined && subUser?.type !== typeFilter) {
                  return undefined;
                }

                return {
                  account: subUser?.account,
                  name: subUser?.name,
                  seat_id: relation.user_seat_id,
                  status: subUser?.status,
                  sub_id: relation.sub_id,
                  type: subUser?.type,
                };
              })
              .filter((relation): relation is NonNullable<typeof relation> => !!relation);
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
            const id = wheres.find(([column]) => column === "id")?.[2];

            return id
              ? subUsers.find((subUser) => subUser.id === id)
              : subUsers[0];
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            const id = wheres.find(([column]) => column === "seat.id")?.[2];
            const seat = seats.find((item) => item.id === id);

            return seat
              ? {
                  avatarUrl: seat.third_avatar,
                  host_sub_id: seat.host_sub_id,
                  id: seat.id,
                  is_online: seat.is_online,
                  third_user_name: seat.third_user_name,
                }
              : undefined;
          }

          throw new Error(`Unexpected executeTakeFirst table: ${table}`);
        },
        groupBy: () => builder,
        innerJoin: () => builder,
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
      if (table !== "xy_wap_embed_user_seat_sub_relation") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          state.insertedRelations = Array.isArray(values) ? values : [values];
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
        where: (column: string, _operator: string, value: unknown) => {
          if (column === "user_seat_id" && typeof value === "number") {
            state.deletedRelationSeatIds.push(value);
          }

          return builder;
        },
      };

      return builder;
    },
  };

  return state;
}

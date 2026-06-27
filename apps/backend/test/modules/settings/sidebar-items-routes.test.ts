import { describe, expect, it } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("settings sidebar item routes", () => {
  it("performs CRUD and sorting in the current tenant", async () => {
    const { app, authorization, db } = await createSettingsApp();

    const list = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/sidebar-items",
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      data: {
        items: [
          {
            bindTypes: ["1", "2"],
            id: "201",
            name: "企业名片",
            sort: 1,
            status: "active",
            url: "https://example.com/card",
          },
          {
            bindTypes: ["1", "2"],
            id: "202",
            name: "客户详情",
            sort: 2,
            status: "disabled",
            url: "https://example.com/customer",
          },
        ],
      },
      success: true,
    });
    expect(db.sidebarListWheres).toContainEqual(["uid", "=", 9001]);

    const create = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1", "2"],
        name: "素材中心",
        url: "https://example.com/assets",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      data: {
        bindTypes: ["1", "2"],
        id: "203",
        name: "素材中心",
        sort: 3,
        status: "active",
        url: "https://example.com/assets",
      },
      success: true,
    });
    expect(db.insertedSidebarItem).toMatchObject({
      biz_status: 1,
      bind_types: "1,2",
      name: "素材中心",
      platform: 5,
      show: 1,
      sort: 3,
      uid: 9001,
      url: "https://example.com/assets",
    });

    const update = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        bindTypes: ["2"],
        name: "客户详情",
        url: "https://example.com/customer-updated",
      },
      url: "/api/server/settings/sidebar-items/202",
    });
    const disable = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: { status: "disabled" },
      url: "/api/server/settings/sidebar-items/201/status",
    });
    const sort = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: { itemIds: ["203", "201", "202"] },
      url: "/api/server/settings/sidebar-items/sort",
    });
    const remove = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/settings/sidebar-items/202",
    });

    expect(update.statusCode).toBe(200);
    expect(disable.statusCode).toBe(200);
    expect(sort.statusCode).toBe(200);
    expect(remove.statusCode).toBe(200);
    expect(db.transactionExecutions).toBe(1);
    const sortUpdateTimes = db.updatedSidebarItems.slice(2, 5).map((item) =>
      item.values.update_time,
    );
    expect(new Set(sortUpdateTimes).size).toBe(1);
    expect(db.updatedSidebarItems).toEqual([
      {
        id: 202,
        values: {
          bind_types: "2",
          name: "客户详情",
          update_time: expect.any(Date),
          url: "https://example.com/customer-updated",
        },
      },
      {
        id: 201,
        values: {
          show: 0,
          update_time: expect.any(Date),
        },
      },
      {
        id: 203,
        values: {
          sort: 1,
          update_time: expect.any(Date),
        },
      },
      {
        id: 201,
        values: {
          sort: 2,
          update_time: expect.any(Date),
        },
      },
      {
        id: 202,
        values: {
          sort: 3,
          update_time: expect.any(Date),
        },
      },
      {
        id: 202,
        values: {
          biz_status: 0,
          update_time: expect.any(Date),
        },
      },
    ]);

    await app.close();
  });

  it("rejects sidebar items over the count and name limits", async () => {
    const { app, authorization, db } = await createSettingsApp();

    db.setSidebarItems(
      Array.from({ length: 10 }, (_, index) => ({
        biz_status: 1,
        id: index + 201,
        name: `页面${index + 1}`,
        platform: 5,
        show: 1,
        sort: index + 1,
        uid: 9001,
        url: `https://example.com/page-${index + 1}`,
      })),
    );

    const overCount = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1"],
        name: "页面11",
        url: "https://example.com/page-11",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(overCount.statusCode).toBe(400);
    expect(overCount.json()).toMatchObject({
      error: {
        code: "SIDEBAR_ITEM_LIMIT_EXCEEDED",
        message: "侧边栏页面最多添加 10 个",
      },
      success: false,
    });

    db.setSidebarItems([]);

    const overNameLength = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1", "2"],
        name: "超过四字了",
        url: "https://example.com/too-long",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(overNameLength.statusCode).toBe(400);
    expect(overNameLength.json()).toMatchObject({
      error: {
        code: "INVALID_SIDEBAR_ITEM_NAME",
        message: "页面名称最多 8 个字符",
      },
      success: false,
    });

    await app.close();
  });

  it("rejects invalid and non-HTTPS sidebar item URLs", async () => {
    const { app, authorization } = await createSettingsApp();

    const invalidUrl = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1"],
        name: "素材中心",
        url: "not-a-url",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(invalidUrl.statusCode).toBe(400);
    expect(invalidUrl.json()).toMatchObject({
      error: {
        code: "INVALID_SIDEBAR_URL",
        message: "请输入有效的页面地址",
      },
      success: false,
    });

    const httpUrl = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1"],
        name: "素材中心",
        url: "http://example.com/assets",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(httpUrl.statusCode).toBe(400);
    expect(httpUrl.json()).toMatchObject({
      error: {
        code: "INVALID_SIDEBAR_URL",
        message: "页面地址必须使用 HTTPS 协议",
      },
      success: false,
    });

    await app.close();
  });

  it("accepts safe bigint insert ids when creating sidebar items", async () => {
    const { app, authorization, db } = await createSettingsApp();

    db.nextInsertId = 203n;

    const create = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        bindTypes: ["1", "2"],
        name: "素材中心",
        url: "https://example.com/assets",
      },
      url: "/api/server/settings/sidebar-items",
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      data: {
        bindTypes: ["1", "2"],
        id: "203",
        name: "素材中心",
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
    uid: 9001,
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
      id: 1,
      platform: 5,
      status: 1,
      uid: 9001,
    },
  ];
  let sidebarItems = [
    {
      biz_status: 1,
      id: 201,
      name: "企业名片",
      platform: 5,
      show: 1,
      sort: 1,
      uid: 9001,
      url: "https://example.com/card",
    },
    {
      biz_status: 1,
      id: 202,
      name: "客户详情",
      platform: 5,
      show: 0,
      sort: 2,
      uid: 9001,
      url: "https://example.com/customer",
    },
  ];
  const state = {
    insertedSidebarItem: undefined as Record<string, unknown> | undefined,
    nextInsertId: 203 as bigint | number,
    sidebarListWheres: [] as Array<[string, string, unknown]>,
    updatedSidebarItems: [] as Array<{
      id: number | undefined;
      values: Record<string, unknown>;
    }>,
    transactionExecutions: 0,
    setSidebarItems: (items: typeof sidebarItems) => {
      sidebarItems = items;
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_sider_bar_config") {
            state.sidebarListWheres = wheres;

            return sidebarItems
              .filter((item) => item.biz_status !== 0)
              .sort((left, right) => left.sort - right.sort || left.id - right.id);
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
            return subUsers[0];
          }

          if (table === "xy_wap_embed_sider_bar_config") {
            const id = wheres.find(([column]) => column === "id")?.[2];
            const item = sidebarItems.find((sidebarItem) => sidebarItem.id === id);

            return item?.biz_status === 0 ? undefined : item;
          }

          throw new Error(`Unexpected executeTakeFirst table: ${table}`);
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
      if (table !== "xy_wap_embed_sider_bar_config") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        executeTakeFirstOrThrow: async () => ({ insertId: state.nextInsertId }),
        values: (values: Record<string, unknown>) => {
          state.insertedSidebarItem = values;
          sidebarItems.push({
            bind_types: String(values.bind_types ?? ""),
            biz_status: Number(values.biz_status),
            id: 203,
            name: String(values.name),
            platform: Number(values.platform),
            show: Number(values.show),
            sort: Number(values.sort),
            uid: Number(values.uid),
            url: String(values.url),
          });
          return builder;
        },
      };

      return builder;
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_sider_bar_config") {
        throw new Error(`Unexpected update table: ${table}`);
      }

      const wheres: Array<[string, string, unknown]> = [];
      let updateValues: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          const id = wheres.find(([column]) => column === "id")?.[2] as number | undefined;
          const item = sidebarItems.find((sidebarItem) => sidebarItem.id === id);

          if (item) {
            Object.assign(item, updateValues);
          }

          state.updatedSidebarItems.push({ id, values: updateValues });
          return [];
        },
        set: (values: Record<string, unknown>) => {
          updateValues = values;
          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
    transaction() {
      return {
        execute: async (callback: (trx: typeof state) => Promise<unknown>) => {
          state.transactionExecutions += 1;
          return callback(state);
        },
      };
    },
  };

  return state;
}

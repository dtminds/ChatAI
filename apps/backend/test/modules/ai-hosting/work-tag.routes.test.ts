import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

async function createAuthenticatedApp() {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: ["admin"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
    uid: 9001,
  });
  app.db = createKbReadDbMock() as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("ai-hosting work-tag routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;

  beforeEach(() => {
    app = undefined;
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    process.env.JAVA_INTERNAL_API_TOKEN = "java-token";
  });

  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it("lists work tag groups via Java API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            info: [
              {
                attr: 2,
                group_name: "会员等级组",
                id: 21,
                num: 3,
              },
              {
                attr: 1,
                group_name: "意向标签组",
                id: 11,
                num: 3,
              },
              {
                attr: 9,
                group_name: "无效",
                id: 99,
                num: 1,
              },
            ],
            tagLimit: 5,
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tag-groups",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        groups: [
          {
            attr: 1,
            id: 11,
            name: "意向标签组",
            tagCount: 3,
          },
          {
            attr: 2,
            id: 21,
            name: "会员等级组",
            tagCount: 3,
          },
        ],
        tagLimit: 5,
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://java.internal/third-internal/work-tag-group/get-work-tag-group-list",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      attr: 1,
      type: 0,
      uid: 9001,
    });
  });

  it("forwards attr/type when listing work tag groups", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            info: [
              {
                attr: 2,
                group_name: "会员等级组",
                id: 21,
                num: 3,
              },
            ],
            tagLimit: 1,
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tag-groups?attr=2&type=0",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({
      attr: 2,
      type: 0,
      uid: 9001,
    });
  });

  it("lists work tags via Java tag-component-list API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 2,
          error: 0,
          hasNext: false,
          list: [
            {
              groupAttr: 1,
              groupId: 11,
              groupName: "意向标签组",
              groupSort: 10,
              id: 111,
              name: "高意向",
              type: 0,
            },
            {
              groupAttr: 1,
              groupId: 11,
              groupName: "意向标签组",
              groupSort: 10,
              id: 112,
              name: "中意向",
              type: 0,
            },
          ],
          page: 1,
          pageSize: 100,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tags?groupId=11&type=0&page=1&pageSize=100&keyword=%E6%84%8F%E5%90%91",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        pagination: {
          hasNext: false,
          page: 1,
          pageSize: 100,
          total: 2,
        },
        tags: [
          expect.objectContaining({ id: 111, name: "高意向", groupId: 11 }),
          expect.objectContaining({ id: 112, name: "中意向", groupId: 11 }),
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/work-tag/tag-component-list");
    expect(JSON.parse(String(init?.body))).toEqual({
      groupId: 11,
      keyWord: "意向",
      page: 1,
      pageSize: 100,
      type: 0,
      uid: 9001,
    });
  });

  it("reads tag-component-list items from nested data.list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          data: {
            list: [
              {
                group_attr: 1,
                group_id: 11,
                group_name: "意向标签组",
                group_sort: 10,
                id: 111,
                name: "高意向",
                type: 0,
              },
            ],
          },
          error: 0,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tags?type=0",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        pagination: { total: 1 },
        tags: [expect.objectContaining({ id: 111, name: "高意向", groupId: 11 })],
      },
      success: true,
    });
  });

  it("prefers non-empty nested list when top-level list is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 3,
          data: {
            list: [
              {
                groupAttr: 1,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 111,
                name: "高意向",
                type: 0,
              },
              {
                groupAttr: 1,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 112,
                name: "中意向",
                type: 0,
              },
              {
                groupAttr: 1,
                groupId: 11,
                groupName: "意向标签组",
                groupSort: 10,
                id: 113,
                name: "低意向",
                type: 0,
              },
            ],
          },
          error: 0,
          list: [],
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tags?groupId=11&type=0",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        pagination: { total: 3 },
        tags: [
          expect.objectContaining({ id: 111, name: "高意向" }),
          expect.objectContaining({ id: 112, name: "中意向" }),
          expect.objectContaining({ id: 113, name: "低意向" }),
        ],
      },
      success: true,
    });
  });

  it("maps mall tags that only return id/name/groupName", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 2,
          error: 0,
          list: [
            {
              groupName: "分组名称 A",
              id: 28423,
              name: "饭饭批量打标签测试",
            },
            {
              groupName: "分组名称 A",
              id: 28424,
              name: "另一标签",
            },
          ],
          page: 1,
          pageSize: 100,
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/work-tags?type=12",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.tags).toHaveLength(2);
    expect(body.data.tags[0]).toMatchObject({
      groupName: "分组名称 A",
      id: 28423,
      name: "饭饭批量打标签测试",
      type: 12,
    });
    expect(body.data.tags[0].groupId).toBeGreaterThan(0);
    expect(body.data.tags[0].groupId).toBe(body.data.tags[1].groupId);
  });
});

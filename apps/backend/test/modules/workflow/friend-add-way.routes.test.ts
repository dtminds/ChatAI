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

describe("workflow friend-add-way routes", () => {
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

  it("lists friend add ways from the Java add-way catalog", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              children: [
                { key: "scan.mini_program", title: "小程序" },
                { key: "scan.group", title: "群二维码" },
                { key: "", title: "无效子项" },
              ],
              key: "scan",
              title: "扫描二维码",
            },
            {
              children: [],
              key: "search",
              title: "搜索手机号",
            },
            {
              key: null,
              title: "无效父级",
            },
          ],
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
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-ways",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        groups: [
          {
            children: [
              { key: "scan.mini_program", title: "小程序" },
              { key: "scan.group", title: "群二维码" },
            ],
            key: "scan",
            title: "扫描二维码",
          },
          {
            children: [],
            key: "search",
            title: "搜索手机号",
          },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/work-external-contact/add-way-list");
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer java-token",
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ uid: 9001 });
  });

  it("caps the catalog at the documented group bound", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: Array.from({ length: 201 }, (_, index) => ({
            children: [],
            key: `way-${index + 1}`,
            title: `来源 ${index + 1}`,
          })),
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
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-ways",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.groups).toHaveLength(200);
    expect(response.json().data.groups[0]).toEqual({
      children: [],
      key: "way-1",
      title: "来源 1",
    });
    expect(response.json().data.groups[199]).toEqual({
      children: [],
      key: "way-200",
      title: "来源 200",
    });
  });

  it("preserves the Java activity page cardinality", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 84,
          hasNext: true,
          list: [
            { addWayId: "live-61", createTime: 1_710_000_000, title: "活动 61" },
            ...Array.from({ length: 8 }, (_, index) => ({
              addWayId: `live-${index + 62}`,
              title: `活动 ${index + 62}`,
            })),
            { addWayId: "", title: "无效活动" },
          ],
          page: 7,
          pageSize: 10,
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
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-way-activities?key=1_1&page=7&pageSize=10",
    });

    expect(response.statusCode).toBe(200);
    const responseData = response.json().data;
    expect(responseData.items).toHaveLength(10);
    expect(responseData.items[0]).toEqual({
      addWayId: "live-61",
      createTime: 1_710_000_000_000,
      title: "活动 61",
    });
    expect(responseData.items[9]).toEqual({ addWayId: "", title: "无效活动" });
    expect(responseData.pagination).toEqual({
      hasNext: true,
      page: 7,
      pageSize: 10,
      total: 84,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/work-external-contact/get-add-way-activity");
    expect(JSON.parse(String(init?.body))).toEqual({
      key: "1_1",
      page: 7,
      pageSize: 10,
      uid: 9001,
    });
  });

  it("caps activity pageSize at the documented bound", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 50,
          hasNext: false,
          list: Array.from({ length: 50 }, (_, index) => ({
            addWayId: `live-${index + 1}`,
            title: `活动 ${index + 1}`,
          })),
          page: 1,
          pageSize: 50,
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
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-way-activities?key=scan&pageSize=200",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items).toHaveLength(50);
    expect(response.json().data.pagination).toEqual({
      hasNext: false,
      page: 1,
      pageSize: 50,
      total: 50,
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      pageSize: 50,
    });
  });

  it("rejects activity list requests without a key", async () => {
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-way-activities",
    });

    expect(response.statusCode).toBe(400);
  });

  it("maps Java authentication failures to bad gateway", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "service token expired" }), {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-ways",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "FRIEND_ADD_WAY_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      },
      success: false,
    });
  });

  it("does not expose Java failure details to the browser", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        error: 62001,
        errorMsg: "internal entitlement detail",
        success: false,
      }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: {
        authorization: created.authorization,
      },
      method: "GET",
      url: "/api/server/workflow/friend-add-ways",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: "FRIEND_ADD_WAY_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      },
      success: false,
    });
  });
});

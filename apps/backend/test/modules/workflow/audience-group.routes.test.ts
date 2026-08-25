import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE } from "@chatai/contracts";
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

describe("workflow audience-group routes", () => {
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

  it("forwards the requested page to Java and returns the current page only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        count: 25,
        error: 0,
        errorMsg: "",
        hasNext: true,
        list: [
          {
            conditions: "近30天消费大于1000",
            createType: 1,
            groupNum: 12,
            id: 301,
            name: "高价值客户",
            peopleCalculateTime: "2026-08-24 10:00:00",
          },
          {
            conditions: ["最近未下单", "流失风险"],
            createType: 2,
            groupNum: 3,
            id: 302,
            name: "沉默客户",
            peopleCalculateTime: "2026-08-24 11:00:00",
          },
          { id: 301, name: "重复" },
          { id: "303", name: "字符串 ID" },
          { id: 0, name: "无效" },
          { name: "缺 ID" },
        ],
        page: 2,
        pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
        success: true,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups?page=2&pageSize=20",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        groups: [
          {
            conditions: ["近30天消费大于1000"],
            createType: 1,
            groupNum: 12,
            id: 301,
            name: "高价值客户",
            peopleCalculateTime: "2026-08-24 10:00:00",
          },
          {
            conditions: ["最近未下单", "流失风险"],
            createType: 2,
            groupNum: 3,
            id: 302,
            name: "沉默客户",
            peopleCalculateTime: "2026-08-24 11:00:00",
          },
          { id: 303, name: "字符串 ID" },
        ],
        pagination: {
          hasNext: true,
          page: 2,
          pageSize: 20,
          total: 25,
        },
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/cdp-group-operate/list-group");
    expect(JSON.parse(String(init?.body))).toEqual({
      page: 2,
      pageSize: 20,
      uid: 9001,
      userType: 1,
    });
  });

  it("defaults to page 1 with pageSize 20 and does not follow hasNext", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        count: 40,
        error: 0,
        hasNext: true,
        list: [{ id: 1, name: "人群包 1" }],
        page: 1,
        pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
        success: true,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      page: 1,
      pageSize: 20,
      uid: 9001,
      userType: 1,
    });
    expect(response.json().data.pagination).toEqual({
      hasNext: true,
      page: 1,
      pageSize: 20,
      total: 40,
    });
  });

  it("clamps pageSize to 50 and caps the current page at that size", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        count: 80,
        error: 0,
        hasNext: true,
        list: Array.from({ length: 60 }, (_, index) => ({
          id: index + 1,
          name: `人群包 ${index + 1}`,
        })),
        page: 1,
        pageSize: 50,
        success: true,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups?page=1&pageSize=200",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      page: 1,
      pageSize: 50,
      uid: 9001,
      userType: 1,
    });
    const body = response.json() as {
      data: { groups: Array<{ id: number }>; pagination: { pageSize: number } };
    };
    expect(body.data.groups).toHaveLength(50);
    expect(body.data.groups[0]).toEqual({ id: 1, name: "人群包 1" });
    expect(body.data.groups[49]).toEqual({ id: 50, name: "人群包 50" });
    expect(body.data.pagination.pageSize).toBe(50);
  });

  it("always sends userType 1 and forwards a non-empty name to Java", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        count: 1,
        error: 0,
        hasNext: false,
        list: [{ id: 301, name: "高价值客户" }],
        page: 1,
        pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
        success: true,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups?page=1&pageSize=20&name=高价值客户",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      name: "高价值客户",
      page: 1,
      pageSize: 20,
      uid: 9001,
      userType: 1,
    });
  });

  it("omits empty name from the Java request body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        count: 1,
        error: 0,
        hasNext: false,
        list: [{ id: 1, name: "人群包 1" }],
        page: 1,
        pageSize: WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
        success: true,
      }),
    );

    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups?name=",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      page: 1,
      pageSize: 20,
      uid: 9001,
      userType: 1,
    });
  });

  it("rejects unauthenticated list requests", async () => {
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: expect.objectContaining({ code: "UNAUTHORIZED" }),
      success: false,
    });
  });

  it("returns 503 when the Java internal API is not configured", async () => {
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: expect.objectContaining({
        code: "CDP_GROUP_INTERNAL_API_NOT_CONFIGURED",
        message: "操作失败，请稍后重试",
      }),
      success: false,
    });
  });

  it("maps Java HTTP failures and business rejections to retryable list errors", async () => {
    const created = await createAuthenticatedApp();
    app = created.app;

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    const unauthorizedUpstream = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });
    expect(unauthorizedUpstream.statusCode).toBe(502);
    expect(unauthorizedUpstream.json()).toMatchObject({
      error: expect.objectContaining({
        code: "CDP_GROUP_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      }),
      success: false,
    });

    const httpFailure = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });
    expect(httpFailure.statusCode).toBe(502);
    expect(httpFailure.json()).toMatchObject({
      error: expect.objectContaining({
        code: "CDP_GROUP_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      }),
      success: false,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({
      error: 40001,
      errorMsg: "人群包查询失败",
      success: false,
    }));
    const rejected = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/audience-groups",
    });
    expect(rejected.statusCode).toBe(502);
    expect(rejected.json()).toMatchObject({
      error: expect.objectContaining({
        code: "CDP_GROUP_INTERNAL_API_FAILED",
        message: "操作失败，请稍后重试",
      }),
      success: false,
    });
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

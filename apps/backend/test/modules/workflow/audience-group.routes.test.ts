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
            createType: 1,
            groupNum: 12,
            id: 301,
            name: "高价值客户",
            peopleCalculateTime: "2026-08-24 10:00:00",
          },
          {
            createType: 2,
            groupNum: 3,
            id: 302,
            name: "沉默客户",
            peopleCalculateTime: "2026-08-24 11:00:00",
          },
          { id: 301, name: "重复" },
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
          { id: 301, name: "高价值客户" },
          { id: 302, name: "沉默客户" },
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
    });
    const body = response.json() as {
      data: { groups: Array<{ id: number }>; pagination: { pageSize: number } };
    };
    expect(body.data.groups).toHaveLength(50);
    expect(body.data.groups[0]).toEqual({ id: 1, name: "人群包 1" });
    expect(body.data.groups[49]).toEqual({ id: 50, name: "人群包 50" });
    expect(body.data.pagination.pageSize).toBe(50);
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

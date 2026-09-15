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
  return { app, authorization: `Bearer ${token}` };
}

describe("workflow marketing-plan routes", () => {
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

  it("forwards one-based pagination and planName while normalizing plan rows", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(javaSuccess({
      count: 25,
      hasNext: true,
      list: [
        { name: " 双十一触达 ", planId: 701, sendChannels: [1, 3, 3, 9], status: 0 },
        { name: "暂停计划", planId: "702", sendChannels: [3], status: 2 },
        { name: "无渠道", planId: 703, sendChannels: [], status: 0 },
        { name: "重复", planId: 701, sendChannels: [1], status: 0 },
      ],
      page: 2,
      pageSize: 20,
    }));
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/marketing-plans?page=2&pageSize=20&planName=双十一",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        pagination: { hasNext: true, page: 2, pageSize: 20, total: 25 },
        plans: [
          { name: "双十一触达", planId: 701, sendChannels: [1, 3], status: 0 },
          { name: "暂停计划", planId: 702, sendChannels: [3], status: 2 },
        ],
      },
      success: true,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://java.internal/third-internal/cdp-market-plan/list-plan");
    expect(init).toMatchObject({
      headers: expect.objectContaining({ authorization: "Bearer java-token" }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      page: 2,
      pageSize: 20,
      planName: "双十一",
      uid: 9001,
    });
  });

  it("defaults to page 1, clamps pageSize, and omits an empty planName", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(javaSuccess({
      count: 0,
      hasNext: false,
      list: [],
    }));
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/marketing-plans?page=0&pageSize=200&planName=",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      page: 1,
      pageSize: 50,
      uid: 9001,
    });
  });

  it("rejects unauthenticated requests", async () => {
    const created = await createAuthenticatedApp();
    app = created.app;
    const response = await app.inject({ method: "GET", url: "/api/server/workflow/marketing-plans" });
    expect(response.statusCode).toBe(401);
  });

  it.each([
    javaResponse({ error: 40001, errorMsg: "计划查询失败", success: false }),
    javaResponse({}),
    new Response(null, { status: 503 }),
  ])("maps Java failure to a bounded browser error", async (javaFailure) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(javaFailure);
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/workflow/marketing-plans",
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: { code: "CDP_MARKET_PLAN_INTERNAL_API_FAILED", message: "操作失败，请稍后重试" },
      success: false,
    });
  });
});

function javaSuccess(data: Record<string, unknown>) {
  return javaResponse({ ...data, error: 0, errorMsg: "", success: true });
}

function javaResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

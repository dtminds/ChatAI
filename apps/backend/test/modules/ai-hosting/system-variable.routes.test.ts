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

describe("ai-hosting system-variable routes", () => {
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

  it("lists system variables via Java available-system-variables API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { key: "last_handoff_time", name: "上一次转人工时间" },
            { key: "customer_nickname", name: "客户昵称" },
            { key: "", name: "无效" },
            { key: "current_agent_name", name: "当前接待 Agent" },
          ],
          error: 0,
          errorMsg: "",
          // 上游实测会带 success:false，即使 error:0 且有 data
          success: false,
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
      url: "/api/server/ai-hosting/system-variables",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        variables: [
          { key: "last_handoff_time", name: "上一次转人工时间" },
          { key: "customer_nickname", name: "客户昵称" },
          { key: "current_agent_name", name: "当前接待 Agent" },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://java.internal/third-internal/wap-embed-agent/available-system-variables",
    );
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer java-token",
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      uid: 9001,
    });
  });

  it("returns empty variables when Java data is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
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
      url: "/api/server/ai-hosting/system-variables",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { variables: [] },
      success: true,
    });
  });
});

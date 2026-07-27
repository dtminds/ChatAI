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

describe("ai-hosting cdp-tag routes", () => {
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

  it("lists cdp tag groups via Java list-tags API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              groupName: "价值标签",
              groupTag: "value_group",
              tags: [
                { name: "高价值", tag: "high_value" },
                { name: "", tag: "invalid" },
              ],
            },
            {
              groupName: "消费标签",
              groupTag: "consume_group",
              tags: [{ name: "复购", tag: "repurchase" }],
            },
            {
              groupName: "无效",
              groupTag: "",
              tags: [],
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
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/cdp-tag-groups",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        groups: [
          {
            groupName: "价值标签",
            groupTag: "value_group",
            tags: [{ name: "高价值", tag: "high_value" }],
          },
          {
            groupName: "消费标签",
            groupTag: "consume_group",
            tags: [{ name: "复购", tag: "repurchase" }],
          },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/cdp-tag/list-tags");
    expect(JSON.parse(String(init?.body))).toEqual({
      uid: 9001,
    });
  });

  it("returns empty groups when Java data is empty", async () => {
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
      url: "/api/server/ai-hosting/cdp-tag-groups",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { groups: [] },
      success: true,
    });
  });
});

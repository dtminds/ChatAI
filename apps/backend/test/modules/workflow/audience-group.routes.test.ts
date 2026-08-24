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

  it("lists audience groups via the Java CDP group list API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 301, name: "高价值客户" },
            { groupId: 302, groupName: "沉默客户" },
            { id: 301, name: "重复" },
            { id: 0, name: "无效" },
            { name: "缺 ID" },
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
      url: "/api/server/workflow/audience-groups",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        groups: [
          { id: 301, name: "高价值客户" },
          { id: 302, name: "沉默客户" },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/cdp-group-operate/list");
    expect(JSON.parse(String(init?.body))).toEqual({
      uid: 9001,
    });
  });

  it("caps the catalog at 200 valid groups in Java order", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            groups: Array.from({ length: 201 }, (_, index) => ({
              id: index + 1,
              name: `人群包 ${index + 1}`,
            })),
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
      url: "/api/server/workflow/audience-groups",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: { groups: Array<{ id: number; name: string }> };
    };
    expect(body.data.groups).toHaveLength(200);
    expect(body.data.groups[0]).toEqual({ id: 1, name: "人群包 1" });
    expect(body.data.groups[199]).toEqual({ id: 200, name: "人群包 200" });
  });
});

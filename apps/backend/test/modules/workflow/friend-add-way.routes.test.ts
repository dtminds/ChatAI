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
});

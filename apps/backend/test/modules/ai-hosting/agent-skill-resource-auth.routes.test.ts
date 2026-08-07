import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

async function createAuthenticatedApp(role = "admin") {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
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

describe("ai-hosting skill resource-auth routes", () => {
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

  it("reads resource authorization from user-limit-config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 1,
          error: null,
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
      url: "/api/server/ai-hosting/skills/resource-auth",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { authorized: true },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://java.internal/third-internal/user-limit-config/get-by-config-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      configKey: "chat_ai_xingyun_resource_authorization",
      uid: 9001,
    });
  });

  it("treats unset config value as unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 0,
          error: null,
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
      url: "/api/server/ai-hosting/skills/resource-auth",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { authorized: false },
      success: true,
    });
  });

  it("persists resource authorization through user-limit-config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
          error: null,
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
      method: "PUT",
      payload: { authorized: true },
      url: "/api/server/ai-hosting/skills/resource-auth",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { authorized: true },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://java.internal/third-internal/user-limit-config/set-by-config-key",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      configKey: "chat_ai_xingyun_resource_authorization",
      uid: 9001,
      value: 1,
    });
  });

  it("forbids operators from authorizing resources", async () => {
    const created = await createAuthenticatedApp("operator");
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "PUT",
      payload: { authorized: true },
      url: "/api/server/ai-hosting/skills/resource-auth",
    });

    expect(response.statusCode).toBe(403);
  });
});

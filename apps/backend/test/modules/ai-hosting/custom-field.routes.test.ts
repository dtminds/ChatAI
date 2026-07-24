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

describe("ai-hosting custom-field routes", () => {
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

  it("lists custom fields via Java select-list API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 2,
          error: 0,
          list: [
            {
              fieldId: 2,
              key: "level",
              optionInfoList: [{ optionMatch: "VIP", optionValue: 1 }],
              sort: 20,
              title: "客户等级",
              type: 2,
            },
            {
              fieldId: 1,
              key: "gender",
              optionInfoList: [],
              sort: 10,
              title: "性别",
              type: 1,
            },
            {
              fieldId: null,
              title: "无效字段",
              type: 1,
            },
          ],
          page: 1,
          pageSize: 20,
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
      url: "/api/server/ai-hosting/custom-fields?status=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        fields: [
          {
            id: 1,
            key: "gender",
            options: [],
            sort: 10,
            title: "性别",
            type: 1,
          },
          {
            id: 2,
            key: "level",
            options: [{ optionMatch: "VIP", optionValue: 1 }],
            sort: 20,
            title: "客户等级",
            type: 2,
          },
        ],
      },
      success: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/custom-field/select-list");
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        authorization: "Bearer java-token",
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      status: 1,
      uid: 9001,
    });
  });
});

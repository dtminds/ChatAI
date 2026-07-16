import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

async function createAuthenticatedApp(
  role: "admin" | "operator" | "owner" | "viewer" = "admin",
) {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
    uid: 9001,
  });
  app.db = createKbReadDbMock({
    agents: [
      {
        id: 10,
        prompt_config: "{}",
        status: 1,
        uid: 9001,
      },
    ],
  }) as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("ai-hosting agent-learning routes", () => {
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

  it("lists learning candidates via Java paginated API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          error: 0,
          list: [
            {
              agentAnswer: "原回答",
              aiReason: "推荐入库",
              createTime: "2026-07-16T15:12:04",
              customerQuestion: "原问题",
              id: "ENC-CANDIDATE-001",
              status: 0,
              suggestedAnswer: "精炼答案",
              suggestedQuestion: "精炼问题",
              userReason: "",
            },
          ],
          page: 1,
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
      url: "/api/server/ai-hosting/agents/10/learning-candidates?status=pending&page=1&pageSize=10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(body.data.candidates).toHaveLength(1);
    expect(body.data.candidates[0]).toMatchObject({
      answer: "精炼答案",
      id: "ENC-CANDIDATE-001",
      question: "精炼问题",
      rationale: "推荐入库",
      status: "pending",
    });
    expect(typeof body.data.candidates[0].createdAt).toBe("number");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://java.internal/third-internal/wap-embed-agent-learning/list");
    expect(init).toMatchObject({
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      agentId: 10,
      page: 1,
      pageSize: 10,
      status: 0,
      uid: 9001,
    });
  });

  it("approves a candidate with encrypted id via Java", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: true,
          message: "success",
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
      method: "POST",
      payload: {
        answer: "答案",
        question: "问题",
        targetDocId: "1001",
        targetKbId: "1",
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/ENC-CANDIDATE-001/approve",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { ok: true },
      success: true,
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      id: "ENC-CANDIDATE-001",
      targetDocId: 1001,
      targetKbId: 1,
      uid: 9001,
    });
  });
});

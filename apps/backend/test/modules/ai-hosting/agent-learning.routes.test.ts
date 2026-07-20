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
      {
        id: 11,
        prompt_config: "{}",
        status: 1,
        uid: 9001,
      },
    ],
    learningCandidates: [
      { agent_id: 10, id: 1001 },
      { agent_id: 11, id: 1002 },
      { agent_id: 10, id: 1003, uid: 9002 },
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
              confidence: 0.87,
              createTime: "2026-07-16T15:12:04",
              customerQuestion: "原问题",
              id: "1001",
              searchResults: [
                { docId: 1001, docName: "敏感肌护理", docSuffix: "faq.xlsx", kbId: 1 },
                { docId: "1001", docName: "重复文档", docSuffix: "pdf", kbId: "1" },
                { docId: 1002, docName: "油皮清洁", docSuffix: "pdf", kbId: 1 },
              ],
              status: 0,
              suggestedAnswer: "精炼答案",
              suggestedQuestion: "精炼问题",
              targetDocId: 1001,
              targetEntryId: 501,
              targetKbId: 1,
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
      confidence: 0.87,
      id: "1001",
      question: "精炼问题",
      rationale: "推荐入库",
      searchResults: [
        { docId: "1001", docName: "敏感肌护理", docSuffix: "faq.xlsx", kbId: "1" },
        { docId: "1002", docName: "油皮清洁", docSuffix: "pdf", kbId: "1" },
      ],
      status: "pending",
      targetDocId: "1001",
      targetEntryId: "501",
      targetKbId: "1",
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

  it("loads valid search details and omits entries without chunk targets", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: [
            {
              chunkId: 1024,
              chunkTitle: "25+的油皮痘肌如果皮肤不敏感，有什么护肤产品推荐？",
              content: "25+的油皮痘肌如果皮肤不敏感，可以使用酸C循环套组",
              docId: 102,
              docName: "护肤Q&A文档",
              docSuffix: "pdf",
              docType: 2,
              kbId: 5,
              kbName: "护肤知识库",
              score: 0.5689,
              volcChunkId: "doc_id_272_102_20260717105032070-6",
            },
            {
              chunkId: 1025,
              docId: 102,
              docType: 2,
              kbId: 5,
              score: 0.4,
              volcChunkId: " ",
            },
            {
              chunkId: 1026,
              docId: 102,
              docType: 2,
              kbId: 5,
              score: 0.3,
            },
          ],
          message: "success",
          page: 1,
          pageSize: 20,
          total: 3,
          totalPage: 1,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const created = await createAuthenticatedApp("viewer");
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1001/search-detail",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        items: [
          {
            chunkId: "1024",
            chunkTitle: "25+的油皮痘肌如果皮肤不敏感，有什么护肤产品推荐？",
            content: "25+的油皮痘肌如果皮肤不敏感，可以使用酸C循环套组",
            docId: "102",
            docName: "护肤Q&A文档",
            docSuffix: "pdf",
            docType: 2,
            kbId: "5",
            kbName: "护肤知识库",
            score: 0.5689,
            volcChunkId: "doc_id_272_102_20260717105032070-6",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 3,
          totalPages: 1,
        },
      },
      success: true,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-learning/search-detail",
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      id: 1001,
      uid: 9001,
    });
  });

  it("rejects search details outside the route agent scope without calling Java", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1002/search-detail",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("approves a numeric candidate in the route agent scope", async () => {
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
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1001/approve",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { ok: true },
      success: true,
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      id: "1001",
      targetDocId: 1001,
      targetKbId: 1,
      uid: 9001,
    });
  });

  it("rejects a candidate that belongs to another agent without calling Java", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {
        answer: "答案",
        question: "问题",
        targetDocId: "1001",
        targetKbId: "1",
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1002/approve",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects ignoring a candidate that belongs to another agent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {},
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1002/reject",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a candidate that belongs to another tenant", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {},
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1003/reject",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a batch containing candidates outside the route agent scope", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {
        ids: ["1001", "1002"],
        targetDocId: "1001",
        targetKbId: "1",
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/batch-approve",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects batch ignoring candidates outside the route agent scope", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {
        ids: ["1001", "1002"],
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/batch-reject",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects blank candidate content after trimming", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {
        answer: "\n",
        question: "   ",
        targetDocId: "1001",
        targetKbId: "1",
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1001/approve",
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("trims candidate content before forwarding to Java", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const created = await createAuthenticatedApp();
    app = created.app;

    const response = await app.inject({
      headers: { authorization: created.authorization },
      method: "POST",
      payload: {
        answer: "  答案  ",
        question: "  问题  ",
        targetDocId: "1001",
        targetKbId: "1",
      },
      url: "/api/server/ai-hosting/agents/10/learning-candidates/1001/approve",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toMatchObject({
      answer: "答案",
      question: "问题",
    });
  });
});

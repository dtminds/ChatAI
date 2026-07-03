import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

describe("KB read routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("creates a kb for the current tenant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: 88,
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        description: "用于新品上市培训",
        name: "新品培训知识",
      },
      url: "/api/server/ai-hosting/kbs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        kbId: "88",
      },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb/create",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      name: "新品培训知识",
      operatorId: "101",
      remark: "用于新品上市培训",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("updates a kb for the current tenant", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        description: "更新后的描述",
        name: "更新后的知识库",
      },
      url: "/api/server/ai-hosting/kbs/1/update",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        updated: true,
      },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb/update",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: 1,
      lastOperatorId: "101",
      name: "更新后的知识库",
      remark: "更新后的描述",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("reports when a kb still has documents before delete", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/1/delete-check",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        hasDocuments: true,
      },
      success: true,
    });
  });

  it("rejects deleting a kb that still has documents", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kbs/1/delete",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "KB_DELETE_HAS_DOCUMENTS",
        message: "请先删除所有文档后，再删除知识库",
      },
      success: false,
    });
  });

  it("deletes an empty kb through the Java internal API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: true,
          error: 0,
          errorMsg: "",
          success: true,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    const context = await createAuthenticatedKbApp({ includeSecondKbWithoutDocs: true });
    app = context.app;

    const checkResponse = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/2/delete-check",
    });

    expect(checkResponse.statusCode).toBe(200);
    expect(checkResponse.json()).toEqual({
      data: {
        hasDocuments: false,
      },
      success: true,
    });

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kbs/2/delete",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        deleted: true,
      },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb/del",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: 2,
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("lists kbs scoped by uid", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        kbs: [
          {
            createdAt: "2026-06-19T06:02:22.000Z",
            description: "华为各系列产品规格、功能与常见问题",
            kbId: "1",
            name: "华为产品知识",
            updatedAt: "2026-06-20T06:02:22.000Z",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
        },
      },
      success: true,
    });
  });

  it("uses the authenticated uid without resolving the sub user for kb lists", async () => {
    const subUserLookups: string[] = [];
    const context = await createAuthenticatedKbApp({
      beforeExecute: ({ table }) => {
        if (table === "xy_wap_embed_sub_user") {
          subUserLookups.push(table);
        }
      },
    });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs",
    });

    expect(response.statusCode).toBe(200);
    expect(subUserLookups).toEqual([]);
  });

  it("rejects kb list queries longer than 32 characters", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: `/api/server/ai-hosting/kbs?query=${"a".repeat(33)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "搜索关键词不能超过 32 个字符",
      },
      success: false,
    });
  });

  it("rejects kb doc list queries longer than 32 characters", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: `/api/server/ai-hosting/kbs/1/docs?query=${"a".repeat(33)}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "搜索关键词不能超过 32 个字符",
      },
      success: false,
    });
  });

  it("lists docs and chunks for the current tenant", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 2,
          error: 0,
          list: [
            {
              content: "切片正文",
              createTime: "2026-06-18 15:22:22",
              docId: 1001,
              id: 501,
              kbId: 1,
              source: 1,
              title: "切片标题",
              type: 2,
              uid: 9001,
              updateTime: "2026-06-18 15:22:22",
            },
            {
              content: "系统切片正文",
              createTime: "2026-06-18 15:22:22",
              docId: 1001,
              id: 502,
              kbId: 1,
              source: 2,
              title: "系统切片",
              type: 2,
              uid: 9001,
              updateTime: "2026-06-18 15:22:22",
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

    const docs = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/1/docs",
    });
    const chunks = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kb-docs/1001/chunks?docType=document",
    });

    expect(docs.statusCode).toBe(200);
    const docsBody = docs.json();
    expect(docsBody.success).toBe(true);
    expect(docsBody.data.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 3,
    });
    expect(docsBody.data).not.toHaveProperty("quota");
    expect(docsBody.data.docs[0]).toMatchObject({
      docId: "1001",
      docType: "document",
      name: "产品说明大全",
    });
    expect(chunks.statusCode).toBe(200);
    expect(chunks.json()).toEqual({
      data: {
        chunks: [
          {
            chunkId: "501",
            chunkType: "text",
            content: "切片正文",
            createdAt: "2026-06-18 15:22:22",
            docId: "1001",
            kbId: "1",
            source: "manual",
            title: "切片标题",
            updatedAt: "2026-06-18 15:22:22",
          },
          {
            chunkId: "502",
            chunkType: "text",
            content: "系统切片正文",
            createdAt: "2026-06-18 15:22:22",
            docId: "1001",
            kbId: "1",
            source: "system",
            title: "系统切片",
            updatedAt: "2026-06-18 15:22:22",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 2,
        },
      },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/page",
    );
    fetchMock.mockRestore();
  });

  it("forwards document chunk content filter to Java", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 0,
          error: 0,
          list: [],
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

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kb-docs/1001/chunks?docType=document&content=%E7%B3%BB%E7%BB%9F",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "系统",
      docId: 1001,
      page: 1,
      pageSize: 10,
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("forwards FAQ chunk title filter to Java", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 0,
          error: 0,
          list: [],
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

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kb-docs/1004/chunks?docType=qa&title=%E7%89%A9%E6%B5%81",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      docId: 1004,
      page: 1,
      pageSize: 10,
      title: "物流",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("returns not found for another tenant kb", async () => {
    const context = await createAuthenticatedKbApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/999",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "KB_NOT_FOUND",
      },
      success: false,
    });
  });
});

async function createAuthenticatedKbApp(
  options: Parameters<typeof createKbReadDbMock>[0] = {},
) {
  process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: ["admin"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
    uid: 9001,
  });

  app.db = createKbReadDbMock(options) as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

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
        kbId: "2",
      },
      success: true,
    });
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
            createdAt: "2026-06-19T14:02:22.000Z",
            description: "华为各系列产品规格、功能与常见问题",
            kbId: "1",
            name: "华为产品知识",
            updatedAt: "2026-06-20T14:02:22.000Z",
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
              createTime: "2026-06-18T15:22:22.000Z",
              docId: 1001,
              id: 501,
              kbId: 1,
              source: 1,
              title: "切片标题",
              type: 2,
              uid: 9001,
              updateTime: "2026-06-18T15:22:22.000Z",
            },
            {
              content: "系统切片正文",
              createTime: "2026-06-18T15:22:22.000Z",
              docId: 1001,
              id: 502,
              kbId: 1,
              source: 2,
              title: "系统切片",
              type: 2,
              uid: 9001,
              updateTime: "2026-06-18T15:22:22.000Z",
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
      url: "/api/server/ai-hosting/kb-docs/1001/chunks",
    });

    expect(docs.statusCode).toBe(200);
    const docsBody = docs.json();
    expect(docsBody.success).toBe(true);
    expect(docsBody.data.pagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
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
            createdAt: "2026-06-18T15:22:22.000Z",
            docId: "1001",
            kbId: "1",
            source: "manual",
            title: "切片标题",
            updatedAt: "2026-06-18T15:22:22.000Z",
          },
          {
            chunkId: "502",
            chunkType: "text",
            content: "系统切片正文",
            createdAt: "2026-06-18T15:22:22.000Z",
            docId: "1001",
            kbId: "1",
            source: "system",
            title: "系统切片",
            updatedAt: "2026-06-18T15:22:22.000Z",
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

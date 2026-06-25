import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

function mockJavaChunkFetch(payload: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
}

async function createAuthenticatedApp(role: "admin" | "operator" | "owner" | "viewer" = "admin") {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
  });
  app.db = createKbReadDbMock() as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("ai-hosting kb-chunk routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;

  beforeEach(() => {
    app = undefined;
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("adds a text chunk via Java", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: 601,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkType: "text",
        content: "切片正文",
        docId: "1001",
        title: "切片标题",
      },
      url: "/api/server/ai-hosting/kb-chunks",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { chunkId: "601" },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/add",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      chunkType: "text",
      content: "切片正文",
      docId: 1001,
      operatorId: "101",
      title: "切片标题",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("rejects whitespace-only chunk content on create", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: 601,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkType: "text",
        content: "   ",
        docId: "1001",
        title: "切片标题",
      },
      url: "/api/server/ai-hosting/kb-chunks",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_KB_CHUNK_CONTENT",
        message: "切片内容不能为空",
      },
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects manual chunk creation for image docs", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkType: "text",
        content: "图片说明",
        docId: "1002",
        title: "图片标题",
      },
      url: "/api/server/ai-hosting/kb-chunks",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_KB_CHUNK_TYPE",
      },
      success: false,
    });
  });

  it("updates a manual chunk via Java", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        content: "更新后的正文",
        title: "更新后的标题",
      },
      url: "/api/server/ai-hosting/kb-chunks/501/update",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { updated: true },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/update",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      content: "更新后的正文",
      id: 501,
      operatorId: "101",
      title: "更新后的标题",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("rejects whitespace-only chunk content on update", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        content: "   ",
        title: "更新后的标题",
      },
      url: "/api/server/ai-hosting/kb-chunks/501/update",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_KB_CHUNK_CONTENT",
        message: "切片内容不能为空",
      },
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects system chunk updates before calling Java", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        content: "尝试编辑",
        title: "系统切片",
      },
      url: "/api/server/ai-hosting/kb-chunks/502/update",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "KB_CHUNK_NOT_EDITABLE",
        message: "系统切片不可编辑",
      },
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("deletes a chunk via Java", async () => {
    const fetchMock = mockJavaChunkFetch({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-chunks/501/delete",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { deleted: true },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/del",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        id: 501,
        operatorId: "101",
        uid: 9001,
      }),
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
      method: "POST",
    });
    fetchMock.mockRestore();
  });
});

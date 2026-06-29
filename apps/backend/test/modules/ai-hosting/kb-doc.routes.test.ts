import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

const uploadCredential = {
  allowPerfixs: ["kb-docs/"],
  bucket: "examplebucket-1250000000",
  credentials: {
    sessionToken: "session-token",
    tmpSecretId: "tmp-secret-id",
    tmpSecretKey: "tmp-secret-key",
    token: "token",
  },
  expiration: "2026-05-13T12:00:00Z",
  expiredTime: 1778673600,
  region: "ap-guangzhou",
  requestId: "request-001",
  startTime: 1778670000,
};

function mockJavaUploadCredentialFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        data: uploadCredential,
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
}

function mockJavaKbDocCreateFetch(docId = 1001) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        data: docId,
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
}

async function createAuthenticatedApp(
  role: "admin" | "operator" | "owner" | "viewer" = "admin",
  dbOptions: Parameters<typeof createKbReadDbMock>[0] = {},
) {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
    uid: 9001,
  });
  app.db = createKbReadDbMock(dbOptions) as never;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("ai-hosting kb-doc routes", () => {
  let app: Awaited<ReturnType<typeof buildMockedApp>> | undefined;

  beforeEach(() => {
    app = undefined;
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    process.env.PLAYABLE_MEDIA_HOST = "b5.bokr.com.cn";
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("returns upload credentials without requiring a conversation", async () => {
    const fetchMock = mockJavaUploadCredentialFetch();
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/upload-credential",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: uploadCredential,
      success: true,
    });
    fetchMock.mockRestore();
  });

  it("creates a document via Java with strategy key", async () => {
    const fetchMock = mockJavaKbDocCreateFetch(3001);
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSize: 1024,
        docSuffix: "pdf",
        docUrl: "kb-docs/demo.pdf",
        kbId: "1",
        name: "产品手册",
        parseMode: "standard",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        docId: "3001",
      },
      success: true,
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "volcStrategyResourceId=kb-strategy-233abb0cd67b8429",
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "docUrl=https%3A%2F%2Fb5.bokr.com.cn%2Fkb-docs%2Fdemo.pdf",
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("docSize=1024");
    fetchMock.mockRestore();
  });

  it("creates FAQ docs with the init strategy id", async () => {
    const fetchMock = mockJavaKbDocCreateFetch(3002);
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        docSuffix: "faq.xlsx",
        docSize: 2048,
        docUrl: "kb/upload/2026/06/24/272/1782294357364-iswksm6u.faq.xlsx",
        kbId: "1",
        name: "Q&A问答对示例.faq",
      },
      url: "/api/server/ai-hosting/kb-docs/create-faq",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        docId: "3002",
      },
      success: true,
    });

    const javaFormBody = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(javaFormBody).toContain("uid=9001");
    expect(javaFormBody).toContain("kbId=1");
    expect(javaFormBody).toContain("docType=1");
    expect(javaFormBody).toContain("docSuffix=faq.xlsx");
    expect(javaFormBody).toContain("docSize=2048");
    expect(javaFormBody).toContain("operatorId=101");
    expect(javaFormBody).toContain(
      "docUrl=https%3A%2F%2Fb5.bokr.com.cn%2Fkb%2Fupload%2F2026%2F06%2F24%2F272%2F1782294357364-iswksm6u.faq.xlsx",
    );
    expect(javaFormBody).toContain(
      "volcStrategyResourceId=kb-strategy-def92e30c1456c07",
    );
    fetchMock.mockRestore();
  });

  it("rejects creating docs when tenant document storage quota would be exceeded", async () => {
    const fetchMock = mockJavaKbDocCreateFetch(3009);
    const context = await createAuthenticatedApp("admin", {
      docSizeBytes: [1024 * 1024 * 1024 - 512],
    });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSize: 1024,
        docSuffix: "pdf",
        docUrl: "kb-docs/over-limit.pdf",
        kbId: "1",
        name: "超额文档",
        parseMode: "standard",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "KB_DOC_QUOTA_EXCEEDED",
        message: "知识库存储空间已达上限",
      },
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("creates image docs with the init strategy id", async () => {
    const fetchMock = mockJavaKbDocCreateFetch(3003);
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        description: "晨间护肤套装商品主图",
        docSize: 4096,
        docSuffix: "png",
        docUrl: "kb-images/demo.png",
        kbId: "1",
        name: "商品主图",
      },
      url: "/api/server/ai-hosting/kb-docs/create-image",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        docId: "3003",
      },
      success: true,
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("docType=3");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("docSize=4096");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "volcStrategyResourceId=kb-strategy-def92e30c1456c07",
    );
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "docUrl=https%3A%2F%2Fb5.bokr.com.cn%2Fkb-images%2Fdemo.png",
    );
    fetchMock.mockRestore();
  });

  it("deletes a kb doc via Java", async () => {
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
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/1001/delete",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        deleted: true,
      },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-doc/del",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        id: 1001,
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

  it("rejects enhanced parsing for plain text documents", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSize: 1024,
        docSuffix: "txt",
        docUrl: "kb-docs/demo.txt",
        kbId: "1",
        name: "说明",
        parseMode: "enhanced",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_KB_DOC_PARSE_MODE",
      },
      success: false,
    });
  });

  it("forbids viewer accounts", async () => {
    mockJavaUploadCredentialFetch();
    const context = await createAuthenticatedApp("viewer");
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/upload-credential",
    });

    expect(response.statusCode).toBe(403);
  });
});

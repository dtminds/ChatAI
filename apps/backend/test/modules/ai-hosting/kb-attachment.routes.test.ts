import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";
import { createKbReadDbMock } from "../../helpers/create-kb-read-db-mock.js";

function mockJavaFetch(payload: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
}

async function createAuthenticatedApp(
  role: "admin" | "operator" | "owner" | "viewer" = "admin",
  dbOptions?: Parameters<typeof createKbReadDbMock>[0],
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

describe("ai-hosting kb-attachment routes", () => {
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

  it("initializes attachment doc idempotently", async () => {
    const fetchMock = mockJavaFetch({
      data: 1005,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp("admin", { includeAttachmentDoc: true });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kbs/1/attachments/init",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        docId: "1005",
        initialized: true,
        status: "completed",
      },
      success: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("returns not initialized for attachment list without attachment doc", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/1/attachments?attachmentType=3",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "KB_ATTACHMENT_NOT_INITIALIZED",
      },
      success: false,
    });
  });

  it("lists attachments via Java", async () => {
    const fetchMock = mockJavaFetch({
      count: 1,
      error: 0,
      list: [
        {
          attachmentContent: {
            content: {
              fileName: "产品说明书.pdf",
              fileSizeLabel: "2.00 MB",
              fileUrl: "https://example.com/manual.pdf",
            },
            materialCollectionId: "mc-1",
            msgInfoId: "msg-1",
            type: "file",
          },
          attachmentType: 3,
          content: "附件描述",
          createTime: "2026-06-18 15:22:22",
          docId: 1005,
          id: 503,
          kbId: 1,
          source: 1,
          title: "产品说明书.pdf",
          type: 2,
          uid: 9001,
          updateTime: "2026-06-18 15:22:22",
        },
      ],
      page: 1,
      pageSize: 20,
      success: true,
    });
    const context = await createAuthenticatedApp("viewer", { includeAttachmentDoc: true });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "GET",
      url: "/api/server/ai-hosting/kbs/1/attachments?attachmentType=3&query=产品",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        attachments: [
          expect.objectContaining({
            attachmentType: 3,
            chunkId: "503",
            description: "附件描述",
            fileSizeLabel: "2.00 MB",
            title: "产品说明书.pdf",
          }),
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 1,
        },
      },
      success: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      attachmentType: 3,
      content: "产品",
      docId: 1005,
      page: 1,
      pageSize: 20,
      title: "产品",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("creates attachment via Java with attachmentContent object", async () => {
    const fetchMock = mockJavaFetch({
      data: 503,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp("admin", { includeAttachmentDoc: true });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        attachmentContent: {
          content: {
            fileName: "产品说明书.pdf",
            fileSizeLabel: "2.00 MB",
            fileUrl: "https://example.com/manual.pdf",
          },
          materialCollectionId: "mc-1",
          msgInfoId: "msg-1",
          type: "file",
        },
        attachmentType: 3,
        description: "附件描述",
      },
      url: "/api/server/ai-hosting/kbs/1/attachments",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { chunkId: "503" },
      success: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      attachmentContent: {
        content: {
          fileName: "产品说明书.pdf",
          fileSizeLabel: "2.00 MB",
          fileUrl: "https://example.com/manual.pdf",
        },
        materialCollectionId: "mc-1",
        msgInfoId: "msg-1",
        type: "file",
      },
      attachmentType: 3,
      chunkType: "text",
      content: "附件描述",
      docId: 1005,
      operatorId: "101",
      title: "产品说明书.pdf",
      uid: 9001,
    });
    fetchMock.mockRestore();
  });

  it("rejects write routes for viewer role", async () => {
    const context = await createAuthenticatedApp("viewer", { includeAttachmentDoc: true });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        attachmentContent: {
          content: {
            fileName: "产品说明书.pdf",
            fileUrl: "https://example.com/manual.pdf",
          },
          materialCollectionId: "mc-1",
          msgInfoId: "msg-1",
          type: "file",
        },
        attachmentType: 3,
        description: "附件描述",
      },
      url: "/api/server/ai-hosting/kbs/1/attachments",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
      },
      success: false,
    });
  });

  it("deletes attachment via Java", async () => {
    const fetchMock = mockJavaFetch({
      data: true,
      error: 0,
      errorMsg: "",
      success: true,
    });
    const context = await createAuthenticatedApp("admin", { includeAttachmentDoc: true });
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-attachments/503/delete",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: { deleted: true },
      success: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://java.internal/third-internal/wap-embed-agent-kb-chunk/del",
    );
    fetchMock.mockRestore();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app.js";

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

async function createAuthenticatedApp(role: "admin" | "operator" | "owner" | "viewer" = "admin") {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
  });
  app.db = createSessionDbMock({
    id: "501",
    session_version: 1,
    sub_user_id: "101",
    subUser: {
      account: "agent001",
      id: 101,
      name: "客服一号",
      platform: 1,
      role: "operator",
      type: 2,
      uid: 9001,
    },
  });

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

function createSessionDbMock(session: {
  id: string;
  session_version: number;
  sub_user_id: string;
  subUser?: {
    account: string;
    id: number;
    name: string;
    platform: number;
    role: string;
    type: number;
    uid: number;
  };
}) {
  return {
    selectFrom(table: string) {
      if (
        table !== "xy_wap_embed_sub_user_session" &&
        table !== "xy_wap_embed_sub_user"
      ) {
        throw new Error(`Unexpected select table: ${table}`);
      }

      const builder = {
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user") {
            return session.subUser;
          }

          return {
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            id: session.id,
            refresh_token_hash: "dev-refresh-token-hash",
            revoked_at: null,
            session_version: session.session_version,
            sub_user_id: session.sub_user_id,
          };
        },
        orderBy: () => builder,
        select: () => builder,
        where: () => builder,
      };

      return builder;
    },
  } as never;
}

describe("ai-hosting kb-doc routes", () => {
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/file/get-upload-credential",
      expect.objectContaining({
        body: JSON.stringify({ type: "kb", uid: 9001 }),
        method: "POST",
      }),
    );
    fetchMock.mockRestore();
  });

  it("creates a kb doc via backend mapping without calling Java", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSuffix: "pdf",
        docUrl: "kb-docs/W7zU2fWkVSp65OTAjDd3-w/demo.pdf",
        kbId: "W7zU2fWkVSp65OTAjDd3-w",
        name: "产品手册",
        parseMode: "standard",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        docId: expect.any(String),
      },
      success: true,
    });
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
        docSuffix: "txt",
        docUrl: "kb-docs/W7zU2fWkVSp65OTAjDd3-w/demo.txt",
        kbId: "W7zU2fWkVSp65OTAjDd3-w",
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

  it("accepts document suffixes with a leading dot", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSuffix: ".pdf",
        docUrl: "kb-docs/W7zU2fWkVSp65OTAjDd3-w/demo.pdf",
        kbId: "W7zU2fWkVSp65OTAjDd3-w",
        name: "产品手册",
        parseMode: "standard",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(200);
  });

  it("rejects sub-user ids with trailing non-digit characters", async () => {
    const mockedApp = await buildMockedApp();
    app = mockedApp;
    const authorization = `Bearer ${mockedApp.jwt.sign({
      roles: ["admin"],
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "101abc",
    })}`;
    mockedApp.db = createSessionDbMock({
      id: "501",
      session_version: 1,
      sub_user_id: "101abc",
      subUser: {
        account: "agent001",
        id: 101,
        name: "客服一号",
        platform: 1,
        role: "operator",
        type: 2,
        uid: 9001,
      },
    });

    const response = await mockedApp.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/upload-credential",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "SUB_USER_NOT_FOUND",
      },
      success: false,
    });
  });

  it("rejects unsupported document suffixes", async () => {
    const context = await createAuthenticatedApp();
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      payload: {
        chunkParams: { maxLength: 2000, strategy: "length" },
        chunkStrategy: "length",
        docSuffix: "zip",
        docUrl: "kb-docs/W7zU2fWkVSp65OTAjDd3-w/demo.zip",
        kbId: "W7zU2fWkVSp65OTAjDd3-w",
        name: "资料包",
        parseMode: "standard",
      },
      url: "/api/server/ai-hosting/kb-docs/create",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "INVALID_KB_DOC_SUFFIX",
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

  it("forbids operator accounts", async () => {
    mockJavaUploadCredentialFetch();
    const context = await createAuthenticatedApp("operator");
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/upload-credential",
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows owner accounts", async () => {
    const fetchMock = mockJavaUploadCredentialFetch();
    const context = await createAuthenticatedApp("owner");
    app = context.app;

    const response = await app.inject({
      headers: { authorization: context.authorization },
      method: "POST",
      url: "/api/server/ai-hosting/kb-docs/upload-credential",
    });

    expect(response.statusCode).toBe(200);
    fetchMock.mockRestore();
  });
});

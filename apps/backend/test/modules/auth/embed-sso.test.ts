import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../src/app.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../../../src/modules/auth/auth-cookies.js";
import { SMP_EMBED_AES_DECRYPT_PATH } from "../../../src/modules/auth/smp-embed-decrypt-port.js";

describe("embed SSO", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    process.env.JAVA_INTERNAL_API_TOKEN = "internal-token";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
    delete process.env.JWT_DEV_SECRET;
    delete process.env.NODE_ENV;
  });

  it("creates a session when decrypted id and uid match an active account", async () => {
    stubDecrypt({
      "enc-id": "101",
      "enc-uid": "9001",
    });
    const app = await buildApp();
    app.db = createEmbedAuthDbMock({
      id: 101,
      name: "营销画布账号",
      type: 0,
      uid: 9001,
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        id: "enc-id",
        uid: "enc-uid",
      },
      url: "/api/auth/embed-sso",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        accessToken: expect.any(String),
        expiresIn: 1200,
        subUser: {
          displayName: "营销画布账号",
          subUserId: "101",
          uid: 9001,
        },
      },
      success: true,
    });
    expect(response.json().data.accessToken).toBe(
      readSetCookieValue(response, ACCESS_TOKEN_COOKIE_NAME),
    );
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=`),
        expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=`),
      ]),
    );

    const decoded = app.jwt.verify(readSetCookieValue(response, ACCESS_TOKEN_COOKIE_NAME));
    expect(decoded).toMatchObject({
      sessionId: "501",
      subUserId: "101",
      uid: 9001,
    });

    await app.close();
  });

  it("rejects decrypted tickets that do not match the account uid", async () => {
    stubDecrypt({
      "enc-id": "101",
      "enc-uid": "9002",
    });
    const app = await buildApp();
    app.db = createEmbedAuthDbMock({
      id: 101,
      name: "营销画布账号",
      type: 0,
      uid: 9001,
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        id: "enc-id",
        uid: "enc-uid",
      },
      url: "/api/auth/embed-sso",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "EMBED_SSO_REJECTED" },
      success: false,
    });

    await app.close();
  });

  it("decrypts id and uid separately", async () => {
    const fetchMock = stubDecrypt({
      "enc-id": "101",
      "enc-uid": "9001",
    });
    const app = await buildApp();
    app.db = createEmbedAuthDbMock({
      id: 101,
      name: "营销画布账号",
      type: 0,
      uid: 9001,
    });

    await app.inject({
      method: "POST",
      payload: {
        id: "enc-id",
        uid: "enc-uid",
      },
      url: "/api/auth/embed-sso",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url, init]) => ({
      body: JSON.parse(String(init && "body" in init ? init.body : "{}")),
      url,
    }))).toEqual(expect.arrayContaining([
      {
        body: { content: "enc-id" },
        url: `https://java.internal${SMP_EMBED_AES_DECRYPT_PATH}`,
      },
      {
        body: { content: "enc-uid" },
        url: `https://java.internal${SMP_EMBED_AES_DECRYPT_PATH}`,
      },
    ]));

    await app.close();
  });
});

function stubDecrypt(values: Record<string, string>) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { content?: string };
    const data = body.content ? values[body.content] : undefined;

    return new Response(JSON.stringify({
      data: data ?? "",
      error: 0,
      errorMsg: "",
      success: Boolean(data),
    }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function createEmbedAuthDbMock(record: {
  id: number;
  name: string;
  type: number;
  uid: number;
}) {
  let session = {
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    id: 501,
    refresh_token_hash: "",
    revoked_at: null as Date | null,
    session_version: 0,
    sub_user_id: record.id,
  };

  return {
    selectFrom(table: string) {
      const builder = {
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user") {
            return {
              id: record.id,
              name: record.name,
              role: "operator",
              type: record.type,
              uid: record.uid,
            };
          }

          if (table === "xy_wap_embed_sub_user_session") {
            return session;
          }

          throw new Error(`Unexpected select table: ${table}`);
        },
        executeTakeFirstOrThrow: async () => {
          const result = await builder.executeTakeFirst();

          if (!result) {
            throw new Error(`No row for table: ${table}`);
          }

          return result;
        },
        orderBy: () => builder,
        select: () => builder,
        where: () => builder,
      };

      return builder;
    },
    insertInto(table: string) {
      if (table !== "xy_wap_embed_sub_user_session") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        onDuplicateKeyUpdate: () => builder,
        values: (values: Record<string, unknown>) => {
          session = {
            ...session,
            ...(values as Partial<typeof session>),
            id: session.id,
            session_version: session.session_version + 1,
          };

          return builder;
        },
      };

      return builder;
    },
  } as never;
}

function readSetCookieValue(
  response: { headers: Record<string, unknown> },
  name: string,
) {
  const cookies = response.headers["set-cookie"];
  const header = Array.isArray(cookies) ? cookies.find((item) => item.startsWith(`${name}=`)) : undefined;
  const value = header?.split(";")[0]?.slice(name.length + 1);

  if (!value) {
    throw new Error(`Missing ${name} cookie`);
  }

  return value;
}

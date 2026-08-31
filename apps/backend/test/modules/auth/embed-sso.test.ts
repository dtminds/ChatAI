import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../src/app.js";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../../../src/modules/auth/auth-cookies.js";
import { SMP_EMBED_AES_DECRYPT_PATH } from "../../../src/modules/auth/smp-embed-decrypt-port.js";

const EMBED_HOST = "embed.example.com";

describe("embed SSO", () => {
  beforeEach(() => {
    process.env.CHAT_EMBED_HOSTNAMES = EMBED_HOST;
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
    delete process.env.CHAT_EMBED_HOSTNAMES;
    delete process.env.JAVA_INTERNAL_API_BASE_URL;
    delete process.env.JAVA_INTERNAL_API_TOKEN;
    delete process.env.JWT_DEV_SECRET;
    delete process.env.NODE_ENV;
  });

  it("only exposes embed SSO on an embed host", async () => {
    stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();

    const response = await injectEmbedSso(app, undefined, {
      host: "chat-test01.bokr.com.cn",
    });
    const loginResponse = await app.inject({
      headers: { host: EMBED_HOST },
      method: "POST",
      payload: { account: "operator", altcha: "proof", password: "secret" },
      url: "/api/auth/login",
    });

    expect(response.statusCode).toBe(404);
    expect(loginResponse.statusCode).toBe(404);
    await app.close();
  });

  it("disables embed SSO when no embed hosts are configured", async () => {
    delete process.env.CHAT_EMBED_HOSTNAMES;
    const app = await buildApp();

    const response = await injectEmbedSso(app);

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("creates an independent embed session and signs it as embed", async () => {
    const fetchMock = stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;

    const response = await injectEmbedSso(app);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        accessToken: expect.any(String),
        expiresIn: 1200,
        subUser: { subUserId: "101", uid: 9001 },
      },
      success: true,
    });
    expect(authDb.embedSessions).toHaveLength(1);
    expect(authDb.selectedTables).not.toContain("xy_wap_embed_sub_user_session");

    const accessToken = readSetCookieValue(response, ACCESS_TOKEN_COOKIE_NAME);
    expect(response.json().data.accessToken).toBe(accessToken);
    expect(app.jwt.verify(accessToken)).toMatchObject({
      sessionId: "501",
      sessionKind: "embed",
      subUserId: "101",
      uid: 9001,
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

  it("reuses the current browser session for matching tickets", async () => {
    stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;
    const first = await injectEmbedSso(app);

    const second = await injectEmbedSso(app, cookieHeader(first));

    expect(second.statusCode).toBe(200);
    expect(second.json().data.accessToken).toBe(first.json().data.accessToken);
    expect(second.headers["set-cookie"]).toBeUndefined();
    expect(authDb.embedSessions).toHaveLength(1);
    await app.close();
  });

  it("refreshes the same embed session when its access cookie is no longer valid", async () => {
    stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;
    const first = await injectEmbedSso(app);
    const refreshCookie = [
      `${ACCESS_TOKEN_COOKIE_NAME}=expired-access-token`,
      cookieHeader(first, [REFRESH_TOKEN_COOKIE_NAME]),
    ].join("; ");

    const second = await injectEmbedSso(app, refreshCookie);

    expect(second.statusCode).toBe(200);
    expect(authDb.embedSessions).toHaveLength(1);
    expect(authDb.embedSessions[0]?.last_used_at).toBeInstanceOf(Date);
    expect(readSetCookieValue(second, REFRESH_TOKEN_COOKIE_NAME)).toBe(
      readSetCookieValue(first, REFRESH_TOKEN_COOKIE_NAME),
    );
    await app.close();
  });

  it("keeps separate sessions for separate browsers of the same account", async () => {
    stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;

    const first = await injectEmbedSso(app);
    const second = await injectEmbedSso(app);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(authDb.embedSessions.map((session) => session.id)).toEqual([501, 502]);
    expect(authDb.embedSessions.every((session) => session.revoked_at === null)).toBe(true);
    await app.close();
  });

  it("switches identity when valid tickets target another embed account", async () => {
    stubDecrypt({
      "enc-id-101": "101",
      "enc-id-202": "202",
      "enc-uid-9001": "9001",
      "enc-uid-9002": "9002",
    });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "账号一", type: 0, uid: 9001 },
      { id: 202, name: "账号二", type: 0, uid: 9002 },
    ]);
    app.db = authDb.db;
    const first = await injectEmbedSso(app, undefined, undefined, {
      id: "enc-id-101",
      uid: "enc-uid-9001",
    });

    const second = await injectEmbedSso(app, cookieHeader(first), undefined, {
      id: "enc-id-202",
      uid: "enc-uid-9002",
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().data.subUser).toMatchObject({ subUserId: "202", uid: 9002 });
    expect(authDb.embedSessions.map((session) => session.sub_user_id)).toEqual([101, 202]);
    await app.close();
  });

  it("rejects invalid tickets instead of falling back to the current cookie", async () => {
    stubDecrypt({
      "enc-id": "101",
      "enc-uid": "9001",
      "wrong-uid": "9002",
    });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;
    const first = await injectEmbedSso(app);

    const rejected = await injectEmbedSso(
      app,
      cookieHeader(first),
      undefined,
      { id: "enc-id", uid: "wrong-uid" },
    );

    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({
      error: { code: "EMBED_SSO_REJECTED" },
      success: false,
    });
    expect(rejected.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=;`),
      expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=;`),
    ]));
    expect(authDb.embedSessions).toHaveLength(1);
    await app.close();
  });

  it("refreshes and revokes only the current embed session", async () => {
    stubDecrypt({ "enc-id": "101", "enc-uid": "9001" });
    const app = await buildApp();
    const authDb = createEmbedAuthDbMock([
      { id: 101, name: "营销画布账号", type: 0, uid: 9001 },
    ]);
    app.db = authDb.db;
    const first = await injectEmbedSso(app);
    const secondBrowser = await injectEmbedSso(app);

    const refresh = await app.inject({
      headers: {
        cookie: cookieHeader(first, [REFRESH_TOKEN_COOKIE_NAME]),
        host: EMBED_HOST,
      },
      method: "POST",
      url: "/api/auth/refresh",
    });
    const logout = await app.inject({
      headers: {
        cookie: cookieHeader(refresh, [ACCESS_TOKEN_COOKIE_NAME]),
        host: EMBED_HOST,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(refresh.statusCode).toBe(200);
    expect(logout.statusCode).toBe(200);
    expect(authDb.embedSessions[0]?.revoked_at).toBeInstanceOf(Date);
    expect(authDb.embedSessions[1]?.revoked_at).toBeNull();
    expect(readSetCookieValue(secondBrowser, ACCESS_TOKEN_COOKIE_NAME)).toBeTruthy();
    await app.close();
  });
});

type AccountRow = {
  id: number;
  name: string;
  type: number;
  uid: number;
};

type EmbedSessionRow = {
  expires_at: Date;
  id: number;
  ip: string | null;
  last_used_at: Date | null;
  refresh_token_hash: string;
  revoked_at: Date | null;
  session_version: number;
  sub_user_id: number;
  user_agent: string | null;
};

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

function createEmbedAuthDbMock(accounts: AccountRow[]) {
  const embedSessions: EmbedSessionRow[] = [];
  const selectedTables: string[] = [];
  let nextSessionId = 501;

  const db = {
    deleteFrom(table: string) {
      if (table !== "xy_wap_embed_sub_user_embed_session") {
        throw new Error(`Unexpected delete table: ${table}`);
      }
      let subUserId: number | undefined;
      const builder = {
        execute: async () => {
          for (let index = embedSessions.length - 1; index >= 0; index -= 1) {
            const session = embedSessions[index];
            if (
              session
              && session.sub_user_id === subUserId
              && (session.revoked_at !== null || session.expires_at <= new Date())
            ) {
              embedSessions.splice(index, 1);
            }
          }
          return [];
        },
        where: (columnOrCallback: unknown, _operator?: string, value?: unknown) => {
          if (columnOrCallback === "sub_user_id") {
            subUserId = Number(value);
          }
          return builder;
        },
      };
      return builder;
    },
    insertInto(table: string) {
      if (table !== "xy_wap_embed_sub_user_embed_session") {
        throw new Error(`Unexpected insert table: ${table}`);
      }
      let values: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          embedSessions.push({
            expires_at: values.expires_at as Date,
            id: nextSessionId++,
            ip: values.ip as string | null,
            last_used_at: null,
            refresh_token_hash: String(values.refresh_token_hash),
            revoked_at: null,
            session_version: Number(values.session_version),
            sub_user_id: Number(values.sub_user_id),
            user_agent: values.user_agent as string | null,
          });
          return [];
        },
        values: (nextValues: Record<string, unknown>) => {
          values = nextValues;
          return builder;
        },
      };
      return builder;
    },
    selectFrom(table: string) {
      selectedTables.push(table);
      const wheres: Array<[string, string, unknown]> = [];
      const find = () => {
        const rows = table === "xy_wap_embed_sub_user"
          ? accounts.map((account) => ({ ...account, role: "operator", status: 1 }))
          : table === "xy_wap_embed_sub_user_embed_session"
            ? embedSessions
            : [];
        return rows.find((row) => matchesWheres(row, wheres));
      };
      const builder = {
        executeTakeFirst: async () => find(),
        executeTakeFirstOrThrow: async () => {
          const row = find();
          if (!row) throw new Error(`No row for table: ${table}`);
          return row;
        },
        orderBy: () => builder,
        select: () => builder,
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };
      return builder;
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_sub_user_embed_session") {
        throw new Error(`Unexpected update table: ${table}`);
      }
      const wheres: Array<[string, string, unknown]> = [];
      let values: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          for (const session of embedSessions) {
            if (matchesWheres(session, wheres)) Object.assign(session, values);
          }
          return [];
        },
        set: (nextValues: Record<string, unknown>) => {
          values = nextValues;
          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };
      return builder;
    },
  } as never;

  return { db, embedSessions, selectedTables };
}

function matchesWheres(
  row: Record<string, unknown>,
  wheres: Array<[string, string, unknown]>,
) {
  return wheres.every(([column, operator, value]) => {
    const rowValue = row[column];
    if (operator === "=") return String(rowValue) === String(value);
    if (operator === "is") return rowValue === value;
    if (operator === ">") return rowValue instanceof Date && rowValue > (value as Date);
    return true;
  });
}

function injectEmbedSso(
  app: Awaited<ReturnType<typeof buildApp>>,
  cookie?: string,
  headers: { host?: string } = {},
  payload = { id: "enc-id", uid: "enc-uid" },
) {
  return app.inject({
    headers: {
      ...(cookie ? { cookie } : {}),
      host: headers.host ?? EMBED_HOST,
    },
    method: "POST",
    payload,
    url: "/api/auth/embed-sso",
  });
}

function cookieHeader(
  response: { headers: Record<string, unknown> },
  names = [ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME],
) {
  return names
    .map((name) => `${name}=${readSetCookieValue(response, name)}`)
    .join("; ");
}

function readSetCookieValue(
  response: { headers: Record<string, unknown> },
  name: string,
) {
  const cookies = response.headers["set-cookie"];
  const values = Array.isArray(cookies)
    ? cookies
    : typeof cookies === "string"
      ? [cookies]
      : [];
  const header = values.find((item) => item.startsWith(`${name}=`));
  const value = header?.split(";")[0]?.slice(name.length + 1);

  if (!value) throw new Error(`Missing ${name} cookie`);
  return value;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../src/app";
import { ACCESS_TOKEN_COOKIE_NAME } from "../../../src/modules/auth/auth-cookies";
import { createMemoryWorkbenchService } from "../../fixtures/workbench-memory.service";

const actorTokenPayload = {
  roles: ["owner"],
  sessionId: "501",
  sessionVersion: 1,
  subUserId: "1",
  uid: 272,
};

const actorSubUser = {
  account: "observer",
  id: 1,
  name: "观测账号",
  platform: 5,
  role: "owner",
  status: 1,
  type: 1,
  uid: 272,
};

const activeTarget = {
  account: "target-admin",
  id: 101,
  name: "目标管理员",
  platform: 5,
  role: "admin",
  status: 1,
  type: 0,
  uid: 9001,
};

const inactiveTarget = {
  account: "target-disabled",
  id: 102,
  name: "已禁用账号",
  platform: 5,
  role: "operator",
  status: 2,
  type: 0,
  uid: 9001,
};

describe("support investigation", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";
    process.env.JWT_DEV_SECRET = "support-investigation-test-secret";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DATABASE_URL;
    delete process.env.JWT_DEV_SECRET;
    delete process.env.NODE_ENV;
  });

  it("allows only the hard-coded investigator to query active target accounts", async () => {
    const { app } = await createSupportApp();
    const allowedToken = app.jwt.sign(actorTokenPayload);
    const deniedToken = app.jwt.sign({
      ...actorTokenPayload,
      uid: 273,
    });

    const allowed = await app.inject({
      headers: { authorization: `Bearer ${allowedToken}` },
      method: "GET",
      url: "/api/auth/support-investigation/accounts?uid=9001",
    });
    const denied = await app.inject({
      headers: { authorization: `Bearer ${deniedToken}` },
      method: "GET",
      url: "/api/auth/support-investigation/accounts?uid=9001",
    });
    const session = await app.inject({
      headers: { authorization: `Bearer ${allowedToken}` },
      method: "GET",
      url: "/api/auth/session",
    });

    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({
      data: {
        accounts: [
          {
            account: "target-admin",
            accountType: "sub",
            displayName: "目标管理员",
            role: "admin",
            subUserId: "101",
            uid: 9001,
          },
        ],
      },
      success: true,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
      success: false,
    });
    expect(session.json()).toMatchObject({
      data: {
        subUser: {
          canStartSupportInvestigation: true,
          subUserId: "1",
          uid: 272,
        },
      },
      success: true,
    });

    await app.close();
  });

  it("validates the target UID and records only investigation start data", async () => {
    const auditWrites: Record<string, unknown>[] = [];
    const { app } = await createSupportApp({ auditWrites });
    const actorToken = app.jwt.sign(actorTokenPayload);

    const mismatch = await app.inject({
      headers: { authorization: `Bearer ${actorToken}` },
      method: "POST",
      payload: {
        reason: "排障：页面加载异常",
        subUserId: "101",
        uid: 9002,
      },
      url: "/api/auth/support-investigation/start",
    });
    const started = await app.inject({
      headers: { authorization: `Bearer ${actorToken}` },
      method: "POST",
      payload: {
        reason: "排障：页面加载异常",
        subUserId: "101",
        uid: 9001,
      },
      url: "/api/auth/support-investigation/start",
    });

    expect(mismatch.statusCode).toBe(404);
    expect(mismatch.json()).toMatchObject({
      error: { code: "SUPPORT_TARGET_NOT_FOUND" },
      success: false,
    });
    expect(started.statusCode).toBe(200);
    expect(auditWrites).toEqual([
      {
        actor_sub_user_id: 1,
        actor_uid: 272,
        investigation_reason: "排障：页面加载异常",
        target_sub_user_id: 101,
        target_uid: 9001,
      },
    ]);

    const token = readCookieValue(started, ACCESS_TOKEN_COOKIE_NAME);
    const decoded = app.jwt.verify<{
      accessMode: string;
      actorSubUserId: string;
      actorUid: number;
      exp: number;
      iat: number;
      sessionId: string;
      sessionVersion: number;
      subUserId: string;
      uid: number;
    }>(token);

    expect(decoded).toMatchObject({
      accessMode: "support_readonly",
      actorSubUserId: "1",
      actorUid: 272,
      sessionVersion: 0,
      subUserId: "101",
      uid: 9001,
    });
    expect(decoded.sessionId).toMatch(/^support:/);
    expect(decoded.exp - decoded.iat).toBe(30 * 60);
    expect(readSetCookieHeaders(started)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("chatai_refresh_token=; Max-Age=0"),
      ]),
    );

    await app.close();
  });

  it("allows workbench reads and downloads without a target account session", async () => {
    const selectedTables: string[] = [];
    const { app } = await createSupportApp({ selectedTables });
    const token = await startInvestigation(app);
    selectedTables.length = 0;

    const seats = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/server/seats",
    });
    const download = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      payload: {
        conversationId: "conv-001",
        msgInfoId: 1,
      },
      url: "/api/server/messages/download",
    });

    expect(seats.statusCode).toBe(200);
    expect(download.statusCode).toBe(200);
    expect(selectedTables).not.toContain("xy_wap_embed_sub_user_session");

    await app.close();
  });

  it.each([
    {
      method: "POST" as const,
      payload: { conversationId: "conv-001" },
      url: "/api/server/media/upload-credential",
    },
    {
      method: "POST" as const,
      payload: { conversationId: "conv-001", messageSeq: 7 },
      url: "/api/server/media/voice-transcription",
    },
    {
      method: "POST" as const,
      payload: {
        conversationId: "conv-001",
        messageSeq: 7,
        playbackUrl: "https://b5.bokr.com.cn/s5/playable-voice/voice.wav",
      },
      url: "/api/server/media/voice-playback-confirmed",
    },
    {
      method: "POST" as const,
      payload: { conversationId: "conv-001", msgId: 1 },
      url: "/api/server/smart-reply/general-answer",
    },
    {
      method: "POST" as const,
      payload: {
        content: "blocked",
        contentType: "text",
        conversationId: "conv-001",
        seatId: "drc",
      },
      url: "/api/server/messages/send",
    },
    {
      method: "GET" as const,
      url: "/api/server/settings/sidebar-items",
    },
  ])("blocks $method $url in support mode", async ({ method, payload, url }) => {
    const { app } = await createSupportApp();
    const token = await startInvestigation(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method,
      payload,
      url,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "SUPPORT_READ_ONLY",
        message: "问题排查模式仅支持查看和下载",
      },
      success: false,
    });

    await app.close();
  });

  it("returns the target identity and logs out without revoking a normal session", async () => {
    const { app } = await createSupportApp();
    const token = await startInvestigation(app);

    const session = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "GET",
      url: "/api/auth/session",
    });
    const logout = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      data: {
        subUser: {
          accessMode: "support_readonly",
          displayName: "目标管理员",
          role: "admin",
          subUserId: "101",
          uid: 9001,
        },
      },
      success: true,
    });
    expect(logout.statusCode).toBe(200);
    expect(readSetCookieHeaders(logout)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("chatai_access_token=; Max-Age=0"),
        expect.stringContaining("chatai_refresh_token=; Max-Age=0"),
      ]),
    );

    await app.close();
  });
});

async function createSupportApp(options: {
  auditWrites?: Record<string, unknown>[];
  selectedTables?: string[];
} = {}) {
  const app = await buildApp();
  app.db = createSupportDbMock(options);
  app.workbenchService = createMemoryWorkbenchService();
  app.createWorkbenchService = () => app.workbenchService;

  return { app };
}

async function startInvestigation(
  app: Awaited<ReturnType<typeof buildApp>>,
) {
  const actorToken = app.jwt.sign(actorTokenPayload);
  const response = await app.inject({
    headers: { authorization: `Bearer ${actorToken}` },
    method: "POST",
    payload: {
      reason: "产品观测",
      subUserId: "101",
      uid: 9001,
    },
    url: "/api/auth/support-investigation/start",
  });

  expect(response.statusCode).toBe(200);
  return readCookieValue(response, ACCESS_TOKEN_COOKIE_NAME);
}

function createSupportDbMock(options: {
  auditWrites?: Record<string, unknown>[];
  selectedTables?: string[];
}) {
  const subUsers = [actorSubUser, activeTarget, inactiveTarget];

  return {
    insertInto(table: string) {
      if (table !== "xy_wap_embed_support_investigation_log") {
        throw new Error(`Unexpected insert table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        values: (values: Record<string, unknown>) => {
          options.auditWrites?.push(values);
          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string) {
      options.selectedTables?.push(table);
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        execute: async () => resolveRows(table, wheres),
        executeTakeFirst: async () => resolveRows(table, wheres)[0],
        orderBy: () => builder,
        select: () => builder,
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
  } as never;

  function resolveRows(
    table: string,
    wheres: Array<[string, string, unknown]>,
  ): Record<string, unknown>[] {
    if (table === "xy_wap_embed_sub_user_session") {
      return [{
        expires_at: new Date(Date.now() + 60_000),
        id: 501,
        session_version: 1,
        sub_user_id: 1,
      }];
    }

    if (table !== "xy_wap_embed_sub_user") {
      throw new Error(`Unexpected select table: ${table}`);
    }

    return subUsers.filter((row) => wheres.every(([column, operator, value]) => {
      if (operator !== "=") {
        return true;
      }

      return String(row[column as keyof typeof row]) === String(value);
    }));
  }
}

function readCookieValue(
  response: { headers: Record<string, unknown> },
  cookieName: string,
) {
  const header = readSetCookieHeaders(response).find((value) =>
    value.startsWith(`${cookieName}=`));

  if (!header) {
    throw new Error(`Missing ${cookieName} cookie`);
  }

  return decodeURIComponent(header.slice(cookieName.length + 1).split(";")[0] ?? "");
}

function readSetCookieHeaders(response: { headers: Record<string, unknown> }) {
  const value = response.headers["set-cookie"];

  return Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? [value]
      : [];
}

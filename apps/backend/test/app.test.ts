import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/scrypt";
import argon2 from "argon2";
import { buildApp } from "../src/app";
import { createMemoryWorkbenchService } from "./fixtures/workbench-memory.service";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../src/modules/auth/auth-cookies";
import { shouldDisableRequestLogging } from "../src/app";

async function createAuthenticatedApp() {
  const app = await buildApp();
  const token = app.jwt.sign({
    roles: ["operator"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
  });
  app.db = createSessionDbMock({
    id: "501",
    session_version: 1,
    sub_user_id: "101",
  });
  app.workbenchService = createMemoryWorkbenchService();
  app.createWorkbenchService = () => app.workbenchService;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

async function createAuthenticatedAppWithRole(role: "admin" | "operator" | "viewer") {
  const app = await buildApp();
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
  });
  app.workbenchService = createMemoryWorkbenchService();
  app.createWorkbenchService = () => app.workbenchService;

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

async function createAuthenticatedSettingsApp(
  role: "admin" | "operator" | "viewer" = "admin",
) {
  const app = await buildApp();
  const token = app.jwt.sign({
    roles: [role],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "101",
  });
  app.db = createSettingsDbMock({
    account: "agent001",
    id: 101,
    name: "客服一号",
    platform: 1,
    role,
    type: 0,
    uid: 9001,
  });
  app.workbenchService = createMemoryWorkbenchService();

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("backend app", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALTCHA_COST;
    delete process.env.ALTCHA_COUNTER_MAX;
    delete process.env.ALTCHA_COUNTER_MIN;
    delete process.env.ALTCHA_HMAC_SECRET;
    delete process.env.ALTCHA_MEMORY_COST;
    delete process.env.ALTCHA_PARALLELISM;
    delete process.env.AUTH_COOKIE_SECURE;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.DATABASE_URL;
    delete process.env.JWT_DEV_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.NODE_ENV;
  });

  it("serves health and readiness endpoints", async () => {
    const app = await buildApp();
    app.db = createReadyDbMock();

    const health = await app.inject({ method: "GET", url: "/healthz" });
    const readiness = await app.inject({ method: "GET", url: "/readyz" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({
      database: {
        configured: true,
        ok: true,
      },
      status: "ready",
    });

    await app.close();
  });

  it("protects chat routes with bearer authentication", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/server/seats",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });

    await app.close();
  });

  it("requires DATABASE_URL before backend startup", async () => {
    delete process.env.DATABASE_URL;

    await expect(buildApp()).rejects.toThrow(
      /Missing required environment variables for development: DATABASE_URL/,
    );
  });

  it("disables request logging for the media proxy route", async () => {
    expect(shouldDisableRequestLogging({ url: "/api/server/media/proxy?url=https%3A%2F%2Fb5.bokr.com.cn%2Ffoo" })).toBe(true);
    expect(shouldDisableRequestLogging({ url: "/api/server/conversations" })).toBe(false);
  });

  it("serves and verifies ALTCHA challenges once", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    const app = await buildApp();

    const challengeResponse = await app.inject({
      method: "GET",
      url: "/api/auth/altcha/challenge",
    });
    const challenge = challengeResponse.json<Challenge>();
    const solution = await solveChallenge({
      challenge,
      deriveKey,
      timeout: 10000,
    });

    expect(challengeResponse.statusCode).toBe(200);
    expect(challenge.parameters.algorithm).toBe("SCRYPT");
    expect(challenge.parameters.data?.challengeId).toEqual(expect.any(String));
    expect(solution).not.toBeNull();

    const payload = windowlessBase64Encode(
      JSON.stringify({
        challenge,
        solution,
      }),
    );

    const firstVerify = await app.inject({
      method: "POST",
      payload: {
        altcha: payload,
      },
      url: "/api/auth/altcha/verify",
    });
    const replayVerify = await app.inject({
      method: "POST",
      payload: {
        altcha: payload,
      },
      url: "/api/auth/altcha/verify",
    });

    expect(firstVerify.statusCode).toBe(200);
    expect(firstVerify.json()).toEqual({
      data: {
        verified: true,
      },
      success: true,
    });
    expect(replayVerify.statusCode).toBe(403);
    expect(replayVerify.json()).toEqual({
      error: {
        code: "ALTCHA_VERIFICATION_FAILED",
        message: "人机验证失败",
      },
      success: false,
    });

    await app.close();
  });

  it("does not consume an ALTCHA challenge when verification fails", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    const app = await buildApp();

    const challengeResponse = await app.inject({
      method: "GET",
      url: "/api/auth/altcha/challenge",
    });
    const challenge = challengeResponse.json<Challenge>();
    const solution = await solveChallenge({
      challenge,
      deriveKey,
      timeout: 10000,
    });

    expect(solution).not.toBeNull();

    const invalidVerify = await app.inject({
      method: "POST",
      payload: {
        altcha: windowlessBase64Encode(
          JSON.stringify({
            challenge,
            solution: {
              ...solution,
              derivedKey: "invalid-key",
            },
          }),
        ),
      },
      url: "/api/auth/altcha/verify",
    });
    const validVerify = await app.inject({
      method: "POST",
      payload: {
        altcha: windowlessBase64Encode(
          JSON.stringify({
            challenge,
            solution,
          }),
        ),
      },
      url: "/api/auth/altcha/verify",
    });

    expect(invalidVerify.statusCode).toBe(403);
    expect(validVerify.statusCode).toBe(200);

    await app.close();
  });

  it("falls back to safe ALTCHA counter bounds when env values are inverted", async () => {
    process.env.ALTCHA_COST = "2";
    process.env.ALTCHA_COUNTER_MIN = "10";
    process.env.ALTCHA_COUNTER_MAX = "1";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    const app = await buildApp();

    const challengeResponse = await app.inject({
      method: "GET",
      url: "/api/auth/altcha/challenge",
    });

    expect(challengeResponse.statusCode).toBe(200);
    expect(challengeResponse.json<Challenge>().parameters.algorithm).toBe("SCRYPT");

    await app.close();
  });

  it("logs in active sub users with ALTCHA and Argon2id password verification", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const altcha = await createSolvedAltchaPayload(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha,
        password: "correct-password",
      },
      url: "/api/auth/login",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        expiresIn: 1200,
        subUser: {
          accountType: "sub",
          displayName: "客服一号",
          permissions: [
            "chat.access",
            "chat.send",
            "chat.takeover",
          ],
          role: "operator",
          subUserId: "101",
        },
      },
      success: true,
    });

    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=`),
        expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=`),
      ]),
    );
    expect(response.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining("HttpOnly"),
        expect.stringContaining("SameSite=Strict"),
      ]),
    );
    expect(readSetCookieHeader(response, ACCESS_TOKEN_COOKIE_NAME)).toContain("Path=/api");
    expect(readSetCookieHeader(response, REFRESH_TOKEN_COOKIE_NAME)).toContain(
      "Path=/api/auth/refresh",
    );

    const decoded = app.jwt.verify(readSetCookieValue(response, ACCESS_TOKEN_COOKIE_NAME));

    expect(decoded).toMatchObject({
      roles: ["operator"],
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "101",
    });

    await app.close();
  });

  it("returns owner permissions for main account sessions", async () => {
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    const token = app.jwt.sign({
      roles: ["owner"],
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "101",
    });
    app.db = createSessionDbMock({
      id: "501",
      session_version: 1,
      sub_user_id: "101",
      subUser: {
        account: "owner001",
        id: 101,
        name: "主账号",
        platform: 1,
        role: "operator",
        type: 1,
        uid: 9001,
      },
    });

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      url: "/api/auth/session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        subUser: {
          accountType: "main",
          displayName: "主账号",
          permissions: [
            "chat.access",
            "chat.send",
            "chat.takeover",
            "settings.access",
            "settings.subAccounts.manage",
            "settings.managedAccounts.manage",
            "settings.sidebar.manage",
          ],
          role: "owner",
          subUserId: "101",
        },
      },
      success: true,
    });

    await app.close();
  });

  it("marks auth cookies secure when the secure cookie flag is enabled", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });

    const response = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });

    expect(response.statusCode).toBe(200);
    expect(getSetCookieHeaders(response)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Secure"),
      ]),
    );

    await app.close();
  });

  it("marks cleared auth cookies secure when the secure cookie flag is enabled", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.AUTH_COOKIE_SECURE = "true";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const login = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });
    const logout = await app.inject({
      headers: {
        cookie: buildCookieHeader(login, ACCESS_TOKEN_COOKIE_NAME),
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      url: "/api/auth/logout",
    });

    expect(logout.statusCode).toBe(200);
    expect(readSetCookieHeader(logout, ACCESS_TOKEN_COOKIE_NAME)).toContain("Secure");
    expect(readSetCookieHeader(logout, REFRESH_TOKEN_COOKIE_NAME)).toContain("Secure");

    await app.close();
  });

  it("stores request IP and user agent metadata when logging in", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    let sessionMetadata: Record<string, unknown> | undefined;
    const app = await buildApp();
    app.db = createAuthDbMock(
      {
        account: "agent001",
        id: 101,
        name: "客服一号",
        password_hash: await argon2.hash("correct-password", {
          hashLength: 32,
          memoryCost: 4096,
          parallelism: 1,
          timeCost: 2,
          type: argon2.argon2id,
        }),
        platform: 1,
        uid: 9001,
      },
      {
        onSessionWrite: (values) => {
          sessionMetadata = values;
        },
      },
    );
    const altcha = await createSolvedAltchaPayload(app);

    const response = await app.inject({
      headers: {
        "user-agent": "Mozilla/5.0 test agent",
        "x-forwarded-for": "203.0.113.8, 10.0.0.2",
      },
      method: "POST",
      payload: {
        account: "agent001",
        altcha,
        password: "correct-password",
      },
      url: "/api/auth/login",
    });

    expect(response.statusCode).toBe(200);
    expect(sessionMetadata).toMatchObject({
      ip: "203.0.113.8",
      user_agent: "Mozilla/5.0 test agent",
    });

    await app.close();
  });

  it("refreshes access tokens without rotating the refresh token", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const altcha = await createSolvedAltchaPayload(app);

    const login = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha,
        password: "correct-password",
      },
      url: "/api/auth/login",
    });
    const refresh = await app.inject({
      headers: {
        cookie: buildCookieHeader(login, REFRESH_TOKEN_COOKIE_NAME),
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      url: "/api/auth/refresh",
    });

    expect(refresh.statusCode).toBe(200);
    expect(refresh.json()).toMatchObject({
      data: {
        expiresIn: 1200,
      },
      success: true,
    });
    expect(refresh.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=`),
        expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=`),
      ]),
    );
    expect(app.jwt.verify(readSetCookieValue(refresh, ACCESS_TOKEN_COOKIE_NAME))).toMatchObject({
      sessionId: "501",
      sessionVersion: 1,
      subUserId: "101",
    });

    await app.close();
  });

  it("invalidates the old access and refresh tokens when the same sub user logs in again", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });

    const firstLogin = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });
    const secondLogin = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });

    expect(firstLogin.statusCode).toBe(200);
    expect(secondLogin.statusCode).toBe(200);
    expect(app.jwt.verify(readSetCookieValue(secondLogin, ACCESS_TOKEN_COOKIE_NAME))).toMatchObject({
      sessionId: "501",
      sessionVersion: 2,
      subUserId: "101",
    });

    const oldAccess = await app.inject({
      headers: {
        cookie: buildCookieHeader(firstLogin, ACCESS_TOKEN_COOKIE_NAME),
      },
      method: "GET",
      url: "/api/server/me",
    });
    const oldRefresh = await app.inject({
      headers: {
        cookie: buildCookieHeader(firstLogin, REFRESH_TOKEN_COOKIE_NAME),
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      payload: {},
      url: "/api/auth/refresh",
    });

    expect(oldAccess.statusCode).toBe(401);
    expect(oldAccess.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    expect(oldRefresh.statusCode).toBe(401);
    expect(getSetCookieHeaders(oldRefresh)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0`),
        expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=; Max-Age=0`),
      ]),
    );

    await app.close();
  });

  it("logs out by revoking the current session", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const login = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });
    const cookie = buildCookieHeader(login, ACCESS_TOKEN_COOKIE_NAME);

    const logout = await app.inject({
      headers: {
        cookie,
        "x-workbench-client": "chat-ai-ui",
      },
      method: "POST",
      url: "/api/auth/logout",
    });
    const me = await app.inject({
      headers: {
        cookie,
      },
      method: "GET",
      url: "/api/server/me",
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({
      data: {
        revoked: true,
      },
      success: true,
    });
    expect(logout.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${ACCESS_TOKEN_COOKIE_NAME}=; Max-Age=0`),
        expect.stringContaining(`${REFRESH_TOKEN_COOKIE_NAME}=; Max-Age=0`),
      ]),
    );
    expect(me.statusCode).toBe(401);

    await app.close();
  });

  it("rejects mutating cookie-authenticated requests without the workbench client header", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    process.env.JWT_DEV_SECRET = "test-jwt-secret";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const login = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha: await createSolvedAltchaPayload(app),
        password: "correct-password",
      },
      url: "/api/auth/login",
    });

    const response = await app.inject({
      headers: {
        cookie: buildCookieHeader(login, ACCESS_TOKEN_COOKIE_NAME),
      },
      method: "POST",
      payload: {
        clientMessageId: "csrf-check-001",
        content: "blocked",
        contentType: "text",
        conversationId: "conv-001",
        seatId: "drc",
      },
      url: "/api/server/messages/send",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "CSRF_PROTECTION_FAILED",
        message: "请求来源校验失败",
      },
      success: false,
    });

    await app.close();
  });

  it("rejects settings writes for operator role sessions", async () => {
    const { app, authorization } = await createAuthenticatedSettingsApp("operator");

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        account: "agent002",
        name: "客服二号",
        password: "Strong1!",
        role: "operator",
        seatIds: [],
      },
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "无权限访问",
      },
      success: false,
    });

    await app.close();
  });

  it("allows operator role sessions to read settings lists", async () => {
    const { app, authorization } = await createAuthenticatedSettingsApp("operator");

    const subAccounts = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/sub-accounts",
    });
    const managedAccounts = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/managed-accounts",
    });
    const sidebarItems = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/settings/sidebar-items",
    });

    expect(subAccounts.statusCode).toBe(200);
    expect(subAccounts.json()).toMatchObject({
      data: {
        subAccounts: expect.any(Array),
      },
      success: true,
    });
    expect(managedAccounts.statusCode).toBe(200);
    expect(managedAccounts.json()).toMatchObject({
      data: {
        managedAccounts: expect.any(Array),
      },
      success: true,
    });
    expect(sidebarItems.statusCode).toBe(200);
    expect(sidebarItems.json()).toMatchObject({
      data: {
        items: expect.any(Array),
      },
      success: true,
    });

    await app.close();
  });

  it("allows admin role sessions to create admin sub accounts", async () => {
    const { app, authorization } = await createAuthenticatedSettingsApp("admin");

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        account: "agent002",
        name: "客服二号",
        password: "Strong1!",
        role: "admin",
        seatIds: [],
      },
      url: "/api/server/settings/sub-accounts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        account: "agent002",
        name: "客服二号",
        role: "admin",
        type: 0,
      },
      success: true,
    });

    await app.close();
  });

  it("rejects role changes for main accounts", async () => {
    const { app, authorization } = await createAuthenticatedSettingsApp("admin");

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        name: "主账号",
        password: "",
        role: "operator",
        seatIds: [],
      },
      url: "/api/server/settings/sub-accounts/601",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "OWNER_ROLE_IMMUTABLE",
      },
      success: false,
    });

    await app.close();
  });

  it("rejects login with a uniform error when the password is wrong", async () => {
    process.env.ALTCHA_COST = "4";
    process.env.ALTCHA_COUNTER_MIN = "1";
    process.env.ALTCHA_COUNTER_MAX = "3";
    process.env.ALTCHA_HMAC_SECRET = "test-altcha-secret";
    process.env.ALTCHA_MEMORY_COST = "8";
    process.env.ALTCHA_PARALLELISM = "1";
    const app = await buildApp();
    app.db = createAuthDbMock({
      account: "agent001",
      id: 101,
      name: "客服一号",
      password_hash: await argon2.hash("correct-password", {
        hashLength: 32,
        memoryCost: 4096,
        parallelism: 1,
        timeCost: 2,
        type: argon2.argon2id,
      }),
      platform: 1,
      uid: 9001,
    });
    const altcha = await createSolvedAltchaPayload(app);

    const response = await app.inject({
      method: "POST",
      payload: {
        account: "agent001",
        altcha,
        password: "wrong-password",
      },
      url: "/api/auth/login",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "用户名或密码错误",
      },
      success: false,
    });

    await app.close();
  });

  it("does not allow unauthenticated server routes when auth bypass is misconfigured", async () => {
    process.env.AUTH_DEV_BYPASS = "true";
    process.env.NODE_ENV = "development";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/server/me",
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("requires explicit JWT configuration in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";

    await expect(buildApp()).rejects.toThrow(
      /Missing required environment variables for production: JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, JAVA_INTERNAL_API_BASE_URL/,
    );
  });

  it("requires DATABASE_URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_PRIVATE_KEY = "test-private-key";
    process.env.JWT_PUBLIC_KEY = "test-public-key";
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal";
    delete process.env.DATABASE_URL;

    await expect(buildApp()).rejects.toThrow(
      /Missing required environment variables for production: DATABASE_URL/,
    );
  });

  it("requires DATABASE_URL in test mode", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.DATABASE_URL;

    await expect(buildApp()).rejects.toThrow(
      /Missing required environment variables for test: DATABASE_URL/,
    );
  });

  it("requires JAVA_INTERNAL_API_BASE_URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "mysql://user:password@localhost:3306/chatai";
    process.env.JWT_PRIVATE_KEY = "test-private-key";
    process.env.JWT_PUBLIC_KEY = "test-public-key";
    delete process.env.JAVA_INTERNAL_API_BASE_URL;

    await expect(buildApp()).rejects.toThrow(
      /Missing required environment variables for production: JAVA_INTERNAL_API_BASE_URL/,
    );
  });

  it("serves workbench bootstrap resources from backend state", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const me = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/me",
    });
    const seats = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/seats",
    });
    const conversations = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations?seatId=drc&mode=single&limit=1000",
    });
    const messages = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=5",
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      displayName: "林洒",
      subUserId: "sub-user-001",
    });
    expect(seats.statusCode).toBe(200);
    expect(seats.json()[0]).toMatchObject({
      seatId: "drc",
      loginStatus: "online",
      hostSubUserId: "sub-user-001",
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json()).toMatchObject({
      hasMore: false,
      items: expect.any(Array),
      snapshotAt: expect.any(Number),
    });
    expect(conversations.json().items[0]).toMatchObject({
      conversationId: "conv-001",
      seatId: "drc",
      unreadCount: 2,
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json()).toMatchObject({
      filteredCount: 0,
      hasMore: true,
      messages: expect.any(Array),
      nextBeforeSeq: 5,
      scannedCount: 5,
    });
    expect(messages.json().messages).toHaveLength(5);
    expect(messages.json().messages[0]).toMatchObject({
      conversationId: "conv-001",
      seq: 5,
    });

    await app.close();
  });

  it("rejects invalid chat route parameters", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=abc",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
      },
      success: false,
    });

    await app.close();
  });

  it("proxies allowlisted media through the authenticated server API", async () => {
    const { app, authorization } = await createAuthenticatedApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "audio/amr",
        },
        status: 200,
      }),
    );

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: `/api/server/media/proxy?url=${encodeURIComponent("https://b5.bokr.com.cn/bilin/20260421/272/voice.amr")}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/amr");
    expect(response.body).toBe("\u0001\u0002\u0003");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://b5.bokr.com.cn/bilin/20260421/272/voice.amr",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );

    await app.close();
  });

  it("rejects media proxy requests to non-allowlisted origins", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: `/api/server/media/proxy?url=${encodeURIComponent("https://example.com/voice.amr")}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "MEDIA_URL_NOT_ALLOWED",
      },
      success: false,
    });

    await app.close();
  });

  it("returns upload credentials for an authenticated conversation", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        conversationId: "conv-001",
      },
      url: "/api/server/media/upload-credential",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      bucket: expect.any(String),
      credentials: {
        sessionToken: expect.any(String),
        tmpSecretId: expect.any(String),
        tmpSecretKey: expect.any(String),
      },
      region: expect.any(String),
    });

    await app.close();
  });

  it("returns an empty message page when limit is zero", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=0",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      filteredCount: 0,
      hasMore: false,
      messages: [],
      scannedCount: 0,
    });

    await app.close();
  });

  it("returns revoke events in message pages for frontend-side signal handling", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-revoke-only/messages?limit=2",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      filteredCount: 0,
      hasMore: true,
      messages: [
        {
          contentType: "revoke",
        },
        {
          contentType: "revoke",
        },
      ],
      nextBeforeSeq: 9,
      scannedCount: 2,
    });

    await app.close();
  });

  it("returns group members for a group conversation", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-004/group-members",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      conversationId: "conv-004",
      groupSeatId: "group-seat-conv-004",
      thirdGroupId: "third-group-conv-004",
    });
    expect(response.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: "群主小可",
          thirdUserId: "member-owner",
          type: 2,
        }),
        expect.objectContaining({
          displayName: "小林",
          thirdUserId: "member-admin",
          type: 1,
        }),
        expect.objectContaining({
          displayName: "丹阳草莓",
          thirdUserId: "member-user",
          type: 0,
        }),
      ]),
    );

    await app.close();
  });

  it("keeps pinned conversations before newer unpinned conversations", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const send = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        clientMessageId: "local-sort-test-001",
        content: "未置顶会话的新消息",
        contentType: "text",
        conversationId: "conv-002",
        seatId: "drc",
      },
      url: "/api/server/messages/send",
    });
    const conversations = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations?seatId=drc",
    });

    expect(send.statusCode).toBe(200);
    expect(conversations.statusCode).toBe(200);
    const conversationIds = conversations
      .json()
      .items
      .map((conversation: { conversationId: string }) => conversation.conversationId);

    expect(conversationIds.slice(0, 2)).toEqual(["conv-001", "conv-002"]);

    await app.close();
  });

  it("updates read state and emits poll changes after marking a conversation read", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const read = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-001/read",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-001&active_message_seq=0",
    });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      conversationId: "conv-001",
      seatId: "drc",
      unreadCount: 0,
    });
    expect(read.json().seatUnreadCount).toBeGreaterThan(0);
    expect(poll.statusCode).toBe(200);
    expect(poll.json()).toMatchObject({
      activeConversationMessages: [],
      nextVersion: expect.any(Number),
    });
    expect(poll.json().seatChanges[0]).toMatchObject({
      seatId: "drc",
      unreadCount: read.json().seatUnreadCount,
    });
    expect(poll.json().conversationChanges[0]).toMatchObject({
      conversationId: "conv-001",
      type: "upsert",
      unreadCount: 0,
    });

    await app.close();
  });

  it("updates unread state and emits poll changes after marking a conversation unread", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const unread = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-002/unread",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-002&active_message_seq=0",
    });

    expect(unread.statusCode).toBe(200);
    expect(unread.json()).toMatchObject({
      conversationId: "conv-002",
      seatId: "drc",
      unreadCount: 1,
    });
    expect(unread.json().seatUnreadCount).toBeGreaterThan(0);
    expect(poll.statusCode).toBe(200);
    expect(poll.json()).toMatchObject({
      activeConversationMessages: [],
      nextVersion: expect.any(Number),
    });
    expect(poll.json().seatChanges[0]).toMatchObject({
      seatId: "drc",
      unreadCount: unread.json().seatUnreadCount,
    });
    expect(poll.json().conversationChanges[0]).toMatchObject({
      conversationId: "conv-002",
      type: "upsert",
      unreadCount: 1,
    });

    await app.close();
  });

  it("updates pinned state and emits poll changes after pinning a conversation", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const pin = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-002/pin",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-002&active_message_seq=0",
    });

    expect(pin.statusCode).toBe(200);
    expect(pin.json()).toEqual({
      conversationId: "conv-002",
      isPinned: true,
      seatId: "drc",
    });
    expect(poll.statusCode).toBe(200);
    expect(poll.json().conversationChanges[0]).toMatchObject({
      conversationId: "conv-002",
      isPinned: true,
      type: "upsert",
    });

    await app.close();
  });

  it("updates pinned state and emits poll changes after unpinning a conversation", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const unpin = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-001/unpin",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-001&active_message_seq=0",
    });

    expect(unpin.statusCode).toBe(200);
    expect(unpin.json()).toEqual({
      conversationId: "conv-001",
      isPinned: false,
      seatId: "drc",
    });
    expect(poll.statusCode).toBe(200);
    expect(poll.json().conversationChanges[0]).toMatchObject({
      conversationId: "conv-001",
      isPinned: false,
      type: "upsert",
    });

    await app.close();
  });

  it("removes a conversation and emits poll changes after deleting it", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-002/delete",
    });
    const conversations = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations?seatId=drc",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-002&active_message_seq=0",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      conversationId: "conv-002",
      seatId: "drc",
      seatUnreadCount: 13,
    });
    expect(conversations.json().items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: "conv-002" }),
      ]),
    );
    expect(poll.statusCode).toBe(200);
    expect(poll.json().conversationChanges[0]).toEqual({
      conversationId: "conv-002",
      seatId: "drc",
      type: "remove",
    });

    await app.close();
  });

  it("accepts sent messages and reports final send status through polling", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const send = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        clientMessageId: "local-test-001",
        content: "后端 mock 发送测试",
        contentType: "text",
        conversationId: "conv-001",
        seatId: "drc",
      },
      url: "/api/server/messages/send",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-001&active_message_seq=0",
    });

    expect(send.statusCode).toBe(200);
    expect(send.json()).toMatchObject({
      clientMessageId: "local-test-001",
      messageId: expect.stringMatching(/^msg-server-/),
      status: "accepted",
    });
    expect(poll.statusCode).toBe(200);
    expect(poll.json().conversationChanges[0]).toMatchObject({
      conversationId: "conv-001",
      lastMessage: "后端 mock 发送测试",
      type: "upsert",
    });
    expect(poll.json().messageStatusChanges[0]).toMatchObject({
      clientMessageId: "local-test-001",
      conversationId: "conv-001",
      status: "sent",
    });

    await app.close();
  });

  it("expands segmented sends into separate backend messages", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const send = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        clientMessageId: "local-segment-test-001",
        conversationId: "conv-001",
        seatId: "drc",
        segments: [
          {
            text: "第一段[打脸]",
            type: "text",
          },
          {
            alt: "截图",
            height: 240,
            localUrl: "data:image/png;base64,abc",
            type: "image",
            width: 320,
          },
          {
            text: "第二段[强]",
            type: "text",
          },
        ],
      },
      url: "/api/server/messages/send",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-001&active_message_seq=0",
    });
    const messages = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=20",
    });

    expect(send.statusCode).toBe(200);
    expect(send.json().messages).toMatchObject([
      {
        clientMessageId: "local-segment-test-001",
        status: "accepted",
      },
      {
        clientMessageId: "local-segment-test-001_2",
        status: "accepted",
      },
      {
        clientMessageId: "local-segment-test-001_3",
        status: "accepted",
      },
    ]);
    expect(poll.statusCode).toBe(200);
    expect(poll.json().messageStatusChanges).toMatchObject([
      {
        clientMessageId: "local-segment-test-001",
        conversationId: "conv-001",
        status: "sent",
      },
      {
        clientMessageId: "local-segment-test-001_2",
        conversationId: "conv-001",
        status: "sent",
      },
      {
        clientMessageId: "local-segment-test-001_3",
        conversationId: "conv-001",
        status: "sent",
      },
    ]);
    expect(messages.statusCode).toBe(200);
    expect(messages.json().messages.slice(-3)).toMatchObject([
      {
        clientMessageId: "local-segment-test-001",
        content: {
          text: "第一段[打脸]",
        },
        contentType: "text",
      },
      {
        clientMessageId: "local-segment-test-001_2",
        content: {
          alt: "截图",
          imageUrl: "data:image/png;base64,abc",
        },
        contentType: "image",
      },
      {
        clientMessageId: "local-segment-test-001_3",
        content: {
          text: "第二段[强]",
        },
        contentType: "text",
      },
    ]);

    await app.close();
  });

  it("rejects sends when the seat does not own the conversation", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        clientMessageId: "local-seat-mismatch-001",
        content: "错误席位不能发送",
        contentType: "text",
        conversationId: "conv-001",
        seatId: "ndt",
      },
      url: "/api/server/messages/send",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "CONVERSATION_NOT_FOUND",
      },
      success: false,
    });

    await app.close();
  });

  it("rejects chat writes for viewer role sessions", async () => {
    const { app, authorization } = await createAuthenticatedAppWithRole("viewer");

    const send = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        clientMessageId: "viewer-send-001",
        content: "只读客服不能发送",
        contentType: "text",
        conversationId: "conv-001",
        seatId: "drc",
      },
      url: "/api/server/messages/send",
    });
    const takeOver = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/seats/ndt/take-over",
    });
    const markRead = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/conversations/conv-001/read",
    });
    const uploadCredential = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        conversationId: "conv-001",
      },
      url: "/api/server/media/upload-credential",
    });

    for (const response of [send, takeOver, markRead, uploadCredential]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: {
          code: "FORBIDDEN",
          message: "无权限访问",
        },
        success: false,
      });
    }

    await app.close();
  });

  it("takes over a seat and returns the updated seat", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/seats/ndt/take-over",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      seat: {
        hostSubUserId: "sub-user-001",
        seatId: "ndt",
      },
    });

    await app.close();
  });
});

function windowlessBase64Encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function readSetCookieValue(
  response: { headers: Record<string, unknown> },
  cookieName: string,
) {
  const cookie = readSetCookieHeader(response, cookieName);

  return decodeURIComponent(cookie.split(";")[0]?.split("=")[1] ?? "");
}

function readSetCookieHeader(
  response: { headers: Record<string, unknown> },
  cookieName: string,
) {
  const cookie = getSetCookieHeaders(response).find((header) =>
    header.startsWith(`${cookieName}=`),
  );

  if (!cookie) {
    throw new Error(`Missing ${cookieName} cookie`);
  }

  return cookie;
}

function buildCookieHeader(
  response: { headers: Record<string, unknown> },
  ...cookieNames: string[]
) {
  return cookieNames
    .map((cookieName) => `${cookieName}=${encodeURIComponent(readSetCookieValue(response, cookieName))}`)
    .join("; ");
}

function getSetCookieHeaders(response: { headers: Record<string, unknown> }) {
  const setCookie = response.headers["set-cookie"];

  return Array.isArray(setCookie)
    ? setCookie.map(String)
    : typeof setCookie === "string"
      ? [setCookie]
      : [];
}

async function createSolvedAltchaPayload(app: Awaited<ReturnType<typeof buildApp>>) {
  const challengeResponse = await app.inject({
    method: "GET",
    url: "/api/auth/altcha/challenge",
  });
  const challenge = challengeResponse.json<Challenge>();
  const solution = await solveChallenge({
    challenge,
    deriveKey,
    timeout: 10000,
  });

  expect(solution).not.toBeNull();

  return windowlessBase64Encode(
    JSON.stringify({
      challenge,
      solution,
    }),
  );
}

function createAuthDbMock(
  record: {
    account: string;
    id: number;
    name: string;
    password_hash: string;
    platform: number;
    role?: string;
    type?: number;
    uid: number;
  },
  options: {
    onSessionWrite?: (values: Record<string, unknown>) => void;
  } = {},
) {
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
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user") {
            return record;
          }

          if (table === "xy_wap_embed_sub_user_session") {
            return matchesSession(session, wheres) ? session : undefined;
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
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_sub_user_session") {
        throw new Error(`Unexpected update table: ${table}`);
      }

      const builder = {
        execute: async () => [],
        set: (
          values:
            | Record<string, unknown>
            | ((expressionBuilder: unknown) => Record<string, unknown>),
        ) => {
          const resolved =
            typeof values === "function"
              ? values({
                  eb: () => session.session_version + 1,
                })
              : values;

          options.onSessionWrite?.(resolved);
          session = {
            ...session,
            ...(resolved as Partial<typeof session>),
          };

          return builder;
        },
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
          options.onSessionWrite?.(values);
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

function createSettingsDbMock(currentSubUser: {
  account: string;
  id: number;
  name: string;
  platform: number;
  role: string;
  type: number;
  uid: number;
}) {
  const session = {
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    id: 501,
    refresh_token_hash: "",
    revoked_at: null as Date | null,
    session_version: 1,
    sub_user_id: currentSubUser.id,
  };
  const subAccounts = new Map<number, {
    account: string;
    id: number;
    name: string;
    password_hash: string;
    platform: number;
    role: string;
    status: number;
    type: number;
    uid: number;
  }>([
    [
      currentSubUser.id,
      {
        ...currentSubUser,
        password_hash: "hash",
        status: 1,
      },
    ],
    [
      601,
      {
        account: "owner001",
        id: 601,
        name: "主账号",
        password_hash: "hash",
        platform: currentSubUser.platform,
        role: "operator",
        status: 1,
        type: 1,
        uid: currentSubUser.uid,
      },
    ],
  ]);
  let lastInsertedId = 201;

  return {
    deleteFrom() {
      const builder = {
        execute: async () => [],
        where: () => builder,
      };

      return builder;
    },
    insertInto(table: string) {
      const builder = {
        execute: async () => [],
        executeTakeFirstOrThrow: async () => ({ insertId: lastInsertedId }),
        values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
          if (table === "xy_wap_embed_sub_user") {
            const row = values as Record<string, unknown>;
            lastInsertedId += 1;
            subAccounts.set(lastInsertedId, {
              account: String(row.account),
              id: lastInsertedId,
              name: String(row.name),
              password_hash: String(row.password_hash),
              platform: Number(row.platform),
              role: String(row.role ?? "operator"),
              status: Number(row.status),
              type: Number(row.type),
              uid: Number(row.uid),
            });
          }

          return builder;
        },
      };

      return builder;
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_sub_user_session") {
            return matchesSimpleWheres(session as Record<string, unknown>, wheres)
              ? [session]
              : [];
          }

          if (table === "xy_wap_embed_user_seat") {
            return [];
          }

          if (table.includes("xy_wap_embed_user_seat_sub_relation")) {
            return [];
          }

          if (table === "xy_wap_embed_sub_user" || table.includes("xy_wap_embed_sub_user")) {
            return Array.from(subAccounts.values()).filter((row) =>
              matchesSimpleWheres(row, wheres),
            );
          }

          return [];
        },
        executeTakeFirst: async () => {
          if (table === "xy_wap_embed_sub_user_session") {
            return matchesSimpleWheres(session as Record<string, unknown>, wheres)
              ? session
              : undefined;
          }

          return (await builder.execute())[0];
        },
        executeTakeFirstOrThrow: async () => {
          const result = await builder.executeTakeFirst();

          if (!result) {
            throw new Error(`No row for table: ${table}`);
          }

          return result;
        },
        innerJoin: () => builder,
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
      const wheres: Array<[string, string, unknown]> = [];
      let nextValues: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_sub_user") {
            for (const [id, row] of subAccounts) {
              if (matchesSimpleWheres(row, wheres)) {
                subAccounts.set(id, {
                  ...row,
                  ...(nextValues as Partial<typeof row>),
                });
              }
            }
          }

          return [];
        },
        set: (values: Record<string, unknown>) => {
          nextValues = values;
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
}

function matchesSimpleWheres(
  row: Record<string, unknown>,
  wheres: Array<[string, string, unknown]>,
) {
  return wheres.every(([column, operator, value]) => {
    const key = column.split(".").at(-1) ?? column;
    const rowValue = row[key];

    if (operator === "=") {
      return String(rowValue) === String(value);
    }

    if (operator === "!=") {
      return String(rowValue) !== String(value);
    }

    if (operator === "in" && Array.isArray(value)) {
      return value.map(String).includes(String(rowValue));
    }

    return true;
  });
}

function createReadyDbMock() {
  return {
    selectNoFrom(callback: (expressionBuilder: {
      val: (value: number) => { as: (alias: string) => { alias: string; value: number } };
    }) => unknown) {
      callback({
        val(value: number) {
          return {
            as(alias: string) {
              return { alias, value };
            },
          };
        },
      });

      return {
        executeTakeFirstOrThrow: async () => ({ schema_check: 1 }),
      };
    },
  } as never;
}

function matchesSession(
  session: {
    expires_at: Date;
    id: number;
    refresh_token_hash: string;
    revoked_at: Date | null;
    session_version: number;
    sub_user_id: number;
  },
  wheres: Array<[string, string, unknown]>,
) {
  if (session.revoked_at) {
    return false;
  }

  if (!session.refresh_token_hash) {
    return false;
  }

  return wheres.every(([column, operator, value]) => {
    const sessionValue = session[column as keyof typeof session];

    if (operator === "is" && value === null) {
      return sessionValue === null;
    }

    if (operator === "=") {
      return String(sessionValue) === String(value);
    }

    if (operator === ">") {
      return sessionValue instanceof Date && value instanceof Date && sessionValue > value;
    }

    return true;
  });
}

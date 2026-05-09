import { afterEach, describe, expect, it } from "vitest";
import { solveChallenge, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/scrypt";
import argon2 from "argon2";
import { buildApp } from "../src/app";

async function createAuthenticatedApp() {
  const app = await buildApp();
  const token = app.jwt.sign({
    subUserId: "sub-user-001",
    roles: ["agent"],
  });

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("backend app", () => {
  afterEach(() => {
    delete process.env.ALTCHA_COST;
    delete process.env.ALTCHA_COUNTER_MAX;
    delete process.env.ALTCHA_COUNTER_MIN;
    delete process.env.ALTCHA_HMAC_SECRET;
    delete process.env.ALTCHA_MEMORY_COST;
    delete process.env.ALTCHA_PARALLELISM;
    delete process.env.AUTH_DEV_BYPASS;
    delete process.env.JWT_DEV_SECRET;
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.NODE_ENV;
  });

  it("serves health and readiness endpoints", async () => {
    const app = await buildApp();

    const health = await app.inject({ method: "GET", url: "/healthz" });
    const readiness = await app.inject({ method: "GET", url: "/readyz" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      database: {
        configured: false,
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
        accessToken: expect.any(String),
        expiresIn: 1200,
        subUser: {
          displayName: "客服一号",
          subUserId: "101",
        },
        tokenType: "Bearer",
      },
      success: true,
    });

    const decoded = app.jwt.verify(response.json().data.accessToken);

    expect(decoded).toMatchObject({
      roles: ["agent"],
      subUserId: "101",
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

  it("allows unauthenticated server routes only with explicit development auth bypass", async () => {
    process.env.AUTH_DEV_BYPASS = "true";
    process.env.NODE_ENV = "development";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/server/me",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      displayName: "林洒",
      subUserId: "sub-user-001",
    });

    await app.close();
  });

  it("does not allow auth bypass outside development", async () => {
    process.env.AUTH_DEV_BYPASS = "true";
    process.env.JWT_PRIVATE_KEY = "test-jwt-secret";
    process.env.JWT_PUBLIC_KEY = "test-jwt-secret";
    process.env.NODE_ENV = "production";
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

    await expect(buildApp()).rejects.toThrow(/JWT keys.*production mode/);
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
      url: "/api/server/conversations?seatId=drc&page=1&pageSize=30",
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
    expect(conversations.json()[0]).toMatchObject({
      conversationId: "conv-001",
      seatId: "drc",
      unreadCount: 2,
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json()).toHaveLength(5);
    expect(messages.json()[0]).toMatchObject({
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

  it("returns an empty message page when limit is zero", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=0",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

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
      url: "/api/server/poll?since_version=1284&current_seat_id=drc&active_conversation_id=conv-001&active_message_seq=10",
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

function createAuthDbMock(record: {
  account: string;
  id: number;
  name: string;
  password_hash: string;
  platform: number;
  uid: number;
}) {
  return {
    selectFrom(table: string) {
      expect(table).toBe("xy_wap_embed_sub_user");

      const builder = {
        executeTakeFirst: async () => record,
        select: () => builder,
        where: () => builder,
      };

      return builder;
    },
  } as never;
}

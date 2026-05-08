import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";

async function createAuthenticatedApp() {
  const app = await buildApp();
  const token = app.jwt.sign({
    employeeId: "emp-001",
    roles: ["agent"],
  });

  return {
    app,
    authorization: `Bearer ${token}`,
  };
}

describe("backend app", () => {
  afterEach(() => {
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
      url: "/api/server/accounts",
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
      id: "emp-001",
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
    const accounts = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/accounts",
    });
    const conversations = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations?accountId=drc&page=1&pageSize=30",
    });
    const messages = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/conversations/conv-001/messages?limit=5",
    });

    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({
      displayName: "林洒",
      id: "emp-001",
    });
    expect(accounts.statusCode).toBe(200);
    expect(accounts.json()[0]).toMatchObject({
      accountId: "drc",
      loginStatus: "online",
      takenOverEmployeeId: "emp-001",
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json()[0]).toMatchObject({
      accountId: "drc",
      conversationId: "conv-001",
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
      url: "/api/server/poll?since_version=1284&current_account_id=drc&active_conversation_id=conv-001&active_message_seq=0",
    });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      accountId: "drc",
      conversationId: "conv-001",
      unreadCount: 0,
    });
    expect(read.json().accountUnreadCount).toBeGreaterThan(0);
    expect(poll.statusCode).toBe(200);
    expect(poll.json()).toMatchObject({
      activeConversationMessages: [],
      nextVersion: expect.any(Number),
    });
    expect(poll.json().accountChanges[0]).toMatchObject({
      accountId: "drc",
      unreadCount: read.json().accountUnreadCount,
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
        accountId: "drc",
        clientMessageId: "local-test-001",
        content: "后端 mock 发送测试",
        contentType: "text",
        conversationId: "conv-001",
      },
      url: "/api/server/messages/send",
    });
    const poll = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/poll?since_version=1284&current_account_id=drc&active_conversation_id=conv-001&active_message_seq=10",
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

  it("takes over an account and returns the updated account", async () => {
    const { app, authorization } = await createAuthenticatedApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/accounts/ndt/take-over",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      account: {
        accountId: "ndt",
        takenOverEmployeeId: "emp-001",
      },
    });

    await app.close();
  });
});

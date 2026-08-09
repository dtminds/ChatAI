import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountPermission } from "@chatai/contracts";
import { http, request, RequestNormalizedError, requestInstance } from "@/lib/request";
import { fetchWorkbenchSidebarIframeParams } from "@/pages/chat/api/sidebar-iframe-params";
import { useAuthStore } from "@/store/auth-store";

const mock = new MockAdapter(requestInstance);
const operatorSubUser = {
  accountType: "sub" as const,
  displayName: "客服一号",
  permissions: [
    "chat.access",
    "chat.send",
    "chat.takeover",
  ] satisfies AccountPermission[],
  role: "operator" as const,
  subUserId: "101",
};

describe("request", () => {
  afterEach(() => {
    mock.reset();
    useAuthStore.setState(useAuthStore.getInitialState(), true);
  });

  it("adds default workbench headers", async () => {
    mock.onGet("/health").reply((config) => [
      200,
      {
        accept: config.headers?.Accept,
        client: config.headers?.["X-Workbench-Client"],
        withCredentials: config.withCredentials,
      },
    ]);

    const response = await http.get<{
      accept: string;
      client: string;
      withCredentials: boolean;
    }>("/health");

    expect(response).toEqual({
      accept: "application/json",
      client: "chat-ai-ui",
      withCredentials: true,
    });
  });

  it("normalizes axios errors", async () => {
    mock.onPost("/messages").reply(503, { message: "Upstream unavailable" });

    await expect(request({ method: "POST", url: "/messages" })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error instanceof RequestNormalizedError &&
        error.message === "Upstream unavailable" &&
        error.status === 503 &&
        error.code === undefined,
    );
  });

  it("normalizes API error envelopes", async () => {
    mock.onGet("/server/accounts").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        details: {
          reason: "expired",
        },
        message: "登录已失效",
      },
      success: false,
    });

    await expect(request({ method: "GET", url: "/server/accounts", _skipAuthRetry: true })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error instanceof RequestNormalizedError &&
        error.message === "登录已失效" &&
        error.code === "UNAUTHORIZED" &&
        error.details?.reason === "expired" &&
        error.status === 401,
    );
  });

  it("rejects successful HTTP responses that contain API error envelopes", async () => {
    mock.onPost("/server/seats/ndt/take-over").reply(200, {
      error: {
        code: "FORBIDDEN",
        details: {
          javaErrorCode: 999,
        },
        message: "无权限访问",
      },
      success: false,
    });

    await expect(request({ method: "POST", url: "/server/seats/ndt/take-over" })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        error instanceof RequestNormalizedError &&
        error.message === "无权限访问" &&
        error.code === "FORBIDDEN" &&
        error.details?.javaErrorCode === 999 &&
        error.status === 200,
    );
  });

  it("throws api envelope failures as Error instances", async () => {
    mock.onGet("/server/settings/sidebar-items").reply(200, {
      error: {
        code: "INVALID_SIDEBAR_URL",
        message: "请输入有效的页面地址",
      },
      success: false,
    });

    await expect(request({ method: "GET", url: "/server/settings/sidebar-items" })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Error &&
        (error as { message?: string }).message === "请输入有效的页面地址",
    );
  });

  it("returns business result payloads that use success false with errorMsg", async () => {
    mock.onPost("/server/material-collections").reply(200, {
      success: false,
      errorMsg: "素材收录失败，请稍后重试",
    });

    await expect(
      request<{ success: false; errorMsg: string }>({
        method: "POST",
        url: "/server/material-collections",
      }),
    ).resolves.toEqual({
      success: false,
      errorMsg: "素材收录失败，请稍后重试",
    });
  });

  it("preserves the original stack when normalizing thrown errors", async () => {
    const originalError = new TypeError("请求参数无效");
    const originalStack = "TypeError: 请求参数无效\n    at request interceptor";
    originalError.stack = originalStack;
    const interceptorId = requestInstance.interceptors.request.use(() => {
      throw originalError;
    });

    try {
      const normalizedError = await request({
        method: "GET",
        url: "/server/settings/sidebar-items",
      }).catch((error: unknown) => error);

      expect(normalizedError).toBeInstanceOf(Error);
      expect((normalizedError as Error).message).toBe("请求参数无效");
      expect((normalizedError as Error).stack).toContain(originalStack);
    } finally {
      requestInstance.interceptors.request.eject(interceptorId);
    }
  });

  it("refreshes access tokens once and retries the failed request", async () => {
    mock.onGet("/server/me").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onPost("/auth/refresh").reply((config) => [
      200,
      {
        data: {
          expiresIn: 1200,
          subUser: operatorSubUser,
        },
        received: config.data,
        success: true,
      },
    ]);
    mock.onGet("/server/me").reply((config) => [
      200,
      {
        withCredentials: config.withCredentials,
      },
    ]);

    const response = await http.get<{ withCredentials: boolean }>("/server/me");

    expect(response).toEqual({
      withCredentials: true,
    });
    expect(mock.history.post[0]?.data).toBeUndefined();
  });

  it("stores refreshed auth session permissions after a successful refresh", async () => {
    mock.onGet("/server/me").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onPost("/auth/refresh").reply(200, {
      data: {
        expiresIn: 1200,
        subUser: {
          accountType: "sub",
          displayName: "客服（只读）",
          permissions: ["chat.access"],
          role: "viewer",
          subUserId: "101",
        },
      },
      success: true,
    });
    mock.onGet("/server/me").reply(200, {
      displayName: "客服（只读）",
      subUserId: "101",
    });

    await http.get("/server/me");

    expect(useAuthStore.getState().subUser).toMatchObject({
      displayName: "客服（只读）",
      permissions: ["chat.access"],
      role: "viewer",
      subUserId: "101",
    });
  });

  it("shares one refresh request across concurrent unauthorized responses", async () => {
    mock.onGet("/server/me").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onGet("/server/seats").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onPost("/auth/refresh").reply(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5));

      return [
        200,
        {
          data: {
            expiresIn: 1200,
            subUser: operatorSubUser,
          },
          success: true,
        },
      ];
    });
    mock.onGet("/server/me").reply(200, { ok: "me" });
    mock.onGet("/server/seats").reply(200, { ok: "seats" });

    const [me, seats] = await Promise.all([
      http.get<{ ok: string }>("/server/me"),
      http.get<{ ok: string }>("/server/seats"),
    ]);

    expect(me).toEqual({ ok: "me" });
    expect(seats).toEqual({ ok: "seats" });
    expect(mock.history.post).toHaveLength(1);
    expect(mock.history.post[0]?.data).toBeUndefined();
  });

  it("notifies the app when refresh fails", async () => {
    const sessionChanged = vi.fn();
    window.addEventListener("chatai:auth-session-changed", sessionChanged);
    mock.onGet("/server/me").replyOnce(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });
    mock.onPost("/auth/refresh").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });

    await expect(http.get("/server/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(sessionChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("chatai:auth-session-changed", sessionChanged);
  });

  it("blocks writes locally in support mode and allows explicitly classified reads", async () => {
    useAuthStore.getState().setSession({
      ...operatorSubUser,
      accessMode: "support_readonly",
      uid: 9001,
    });
    mock.onPost("/server/messages/send").reply(200, { ok: true });
    mock.onPost("/server/messages/download").reply(200, { ok: true });
    mock.onPost("/server/sidebar-iframe-params").reply(200, {
      fsw: "encrypted-fsw",
      rd: "encrypted-rd",
      ts: "encrypted-ts",
    });

    await expect(
      http.post("/server/messages/send", { content: "blocked" }),
    ).rejects.toMatchObject({
      code: "SUPPORT_READ_ONLY",
      status: 403,
    });
    await expect(
      http.post(
        "/server/messages/download",
        { conversationId: "conv-001", msgInfoId: 1 },
        { supportReadonlyAllowed: true },
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      fetchWorkbenchSidebarIframeParams({
        conversationId: "conv-001",
        seatId: "seat-001",
      }),
    ).resolves.toMatchObject({
      fsw: "encrypted-fsw",
      rd: "encrypted-rd",
      ts: "encrypted-ts",
    });
    expect(
      mock.history.post.filter((item) => item.url === "/server/messages/send"),
    ).toHaveLength(0);
    expect(
      mock.history.post.filter((item) => item.url === "/server/messages/download"),
    ).toHaveLength(1);
    expect(
      mock.history.post.filter((item) => item.url === "/server/sidebar-iframe-params"),
    ).toHaveLength(1);
  });

  it("does not refresh an expired support session", async () => {
    const sessionChanged = vi.fn();
    window.addEventListener("chatai:auth-session-changed", sessionChanged);
    useAuthStore.getState().setSession({
      ...operatorSubUser,
      accessMode: "support_readonly",
      uid: 9001,
    });
    mock.onGet("/server/me").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });

    await expect(http.get("/server/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(mock.history.post).toHaveLength(0);
    expect(sessionChanged).toHaveBeenCalledTimes(1);
    window.removeEventListener("chatai:auth-session-changed", sessionChanged);
  });
});

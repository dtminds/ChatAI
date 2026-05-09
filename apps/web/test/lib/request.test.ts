import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { http, request, requestInstance } from "@/lib/request";

const mock = new MockAdapter(requestInstance);

describe("request", () => {
  afterEach(() => {
    mock.reset();
  });

  it("adds default workbench headers", async () => {
    window.localStorage.setItem("chatai.accessToken", "token-001");
    mock.onGet("/health").reply((config) => [
      200,
      {
        accept: config.headers?.Accept,
        authorization: config.headers?.Authorization,
        client: config.headers?.["X-Workbench-Client"],
      },
    ]);

    const response = await http.get<{
      accept: string;
      authorization: string;
      client: string;
    }>("/health");

    expect(response).toEqual({
      accept: "application/json",
      authorization: "Bearer token-001",
      client: "chat-ai-ui",
    });
  });

  it("normalizes axios errors", async () => {
    mock.onPost("/messages").reply(503, { message: "Upstream unavailable" });

    await expect(request({ method: "POST", url: "/messages" })).rejects.toEqual({
      message: "Upstream unavailable",
      status: 503,
      code: undefined,
    });
  });

  it("normalizes API error envelopes", async () => {
    mock.onGet("/server/accounts").reply(401, {
      error: {
        code: "UNAUTHORIZED",
        message: "登录已失效",
      },
      success: false,
    });

    await expect(request({ method: "GET", url: "/server/accounts" })).rejects.toEqual({
      code: "UNAUTHORIZED",
      message: "登录已失效",
      status: 401,
    });
  });

  it("refreshes access tokens once and retries the failed request", async () => {
    window.localStorage.setItem("chatai.accessToken", "expired-access-token");
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
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
          accessToken: "fresh-access-token",
          expiresIn: 1200,
          refreshToken: "refresh-token-001",
          tokenType: "Bearer",
        },
        received: JSON.parse(config.data ?? "{}"),
        success: true,
      },
    ]);
    mock.onGet("/server/me").reply((config) => [
      200,
      {
        authorization: config.headers?.Authorization,
      },
    ]);

    const response = await http.get<{ authorization: string }>("/server/me");

    expect(response).toEqual({
      authorization: "Bearer fresh-access-token",
    });
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      refreshToken: "refresh-token-001",
    });
    expect(window.localStorage.getItem("chatai.accessToken")).toBe("fresh-access-token");
    expect(window.localStorage.getItem("chatai.refreshToken")).toBe("refresh-token-001");
  });

  it("shares one refresh request across concurrent unauthorized responses", async () => {
    window.localStorage.setItem("chatai.accessToken", "expired-access-token");
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
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
            accessToken: "fresh-access-token",
            expiresIn: 1200,
            refreshToken: "refresh-token-001",
            tokenType: "Bearer",
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
    expect(JSON.parse(mock.history.post[0]?.data ?? "{}")).toEqual({
      refreshToken: "refresh-token-001",
    });
  });

  it("clears stored tokens when refresh fails", async () => {
    window.localStorage.setItem("chatai.accessToken", "expired-access-token");
    window.localStorage.setItem("chatai.refreshToken", "refresh-token-001");
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
    expect(window.localStorage.getItem("chatai.accessToken")).toBeNull();
    expect(window.localStorage.getItem("chatai.refreshToken")).toBeNull();
  });
});

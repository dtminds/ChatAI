import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, request, requestInstance } from "@/lib/request";

const mock = new MockAdapter(requestInstance);

describe("request", () => {
  afterEach(() => {
    mock.reset();
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

    await expect(
      request({ method: "GET", url: "/server/accounts", _skipAuthRetry: true }),
    ).rejects.toEqual({
      code: "UNAUTHORIZED",
      message: "登录已失效",
      status: 401,
    });
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
});

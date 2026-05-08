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
});

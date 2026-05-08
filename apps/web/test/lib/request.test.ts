import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
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
      },
    ]);

    const response = await http.get<{ accept: string; client: string }>("/health");

    expect(response).toEqual({
      accept: "application/json",
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
});

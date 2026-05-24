import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../src/plugins/error-handler.js";

describe("error handler logging", () => {
  it("logs unhandled errors with pino err serialization field", async () => {
    const app = Fastify({
      logger: false,
    });
    const loggedErrors: unknown[] = [];

    await registerErrorHandler(app);
    app.addHook("onRequest", async (request) => {
      request.log.error = vi.fn((payload: unknown) => {
        loggedErrors.push(payload);
      });
    });
    app.get("/boom", async () => {
      throw new Error("database insert failed");
    });

    const response = await app.inject({
      method: "GET",
      url: "/boom",
    });

    expect(response.statusCode).toBe(500);
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]).toMatchObject({
      err: expect.objectContaining({
        message: "database insert failed",
        stack: expect.any(String),
      }),
      url: "/boom",
    });
    expect(loggedErrors[0]).not.toHaveProperty("error");

    await app.close();
  });
});

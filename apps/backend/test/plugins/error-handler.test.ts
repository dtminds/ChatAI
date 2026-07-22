import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../../src/plugins/error-handler.js";
import {
  BadRequestError,
  BusinessError,
  UpstreamHttpError,
} from "../../src/shared/errors.js";

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

  it("returns business errors as successful HTTP requests with an error envelope", async () => {
    const app = Fastify({
      logger: false,
    });

    await registerErrorHandler(app);
    app.get("/business-failed", async () => {
      throw new BusinessError("JAVA_BUSINESS_FAILED", "对话语意未完整", {
        error: 999,
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/business-failed",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      error: {
        code: "JAVA_BUSINESS_FAILED",
        details: {
          error: 999,
        },
        message: "对话语意未完整",
      },
      success: false,
    });

    await app.close();
  });

  it("logs business error messages and private diagnostic details without exposing them", async () => {
    const app = Fastify({
      logger: false,
    });
    const loggedWarnings: unknown[] = [];

    await registerErrorHandler(app);
    app.addHook("onRequest", async (request) => {
      request.log.warn = vi.fn((payload: unknown) => {
        loggedWarnings.push(payload);
      });
    });
    app.get("/retry-failed", async () => {
      throw new BadRequestError("RETRY_MESSAGE_FAILED", "重发失败", undefined, {
        conversationId: "conv-001",
        messageSeq: 538,
        reason: "retry_operation_not_found",
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/retry-failed",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "RETRY_MESSAGE_FAILED",
        message: "重发失败",
      },
      success: false,
    });
    expect(loggedWarnings).toHaveLength(1);
    expect(loggedWarnings[0]).toMatchObject({
      code: "RETRY_MESSAGE_FAILED",
      errorMessage: "重发失败",
      logDetails: {
        conversationId: "conv-001",
        messageSeq: 538,
        reason: "retry_operation_not_found",
      },
      statusCode: 400,
      url: "/retry-failed",
    });

    await app.close();
  });

  it("passes through upstream HTTP error status codes", async () => {
    const app = Fastify({
      logger: false,
    });

    await registerErrorHandler(app);
    app.get("/upstream-failed", async () => {
      throw new UpstreamHttpError("WORKBENCH_INTERNAL_API_FAILED", "上游服务失败", 503, {
        status: 503,
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/upstream-failed",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "WORKBENCH_INTERNAL_API_FAILED",
        details: {
          status: 503,
        },
        message: "上游服务失败",
      },
      success: false,
    });

    await app.close();
  });
});

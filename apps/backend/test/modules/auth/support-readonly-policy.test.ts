import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { assertSupportReadonlyRequestAllowed } from "../../../src/modules/auth/support-readonly-policy";

describe("support read-only policy", () => {
  it("allows the user-memory customer detail GET without route allowlisting", () => {
    expect(() => assertSupportReadonlyRequestAllowed(
      createRequest(
        "GET",
        "/api/server/ai-hosting/user-memory/customers/:thirdExternalUserId",
      ),
    )).not.toThrow();
  });

  it.each(["HEAD", "OPTIONS"])(
    "allows %s requests without route allowlisting",
    (method) => {
      expect(() => assertSupportReadonlyRequestAllowed(
        createRequest(method, "/api/server/future-read-route/:id"),
      )).not.toThrow();
    },
  );

  it("allows the read-only sidebar iframe parameter signer", () => {
    expect(() => assertSupportReadonlyRequestAllowed(
      createRequest("POST", "/api/server/sidebar-iframe-params"),
    )).not.toThrow();
  });

  it("blocks POST requests that are not explicit read operations", () => {
    expect(() => assertSupportReadonlyRequestAllowed(
      createRequest("POST", "/api/server/future-write-route"),
    )).toThrowError(expect.objectContaining({
      code: "SUPPORT_READ_ONLY",
      statusCode: 403,
    }));
  });
});

function createRequest(method: string, route: string) {
  return {
    method,
    routeOptions: { url: route },
    user: { accessMode: "support_readonly" },
  } as FastifyRequest;
}

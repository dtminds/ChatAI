import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";

const SUPPORT_READONLY_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const SUPPORT_READONLY_POST_ROUTES = new Set([
  "/api/auth/logout",
  "/api/server/messages/query-by-seqs",
  "/api/server/messages/download",
  "/api/server/messages/download-status",
  "/api/server/sidebar-iframe-params",
]);

export function assertSupportReadonlyRequestAllowed(request: FastifyRequest) {
  if (request.user.accessMode !== "support_readonly") {
    return;
  }

  const method = request.method.toUpperCase();
  const route = request.routeOptions.url ?? "";
  const allowed = SUPPORT_READONLY_SAFE_METHODS.has(method)
    || method === "POST" && SUPPORT_READONLY_POST_ROUTES.has(route);

  if (!allowed) {
    throw new ForbiddenError(
      "SUPPORT_READ_ONLY",
      "诊断模式无法执行该操作",
    );
  }
}

import type { FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";

const SUPPORT_READONLY_GET_ROUTES = new Set([
  "/api/auth/session",
  "/api/server/me",
  "/api/server/broadcast-protection",
  "/api/server/seats",
  "/api/server/customers",
  "/api/server/customers/:thirdExternalUserId/seat-relations",
  "/api/server/customers/:thirdExternalUserId/last-conversation",
  "/api/server/customers/:thirdExternalUserId/relation-conversations",
  "/api/server/media/playable-voice",
  "/api/server/conversations",
  "/api/server/conversations/:conversationId",
  "/api/server/conversations/:conversationId/messages",
  "/api/server/messages/:messageSeq/chat-record",
  "/api/server/conversations/:conversationId/history-messages",
  "/api/server/conversations/:conversationId/full-auto/answer-status",
  "/api/server/conversations/:conversationId/group-members",
  "/api/server/material-collections/groups",
  "/api/server/material-collections/materials",
  "/api/server/quick-replies/categories",
  "/api/server/quick-replies/category-content",
  "/api/server/quick-replies",
  "/api/server/poll",
  "/api/server/search",
]);

const SUPPORT_READONLY_POST_ROUTES = new Set([
  "/api/auth/logout",
  "/api/server/messages/query-by-seqs",
  "/api/server/messages/download",
  "/api/server/messages/download-status",
]);

export function assertSupportReadonlyRequestAllowed(request: FastifyRequest) {
  if (request.user.accessMode !== "support_readonly") {
    return;
  }

  const method = request.method.toUpperCase();
  const route = request.routeOptions.url ?? "";
  const allowed = method === "GET"
    ? SUPPORT_READONLY_GET_ROUTES.has(route)
    : method === "POST" && SUPPORT_READONLY_POST_ROUTES.has(route);

  if (!allowed) {
    throw new ForbiddenError(
      "SUPPORT_READ_ONLY",
      "问题排查模式仅支持查看和下载",
    );
  }
}

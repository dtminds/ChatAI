import {
  isChatEmbedHostname,
  parseChatEmbedHostnames,
} from "@chatai/contracts";
import type { FastifyRequest } from "fastify";
import { NotFoundError } from "../../shared/errors.js";
import type { AuthSessionKind } from "./auth-session-store.js";

export function getRequestAuthSessionKind(
  request: Pick<FastifyRequest, "hostname">,
): AuthSessionKind {
  const configuredHostnames = parseChatEmbedHostnames(
    process.env.CHAT_EMBED_HOSTNAMES,
  );

  return isChatEmbedHostname(request.hostname, configuredHostnames)
    ? "embed"
    : "app";
}

export function requireAuthHost(
  request: Pick<FastifyRequest, "hostname">,
  expectedKind: AuthSessionKind,
) {
  if (getRequestAuthSessionKind(request) !== expectedKind) {
    throw new NotFoundError("ROUTE_NOT_FOUND", "页面不存在");
  }
}

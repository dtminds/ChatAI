import type {} from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";

export const EMBED_REFRESH_TOKEN_COOKIE_NAME = "chatai_embed_refresh_token";

const embedRefreshTokenCookieOptions = {
  httpOnly: true,
  path: "/api/embed/auth",
  sameSite: "strict" as const,
};

export function setEmbedRefreshCookie(
  reply: FastifyReply,
  refreshToken: string,
  maxAge: number,
) {
  reply.setCookie(EMBED_REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...embedRefreshTokenCookieOptions,
    maxAge,
    secure: isSecureCookieEnabled(),
  });
}

export function clearEmbedRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(EMBED_REFRESH_TOKEN_COOKIE_NAME, {
    ...embedRefreshTokenCookieOptions,
    secure: isSecureCookieEnabled(),
  });
}

export function readEmbedRefreshCookie(request: FastifyRequest) {
  return request.cookies[EMBED_REFRESH_TOKEN_COOKIE_NAME];
}

function isSecureCookieEnabled() {
  if (process.env.AUTH_COOKIE_SECURE === "false") {
    return false;
  }

  if (process.env.AUTH_COOKIE_SECURE === "true") {
    return true;
  }

  return process.env.NODE_ENV === "production";
}

import type { FastifyReply, FastifyRequest } from "fastify";

export const ACCESS_TOKEN_COOKIE_NAME = "chatai_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "chatai_refresh_token";

const cookiePath = "/api";
const sameSite = "Lax";

type AuthCookieInput = {
  accessToken: string;
  accessTokenMaxAgeSeconds: number;
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
};

export function setAuthCookies(reply: FastifyReply, input: AuthCookieInput) {
  reply.header("set-cookie", [
    serializeCookie(ACCESS_TOKEN_COOKIE_NAME, input.accessToken, {
      maxAge: input.accessTokenMaxAgeSeconds,
    }),
    serializeCookie(REFRESH_TOKEN_COOKIE_NAME, input.refreshToken, {
      maxAge: input.refreshTokenMaxAgeSeconds,
    }),
  ]);
}

export function clearAuthCookies(reply: FastifyReply) {
  reply.header("set-cookie", [
    serializeCookie(ACCESS_TOKEN_COOKIE_NAME, "", { maxAge: 0 }),
    serializeCookie(REFRESH_TOKEN_COOKIE_NAME, "", { maxAge: 0 }),
  ]);
}

export function readAuthCookie(
  request: FastifyRequest,
  name: typeof ACCESS_TOKEN_COOKIE_NAME | typeof REFRESH_TOKEN_COOKIE_NAME,
) {
  return parseCookieHeader(request.headers.cookie)[name];
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number },
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAge}`,
    `Path=${cookiePath}`,
    "HttpOnly",
    `SameSite=${sameSite}`,
  ];

  if (isSecureCookieEnabled()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseCookieHeader(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        const name = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
        const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";

        return [name, decodeURIComponent(value)];
      }),
  );
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

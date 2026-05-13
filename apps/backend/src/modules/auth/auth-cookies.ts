import type { FastifyReply, FastifyRequest } from "fastify";

export const ACCESS_TOKEN_COOKIE_NAME = "chatai_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "chatai_refresh_token";

const cookiePath = "/api";
const authCookieOptions = {
  httpOnly: true,
  path: cookiePath,
  sameSite: "lax" as const,
};

type AuthCookieInput = {
  accessToken: string;
  accessTokenMaxAgeSeconds: number;
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
};

export function setAuthCookies(reply: FastifyReply, input: AuthCookieInput) {
  reply
    .setCookie(ACCESS_TOKEN_COOKIE_NAME, input.accessToken, {
      ...authCookieOptions,
      maxAge: input.accessTokenMaxAgeSeconds,
      secure: isSecureCookieEnabled(),
    })
    .setCookie(REFRESH_TOKEN_COOKIE_NAME, input.refreshToken, {
      ...authCookieOptions,
      maxAge: input.refreshTokenMaxAgeSeconds,
      secure: isSecureCookieEnabled(),
    });
}

export function clearAuthCookies(reply: FastifyReply) {
  reply
    .clearCookie(ACCESS_TOKEN_COOKIE_NAME, authCookieOptions)
    .clearCookie(REFRESH_TOKEN_COOKIE_NAME, authCookieOptions);
}

export function readAuthCookie(
  request: FastifyRequest,
  name: typeof ACCESS_TOKEN_COOKIE_NAME | typeof REFRESH_TOKEN_COOKIE_NAME,
) {
  return request.cookies[name];
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

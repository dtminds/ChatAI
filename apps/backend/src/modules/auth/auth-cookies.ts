import type { FastifyReply, FastifyRequest } from "fastify";

export const ACCESS_TOKEN_COOKIE_NAME = "chatai_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "chatai_refresh_token";

const accessTokenCookiePath = "/api";
const refreshTokenCookiePath = "/api/auth/refresh";
const sharedAuthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
};
const accessTokenCookieOptions = {
  ...sharedAuthCookieOptions,
  path: accessTokenCookiePath,
};
const refreshTokenCookieOptions = {
  ...sharedAuthCookieOptions,
  path: refreshTokenCookiePath,
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
      ...accessTokenCookieOptions,
      maxAge: input.accessTokenMaxAgeSeconds,
      secure: isSecureCookieEnabled(),
    })
    .setCookie(REFRESH_TOKEN_COOKIE_NAME, input.refreshToken, {
      ...refreshTokenCookieOptions,
      maxAge: input.refreshTokenMaxAgeSeconds,
      secure: isSecureCookieEnabled(),
    });
}

export function clearAuthCookies(reply: FastifyReply) {
  reply
    .clearCookie(ACCESS_TOKEN_COOKIE_NAME, accessTokenCookieOptions)
    .clearCookie(REFRESH_TOKEN_COOKIE_NAME, refreshTokenCookieOptions);
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

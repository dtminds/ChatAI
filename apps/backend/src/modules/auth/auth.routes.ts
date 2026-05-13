import {
  apiError,
  apiSuccess,
  AuthLoginRequestSchema,
  AuthRefreshRequestSchema,
  type AuthLoginRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAltchaChallenge, verifyAltchaPayload } from "./altcha.service.js";
import {
  getCurrentSession,
  loginWithPassword,
  refreshAccessToken,
  revokeSession,
} from "./auth.service.js";
import {
  clearAuthCookies,
  readAuthCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setAuthCookies,
} from "./auth-cookies.js";

const AltchaVerifyBodySchema = Type.Object({
  altcha: Type.String(),
});

type AltchaVerifyBody = Static<typeof AltchaVerifyBodySchema>;

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/altcha/challenge", async () => createAltchaChallenge());

  app.post<{ Body: AltchaVerifyBody }>(
    "/api/auth/altcha/verify",
    {
      schema: {
        body: AltchaVerifyBodySchema,
      },
    },
    async (request, reply) => {
      const result = await verifyAltchaPayload(request.body.altcha);

      if (!result.verified) {
        return reply
          .code(403)
          .send(apiError("ALTCHA_VERIFICATION_FAILED", "人机验证失败"));
      }

      return apiSuccess({ verified: true });
    },
  );

  app.post<{ Body: AuthLoginRequest }>(
    "/api/auth/login",
    {
      schema: {
        body: AuthLoginRequestSchema,
      },
    },
    async (request, reply) => {
      const login = await loginWithPassword(app, request.body, {
        ip: getRequestIp(request),
        userAgent: request.headers["user-agent"],
      });

      setAuthCookies(reply, {
        accessToken: login.accessToken,
        accessTokenMaxAgeSeconds: login.expiresIn,
        refreshToken: login.refreshToken,
        refreshTokenMaxAgeSeconds: login.refreshTokenExpiresIn,
      });

      return apiSuccess({
        expiresIn: login.expiresIn,
        subUser: login.subUser,
      });
    },
  );
  app.post(
    "/api/auth/refresh",
    {
      schema: {
        body: AuthRefreshRequestSchema,
      },
    },
    async (request, reply) => {
      const refreshToken = readAuthCookie(request, REFRESH_TOKEN_COOKIE_NAME);

      if (!refreshToken) {
        clearAuthCookies(reply);

        return reply
          .code(401)
          .send(apiError("UNAUTHORIZED", "登录已失效"));
      }

      try {
        const refresh = await refreshAccessToken(app, refreshToken);

        setAuthCookies(reply, {
          accessToken: refresh.accessToken,
          accessTokenMaxAgeSeconds: refresh.expiresIn,
          refreshToken: refresh.refreshToken,
          refreshTokenMaxAgeSeconds: refresh.refreshTokenExpiresIn,
        });

        return apiSuccess({
          expiresIn: refresh.expiresIn,
        });
      } catch (error) {
        clearAuthCookies(reply);
        throw error;
      }
    },
  );
  app.get("/api/auth/session", { preHandler: app.authenticate }, async (request) =>
    apiSuccess({
      subUser: await getCurrentSession(app, request.user),
    }),
  );
  app.post("/api/auth/logout", { preHandler: app.authenticate }, async (request, reply) => {
    const result = await revokeSession(app, request.user);

    clearAuthCookies(reply);

    return apiSuccess(result);
  });
}

function getRequestIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return request.ip;
}

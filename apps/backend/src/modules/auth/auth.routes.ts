import {
  apiError,
  apiSuccess,
  AuthLoginRequestSchema,
  type AuthLoginRequest,
  SupportInvestigationStartRequestSchema,
  type SupportInvestigationStartRequest,
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
  setSupportAuthCookie,
} from "./auth-cookies.js";
import {
  listSupportInvestigationAccounts,
  startSupportInvestigation,
} from "./support-investigation.service.js";

const AltchaVerifyBodySchema = Type.Object({
  altcha: Type.String(),
});

type AltchaVerifyBody = Static<typeof AltchaVerifyBodySchema>;

const SupportInvestigationAccountsQuerySchema = Type.Object({
  uid: Type.String({ pattern: "^[1-9]\\d*$" }),
});

type SupportInvestigationAccountsQuery = Static<
  typeof SupportInvestigationAccountsQuerySchema
>;

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
          subUser: refresh.subUser,
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
  app.get<{ Querystring: SupportInvestigationAccountsQuery }>(
    "/api/auth/support-investigation/accounts",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: SupportInvestigationAccountsQuerySchema,
      },
    },
    async (request) => apiSuccess({
      accounts: await listSupportInvestigationAccounts(
        app,
        request.user,
        Number(request.query.uid),
      ),
    }),
  );
  app.post<{ Body: SupportInvestigationStartRequest }>(
    "/api/auth/support-investigation/start",
    {
      preHandler: app.authenticate,
      schema: {
        body: SupportInvestigationStartRequestSchema,
      },
    },
    async (request, reply) => {
      const investigation = await startSupportInvestigation(
        app,
        request.user,
        request.body,
      );

      setSupportAuthCookie(reply, {
        accessToken: investigation.accessToken,
        accessTokenMaxAgeSeconds: investigation.expiresIn,
      });

      return apiSuccess({
        expiresIn: investigation.expiresIn,
        subUser: investigation.subUser,
      });
    },
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

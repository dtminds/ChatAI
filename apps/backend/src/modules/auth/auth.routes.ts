import {
  apiError,
  apiSuccess,
  AuthEmbedSsoRequestSchema,
  AuthLoginRequestSchema,
  type AuthEmbedSsoRequest,
  type AuthLoginRequest,
  SupportInvestigationStartRequestSchema,
  type SupportInvestigationStartRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAltchaChallenge, verifyAltchaPayload } from "./altcha.service.js";
import {
  getCurrentSession,
  InvalidEmbedTicketError,
  loginWithPassword,
  loginWithSmpEmbed,
  refreshAccessToken,
  revokeSession,
} from "./auth.service.js";
import { createJavaSmpEmbedDecryptPort } from "./smp-embed-decrypt-port.js";
import {
  clearAuthCookies,
  ACCESS_TOKEN_COOKIE_NAME,
  readAuthCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setAuthCookies,
  setSupportAuthCookie,
} from "./auth-cookies.js";
import { getRequestAuthSessionKind, requireAuthHost } from "./auth-host.js";
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
      requireAuthHost(request, "app");
      const login = await loginWithPassword(app, request.body, {
        ip: getRequestIp(request),
        userAgent: request.headers["user-agent"],
      });

      setLoginCookies(reply, login);

      return apiSuccess({
        expiresIn: login.expiresIn,
        subUser: login.subUser,
      });
    },
  );
  app.post<{ Body: AuthEmbedSsoRequest }>(
    "/api/auth/embed-sso",
    {
      schema: {
        body: AuthEmbedSsoRequestSchema,
      },
    },
    async (request, reply) => {
      requireAuthHost(request, "embed");
      let login: Awaited<ReturnType<typeof loginWithSmpEmbed>>;

      try {
        login = await loginWithSmpEmbed(
          app,
          request.body,
          createJavaSmpEmbedDecryptPort(request.log),
          {
            ip: getRequestIp(request),
            userAgent: request.headers["user-agent"],
          },
          {
            accessToken: readAuthCookie(request, ACCESS_TOKEN_COOKIE_NAME),
            refreshToken: readAuthCookie(request, REFRESH_TOKEN_COOKIE_NAME),
          },
        );
      } catch (error) {
        if (error instanceof InvalidEmbedTicketError) {
          clearAuthCookies(reply);
        }
        throw error;
      }

      if (login.cookiesChanged) {
        setLoginCookies(reply, login);
      }

      return apiSuccess({
        accessToken: login.accessToken,
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
        const refresh = await refreshAccessToken(
          app,
          refreshToken,
          getRequestAuthSessionKind(request),
        );

        setLoginCookies(reply, refresh);

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
    const result = await revokeSession(
      app,
      request.user,
      getRequestAuthSessionKind(request),
    );

    clearAuthCookies(reply);

    return apiSuccess(result);
  });
}

function setLoginCookies(
  reply: Parameters<typeof setAuthCookies>[0],
  login: Awaited<ReturnType<typeof loginWithPassword>>,
) {
  if (!login.refreshToken) {
    throw new Error("Cannot set auth cookies without a refresh token");
  }

  setAuthCookies(reply, {
    accessToken: login.accessToken,
    accessTokenMaxAgeSeconds: login.expiresIn,
    refreshToken: login.refreshToken,
    refreshTokenMaxAgeSeconds: login.refreshTokenExpiresIn,
  });
}

function getRequestIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return request.ip;
}

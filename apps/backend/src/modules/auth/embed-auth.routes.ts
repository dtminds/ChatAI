import {
  apiError,
  apiSuccess,
  AuthEmbedSsoRequestSchema,
  type AuthEmbedSsoRequest,
} from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  getCurrentSession,
  InvalidEmbedHandoffTokenError,
  InvalidEmbedTicketError,
  loginWithSmpEmbed,
  refreshAccessToken,
  revokeSession,
} from "./auth.service.js";
import {
  clearEmbedRefreshCookie,
  readEmbedRefreshCookie,
  setEmbedRefreshCookie,
} from "./embed-auth-cookies.js";
import { requireAuthHost } from "./auth-host.js";
import { createJavaSmpEmbedDecryptPort } from "./smp-embed-decrypt-port.js";

export async function registerEmbedAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: AuthEmbedSsoRequest }>(
    "/api/embed/auth/sso",
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
            accessToken: readBearerToken(request),
            refreshToken: readEmbedRefreshCookie(request),
          },
        );
      } catch (error) {
        if (
          error instanceof InvalidEmbedHandoffTokenError
          || error instanceof InvalidEmbedTicketError
        ) {
          clearEmbedRefreshCookie(reply);
        }
        throw error;
      }

      if (login.cookiesChanged) {
        setLoginCookie(reply, login);
      }

      return apiSuccess({
        accessToken: login.accessToken,
        expiresIn: login.expiresIn,
        subUser: login.subUser,
      });
    },
  );

  app.post("/api/embed/auth/refresh", async (request, reply) => {
    requireAuthHost(request, "embed");
    const refreshToken = readEmbedRefreshCookie(request);

    if (!refreshToken) {
      clearEmbedRefreshCookie(reply);
      return reply
        .code(401)
        .send(apiError("UNAUTHORIZED", "登录已失效"));
    }

    try {
      const refresh = await refreshAccessToken(app, refreshToken, "embed");
      setLoginCookie(reply, refresh);

      return apiSuccess({
        accessToken: refresh.accessToken,
        expiresIn: refresh.expiresIn,
        subUser: refresh.subUser,
      });
    } catch (error) {
      clearEmbedRefreshCookie(reply);
      throw error;
    }
  });

  app.get(
    "/api/embed/auth/session",
    { preHandler: [requireEmbedHost, app.authenticate] },
    async (request) => apiSuccess({
      subUser: await getCurrentSession(app, request.user, "embed"),
    }),
  );

  app.post(
    "/api/embed/auth/logout",
    { preHandler: [requireEmbedHost, app.authenticate] },
    async (request, reply) => {
      const result = await revokeSession(app, request.user, "embed");
      clearEmbedRefreshCookie(reply);
      return apiSuccess(result);
    },
  );
}

async function requireEmbedHost(request: FastifyRequest) {
  requireAuthHost(request, "embed");
}

function setLoginCookie(
  reply: Parameters<typeof setEmbedRefreshCookie>[0],
  login: Awaited<ReturnType<typeof loginWithSmpEmbed>>,
) {
  if (!login.refreshToken) {
    throw new Error("Cannot set embed auth cookie without a refresh token");
  }

  setEmbedRefreshCookie(
    reply,
    login.refreshToken,
    login.refreshTokenExpiresIn,
  );
}

function readBearerToken(request: FastifyRequest) {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
}

function getRequestIp(request: FastifyRequest) {
  const forwardedFor = request.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return request.ip;
}

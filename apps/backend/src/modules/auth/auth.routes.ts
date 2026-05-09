import {
  apiError,
  apiSuccess,
  AuthLoginRequestSchema,
  AuthRefreshRequestSchema,
  type AuthLoginRequest,
  type AuthRefreshRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createAltchaChallenge, verifyAltchaPayload } from "./altcha.service.js";
import { loginWithPassword, refreshAccessToken, revokeSession } from "./auth.service.js";

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
    async (request) => apiSuccess(await loginWithPassword(app, request.body)),
  );
  app.post<{ Body: AuthRefreshRequest }>(
    "/api/auth/refresh",
    {
      schema: {
        body: AuthRefreshRequestSchema,
      },
    },
    async (request) => apiSuccess(await refreshAccessToken(app, request.body.refreshToken)),
  );
  app.post("/api/auth/logout", { preHandler: app.authenticate }, async (request) =>
    apiSuccess(await revokeSession(app, request.user)),
  );
}

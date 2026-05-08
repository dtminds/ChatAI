import { apiError, apiSuccess } from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createAltchaChallenge, verifyAltchaPayload } from "./altcha.service.js";

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

  app.post("/api/auth/login", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "登录接口尚未实现")),
  );
  app.post("/api/auth/refresh", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "刷新登录接口尚未实现")),
  );
  app.post("/api/auth/logout", async (_request, reply) =>
    reply.code(501).send(apiError("NOT_IMPLEMENTED", "退出登录接口尚未实现")),
  );
}

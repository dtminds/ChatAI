import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createSystemVariableService } from "./system-variable.service.js";

export async function registerSystemVariableRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/ai-hosting/system-variables",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createSystemVariableService(app.log).listAvailable(getUid(request)),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

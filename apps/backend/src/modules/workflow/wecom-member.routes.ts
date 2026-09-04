import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createWecomMemberService } from "./wecom-member.service.js";

export async function registerWecomMemberRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/workflow/wecom-members",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createWecomMemberService(app.log).listMembers(getUid(request)),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

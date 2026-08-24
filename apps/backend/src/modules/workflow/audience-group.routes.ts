import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAudienceGroupService } from "./audience-group.service.js";

export async function registerAudienceGroupRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/workflow/audience-groups",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createAudienceGroupService(app.log).listGroups(getUid(request)),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

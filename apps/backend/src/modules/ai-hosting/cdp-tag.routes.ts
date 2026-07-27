import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createCdpTagService } from "./cdp-tag.service.js";

export async function registerCdpTagRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/ai-hosting/cdp-tag-groups",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createCdpTagService(app.log).listGroups(getUid(request)),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

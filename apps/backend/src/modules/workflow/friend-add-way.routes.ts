import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createFriendAddWayService } from "./friend-add-way.service.js";

export async function registerFriendAddWayRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/workflow/friend-add-ways",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createFriendAddWayService(app.log).listAddWays(getUid(request)),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

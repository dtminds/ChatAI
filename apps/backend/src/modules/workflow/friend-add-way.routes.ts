import {
  apiSuccess,
  WorkflowFriendAddWayActivityListQuerySchema,
  type WorkflowFriendAddWayActivityListQuery,
} from "@chatai/contracts";
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

  app.get<{ Querystring: WorkflowFriendAddWayActivityListQuery }>(
    "/api/server/workflow/friend-add-way-activities",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: WorkflowFriendAddWayActivityListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createFriendAddWayService(app.log).listActivities(getUid(request), {
          addWayIds: request.query.addWayIds,
          key: request.query.key,
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
          title: request.query.title,
        }),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

function parseOptionalInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

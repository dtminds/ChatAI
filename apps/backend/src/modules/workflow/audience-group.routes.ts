import {
  apiSuccess,
  WorkflowAudienceGroupListQuerySchema,
  type WorkflowAudienceGroupListQuery,
} from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createAudienceGroupService } from "./audience-group.service.js";

export async function registerAudienceGroupRoutes(app: FastifyInstance) {
  app.get<{ Querystring: WorkflowAudienceGroupListQuery }>(
    "/api/server/workflow/audience-groups",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: WorkflowAudienceGroupListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAudienceGroupService(app.log).listGroups(getUid(request), {
          name: request.query.name,
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
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

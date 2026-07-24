import { apiSuccess, CustomFieldListQuerySchema } from "@chatai/contracts";
import type { Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createCustomFieldService } from "./custom-field.service.js";

type CustomFieldListQuery = Static<typeof CustomFieldListQuerySchema>;

export async function registerCustomFieldRoutes(app: FastifyInstance) {
  app.get<{ Querystring: CustomFieldListQuery }>(
    "/api/server/ai-hosting/custom-fields",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: CustomFieldListQuerySchema,
      },
    },
    async (request) => {
      const status =
        request.query.status === "0" ? 0 : request.query.status === "1" ? 1 : undefined;

      return apiSuccess(
        await createCustomFieldService(app.log).listFields(getUid(request), { status }),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

import { apiSuccess, WorkflowOrderShopListQuerySchema } from "@chatai/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Static } from "@sinclair/typebox";
import { createOrderQueryResourceJavaClient } from "./order-query-resource-java-client.js";

export async function registerOrderQueryResourceRoutes(
  app: FastifyInstance,
  createClient: typeof createOrderQueryResourceJavaClient = createOrderQueryResourceJavaClient,
) {
  const client = createClient(app.log);
  app.get("/api/server/workflow/order-platforms", { preHandler: app.authenticate }, async request =>
    apiSuccess({ platforms: await client.listPlatforms(getUid(request)) }));
  app.get("/api/server/workflow/order-statuses", { preHandler: app.authenticate }, async () =>
    apiSuccess({ statuses: await client.listOrderStatuses() }));
  app.get<{ Querystring: Static<typeof WorkflowOrderShopListQuerySchema> }>(
    "/api/server/workflow/order-shops",
    {
      preHandler: app.authenticate,
      schema: { querystring: WorkflowOrderShopListQuerySchema },
    },
    async request => apiSuccess({
      shops: await client.listShops(getUid(request), parsePlatformIds(request.query.platformIds)),
    }),
  );
}

function parsePlatformIds(value: string | undefined) {
  if (value === undefined) return undefined;
  return [...new Set(value.split(",").flatMap((item) => {
    const parsed = Number(item);
    return Number.isSafeInteger(parsed) && parsed > 0 ? [parsed] : [];
  }))].slice(0, 100);
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

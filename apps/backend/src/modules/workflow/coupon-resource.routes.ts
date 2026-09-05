import { apiSuccess, WorkflowCouponListQuerySchema, type WorkflowCouponListQuery } from "@chatai/contracts";
import type { FastifyInstance } from "fastify";
import { createCouponResourceJavaClient } from "./coupon-resource-java-client.js";

export async function registerCouponResourceRoutes(app: FastifyInstance, createClient = createCouponResourceJavaClient) {
  const client = createClient(app.log);
  app.get<{ Querystring: WorkflowCouponListQuery }>("/api/server/workflow/coupons", {
    preHandler: app.authenticate, schema: { querystring: WorkflowCouponListQuerySchema },
  }, async request => apiSuccess(await client.list(request.user.uid, request.query)));
}

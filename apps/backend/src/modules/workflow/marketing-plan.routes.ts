import {
  apiSuccess,
  WorkflowMarketingPlanListQuerySchema,
  type WorkflowMarketingPlanListQuery,
} from "@chatai/contracts";
import type { FastifyInstance } from "fastify";
import { createMarketingPlanService } from "./marketing-plan.service.js";

export async function registerMarketingPlanRoutes(app: FastifyInstance) {
  app.get<{ Querystring: WorkflowMarketingPlanListQuery }>(
    "/api/server/workflow/marketing-plans",
    {
      preHandler: app.authenticate,
      schema: { querystring: WorkflowMarketingPlanListQuerySchema },
    },
    async request => apiSuccess(await createMarketingPlanService(app.log).listPlans(
      request.user.uid,
      {
        page: parseInteger(request.query.page),
        pageSize: parseInteger(request.query.pageSize),
        planName: request.query.planName,
      },
    )),
  );
}

function parseInteger(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

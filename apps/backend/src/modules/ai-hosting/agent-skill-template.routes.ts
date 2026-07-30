import { apiSuccess } from "@chatai/contracts";
import type { FastifyInstance } from "fastify";
import { createAgentSkillTemplateService } from "./agent-skill-template.service.js";

export async function registerAgentSkillTemplateRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/ai-hosting/skill-templates",
    {
      preHandler: app.authenticate,
    },
    async () => {
      return apiSuccess(await createAgentSkillTemplateService(app.db).listMarketplace());
    },
  );
}

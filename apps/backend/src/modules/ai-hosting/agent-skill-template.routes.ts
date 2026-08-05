import { apiSuccess } from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { createAgentSkillTemplateService } from "./agent-skill-template.service.js";

const TemplateParamsSchema = Type.Object({
  templateId: Type.String({ pattern: "^[0-9]+$" }),
});

type TemplateParams = Static<typeof TemplateParamsSchema>;

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

  app.get<{ Params: TemplateParams }>(
    "/api/server/ai-hosting/skill-templates/:templateId",
    {
      preHandler: app.authenticate,
      schema: {
        params: TemplateParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAgentSkillTemplateService(app.db).getTemplate(
          request.params.templateId,
        ),
      );
    },
  );
}

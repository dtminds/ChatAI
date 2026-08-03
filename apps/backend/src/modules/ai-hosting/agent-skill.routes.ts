import {
  AgentSkillSaveRequestSchema,
  AgentSkillStatusUpdateRequestSchema,
  apiSuccess,
  type AgentSkillSaveRequest,
  type AgentSkillStatusUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createAgentSkillService } from "./agent-skill.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const SkillListQuerySchema = Type.Object({
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String()),
});

const SkillParamsSchema = Type.Object({
  skillId: NumericStringSchema,
});

type SkillListQuery = Static<typeof SkillListQuerySchema>;
type SkillParams = Static<typeof SkillParamsSchema>;

export async function registerAgentSkillRoutes(app: FastifyInstance) {
  app.get<{ Querystring: SkillListQuery }>(
    "/api/server/ai-hosting/skills",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: SkillListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).listSkills(getUid(request), {
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
          query: request.query.query,
        }),
      );
    },
  );

  app.get<{ Params: SkillParams }>(
    "/api/server/ai-hosting/skills/:skillId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SkillParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).getSkill(
          getUid(request),
          request.params.skillId,
        ),
      );
    },
  );

  app.post<{ Body: AgentSkillSaveRequest }>(
    "/api/server/ai-hosting/skills",
    {
      preHandler: app.authenticate,
      schema: {
        body: AgentSkillSaveRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).createSkill(
          getWriteContext(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: AgentSkillSaveRequest; Params: SkillParams }>(
    "/api/server/ai-hosting/skills/:skillId",
    {
      preHandler: app.authenticate,
      schema: {
        body: AgentSkillSaveRequestSchema,
        params: SkillParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).updateSkill(
          getWriteContext(request),
          request.params.skillId,
          request.body,
        ),
      );
    },
  );

  app.patch<{ Body: AgentSkillStatusUpdateRequest; Params: SkillParams }>(
    "/api/server/ai-hosting/skills/:skillId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: AgentSkillStatusUpdateRequestSchema,
        params: SkillParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).updateSkillStatus(
          getWriteContext(request),
          request.params.skillId,
          request.body,
        ),
      );
    },
  );

  app.delete<{ Params: SkillParams }>(
    "/api/server/ai-hosting/skills/:skillId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SkillParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentSkillService(app.db, app.log).deleteSkill(
          getWriteContext(request),
          request.params.skillId,
        ),
      );
    },
  );
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

function getWriteContext(request: FastifyRequest) {
  return {
    operatorSubUserId: request.user.subUserId,
    uid: request.user.uid,
  };
}

function parseOptionalInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function assertAiHostingManage(request: FastifyRequest) {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner") || roles.includes("admin")) {
    return;
  }

  throw new ForbiddenError("FORBIDDEN", "无权限访问");
}

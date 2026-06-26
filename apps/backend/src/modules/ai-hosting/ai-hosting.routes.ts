import {
  AiHostingAgentRenameRequestSchema,
  AiHostingAgentSaveRequestSchema,
  AiHostingAgentSettingsSaveRequestSchema,
  AiHostingAgentTestRequestSchema,
  AiHostingSettingsUpdateRequestSchema,
  apiSuccess,
  type AiHostingAgentRenameRequest,
  type AiHostingAgentSaveRequest,
  type AiHostingAgentSettingsSaveRequest,
  type AiHostingAgentTestRequest,
  type AiHostingSettingsUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createWorkbenchJavaClient } from "../chat/workbench-java-client.js";
import { AgentTestService } from "./agent-test.service.js";
import { createAiHostingService } from "./ai-hosting.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const AgentListQuerySchema = Type.Object({
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String()),
});

const AgentParamsSchema = Type.Object({
  agentId: NumericStringSchema,
});

type AgentListQuery = Static<typeof AgentListQuerySchema>;
type AgentParams = Static<typeof AgentParamsSchema>;

export async function registerAiHostingRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AgentListQuery }>(
    "/api/server/ai-hosting/agents",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: AgentListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAiHostingService(app.db).listAgents(getSubUserId(request), {
          page: parseOptionalInteger(request.query.page),
          pageSize: parseOptionalInteger(request.query.pageSize),
          query: request.query.query,
        }),
      );
    },
  );

  app.get(
    "/api/server/ai-hosting/models",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(await createAiHostingService(app.db).listModels(getSubUserId(request)));
    },
  );

  app.get(
    "/api/server/ai-hosting/hosting-settings",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createAiHostingService(app.db).listHostingSettings(getSubUserId(request)),
      );
    },
  );

  app.put<{ Body: AiHostingSettingsUpdateRequest }>(
    "/api/server/ai-hosting/hosting-settings",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingSettingsUpdateRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).updateHostingSettings(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );

  app.get<{ Params: AgentParams }>(
    "/api/server/ai-hosting/agents/:agentId",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAiHostingService(app.db).getAgent(
          getSubUserId(request),
          request.params.agentId,
        ),
      );
    },
  );

  app.post<{ Body: AiHostingAgentSaveRequest }>(
    "/api/server/ai-hosting/agents",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingAgentSaveRequestSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).createAgent(getSubUserId(request), request.body),
      );
    },
  );

  app.put<{
    Body: AiHostingAgentSettingsSaveRequest;
    Params: AgentParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingAgentSettingsSaveRequestSchema,
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).updateAgent(
          getSubUserId(request),
          request.params.agentId,
          request.body,
        ),
      );
    },
  );

  app.patch<{
    Body: AiHostingAgentRenameRequest;
    Params: AgentParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId/name",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingAgentRenameRequestSchema,
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).renameAgent(
          getSubUserId(request),
          request.params.agentId,
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: AgentParams }>(
    "/api/server/ai-hosting/agents/:agentId/publish",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).publishAgent(
          getSubUserId(request),
          request.params.agentId,
        ),
      );
    },
  );

  app.post<{ Params: AgentParams }>(
    "/api/server/ai-hosting/agents/:agentId/restore",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).restorePublishedAgent(
          getSubUserId(request),
          request.params.agentId,
        ),
      );
    },
  );

  app.post<{ Body: AiHostingAgentTestRequest }>(
    "/api/server/ai-hosting/agents/test",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingAgentTestRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await getAgentTestService(app).testAgent(getSubUserId(request), request.body),
      );
    },
  );

  app.delete<{ Params: AgentParams }>(
    "/api/server/ai-hosting/agents/:agentId",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingService(app.db).removeAgent(
          getSubUserId(request),
          request.params.agentId,
        ),
      );
    },
  );
}

function getSubUserId(request: { user?: { subUserId: string } }) {
  return request.user?.subUserId ?? "";
}

function getAgentTestService(app: FastifyInstance) {
  return new AgentTestService(app.db, createWorkbenchJavaClient(app.log));
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

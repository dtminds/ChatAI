import {
  AiHostingAgentRenameRequestSchema,
  AiHostingAgentSaveRequestSchema,
  AiHostingAgentSettingsSaveRequestSchema,
  AiHostingAgentTestRequestSchema,
  AiHostingSettingsSyncSeatGroupsRequestSchema,
  AiHostingSettingsUpdateRequestSchema,
  apiSuccess,
  type AiHostingAgentRenameRequest,
  type AiHostingAgentSaveRequest,
  type AiHostingAgentSettingsSaveRequest,
  type AiHostingAgentTestRequest,
  type AiHostingSettingsSyncSeatGroupsRequest,
  type AiHostingSettingsUpdateRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createWorkbenchJavaClient } from "../chat/workbench-java-client.js";
import { AgentTestService } from "./agent-test.service.js";
import { createAiHostingAgentService } from "./ai-hosting-agent.service.js";
import { createAiHostingQuotaService } from "./quota.service.js";
import { createAiHostingSettingsService } from "./ai-hosting-settings.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const AgentListQuerySchema = Type.Object({
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  query: Type.Optional(Type.String()),
});

const AgentParamsSchema = Type.Object({
  agentId: NumericStringSchema,
});

const UserSeatParamsSchema = Type.Object({
  userSeatId: NumericStringSchema,
});

type AgentListQuery = Static<typeof AgentListQuerySchema>;
type AgentParams = Static<typeof AgentParamsSchema>;
type UserSeatParams = Static<typeof UserSeatParamsSchema>;

export async function registerAiHostingRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/ai-hosting/quota",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(await createAiHostingQuotaService(app.db).getQuotaOverview(getUid(request)));
    },
  );

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
        await createAiHostingAgentService(app.db).listAgents(getUid(request), {
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
      return apiSuccess(await createAiHostingAgentService(app.db).listModels(getUid(request)));
    },
  );

  app.get(
    "/api/server/ai-hosting/hosting-settings",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createAiHostingSettingsService(app.db).listHostingSettings(getSubUserId(request)),
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
        await createAiHostingSettingsService(app.db).updateHostingSettings(
          getSubUserId(request),
          request.body,
        ),
      );
    },
  );

  app.post<{
    Body: AiHostingSettingsSyncSeatGroupsRequest;
    Params: UserSeatParams;
  }>(
    "/api/server/ai-hosting/hosting-settings/:userSeatId/sync-seat-groups",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingSettingsSyncSeatGroupsRequestSchema,
        params: UserSeatParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAiHostingSettingsService(app.db).syncSeatGroups(
          getSubUserId(request),
          request.params.userSeatId,
          request.body,
          createWorkbenchJavaClient(app.log),
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
        await createAiHostingAgentService(app.db).getAgent(
          getUid(request),
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
        await createAiHostingAgentService(app.db).createAgent(
          getAgentWriteContext(request),
          request.body,
        ),
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
        await createAiHostingAgentService(app.db).updateAgent(
          getAgentWriteContext(request),
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
        await createAiHostingAgentService(app.db).renameAgent(
          getAgentWriteContext(request),
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
        await createAiHostingAgentService(app.db).publishAgent(
          getAgentWriteContext(request),
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
        await createAiHostingAgentService(app.db).restorePublishedAgent(
          getAgentWriteContext(request),
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
        await createAiHostingAgentService(app.db).removeAgent(
          getAgentWriteContext(request),
          request.params.agentId,
        ),
      );
    },
  );
}

function getSubUserId(request: FastifyRequest) {
  return request.user.subUserId;
}

function getUid(request: FastifyRequest) {
  return request.user.uid;
}

function getAgentWriteContext(request: FastifyRequest) {
  return {
    operatorSubUserId: request.user.subUserId,
    uid: request.user.uid,
  };
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

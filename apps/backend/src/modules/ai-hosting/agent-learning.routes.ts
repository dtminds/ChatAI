import {
  AiHostingLearningCandidateApproveRequestSchema,
  AiHostingLearningCandidateBatchApproveRequestSchema,
  AiHostingLearningCandidateBatchRejectRequestSchema,
  AiHostingLearningCandidateIdSchema,
  AiHostingLearningCandidateRejectRequestSchema,
  AiHostingLearningCandidateStatusSchema,
  apiSuccess,
  type AiHostingLearningCandidateApproveRequest,
  type AiHostingLearningCandidateBatchApproveRequest,
  type AiHostingLearningCandidateBatchRejectRequest,
  type AiHostingLearningCandidateRejectRequest,
  type AiHostingLearningCandidateStatus,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ForbiddenError } from "../../shared/errors.js";
import { createAgentLearningService } from "./agent-learning.service.js";

const NumericStringSchema = Type.String({ pattern: "^[0-9]+$" });

const AgentParamsSchema = Type.Object({
  agentId: NumericStringSchema,
});

const CandidateParamsSchema = Type.Object({
  agentId: NumericStringSchema,
  candidateId: AiHostingLearningCandidateIdSchema,
});

const CandidateListQuerySchema = Type.Object({
  page: Type.Optional(NumericStringSchema),
  pageSize: Type.Optional(NumericStringSchema),
  status: AiHostingLearningCandidateStatusSchema,
});

type AgentParams = Static<typeof AgentParamsSchema>;
type CandidateParams = Static<typeof CandidateParamsSchema>;
type CandidateListQuery = Static<typeof CandidateListQuerySchema>;

export async function registerAgentLearningRoutes(app: FastifyInstance) {
  app.get<{ Params: AgentParams; Querystring: CandidateListQuery }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates",
    {
      preHandler: app.authenticate,
      schema: {
        params: AgentParamsSchema,
        querystring: CandidateListQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).listCandidates(
          getUid(request),
          request.params.agentId,
          {
            page: parseOptionalInteger(request.query.page),
            pageSize: parseOptionalInteger(request.query.pageSize),
            status: request.query.status as AiHostingLearningCandidateStatus,
          },
        ),
      );
    },
  );

  app.post<{
    Body: AiHostingLearningCandidateApproveRequest;
    Params: CandidateParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates/:candidateId/approve",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingLearningCandidateApproveRequestSchema,
        params: CandidateParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).approve(
          getAgentWriteContext(request),
          request.params.agentId,
          request.params.candidateId,
          request.body,
        ),
      );
    },
  );

  app.get<{ Params: CandidateParams }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates/:candidateId/search-detail",
    {
      preHandler: app.authenticate,
      schema: {
        params: CandidateParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).getSearchDetail(
          getUid(request),
          request.params.agentId,
          request.params.candidateId,
        ),
      );
    },
  );

  app.post<{
    Body: AiHostingLearningCandidateRejectRequest;
    Params: CandidateParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates/:candidateId/reject",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingLearningCandidateRejectRequestSchema,
        params: CandidateParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).reject(
          getAgentWriteContext(request),
          request.params.agentId,
          request.params.candidateId,
          request.body,
        ),
      );
    },
  );

  app.post<{
    Body: AiHostingLearningCandidateBatchApproveRequest;
    Params: AgentParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates/batch-approve",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingLearningCandidateBatchApproveRequestSchema,
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).batchApprove(
          getAgentWriteContext(request),
          request.params.agentId,
          request.body,
        ),
      );
    },
  );

  app.post<{
    Body: AiHostingLearningCandidateBatchRejectRequest;
    Params: AgentParams;
  }>(
    "/api/server/ai-hosting/agents/:agentId/learning-candidates/batch-reject",
    {
      preHandler: app.authenticate,
      schema: {
        body: AiHostingLearningCandidateBatchRejectRequestSchema,
        params: AgentParamsSchema,
      },
    },
    async (request) => {
      assertAiHostingManage(request);
      return apiSuccess(
        await createAgentLearningService(app.db, app.log).batchReject(
          getAgentWriteContext(request),
          request.params.agentId,
          request.body,
        ),
      );
    },
  );
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

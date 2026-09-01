import {
  apiSuccess,
  WorkflowCreateRequestSchema,
  WorkflowMetadataUpdateRequestSchema,
  WorkflowPublishRequestSchema,
  WorkflowReviewApproveRequestSchema,
  WorkflowReviewRejectRequestSchema,
  WorkflowReviewSubmitRequestSchema,
  WorkflowRestoreRequestSchema,
  WorkflowSaveDraftRequestSchema,
  WorkflowEntryRecordStatusSchema,
  WorkflowDefinitionListStatusSchema,
  WorkflowLlmTestAttemptCreateRequestSchema,
  WorkflowAiIntentTestAttemptCreateRequestSchema,
  type WorkflowCreateRequest,
  type WorkflowMetadataUpdateRequest,
  type WorkflowPublishRequest,
  type WorkflowReviewApproveRequest,
  type WorkflowReviewRejectRequest,
  type WorkflowReviewSubmitRequest,
  type WorkflowRestoreRequest,
  type WorkflowSaveDraftRequest,
  type WorkflowLlmTestAttemptCreateRequest,
  type WorkflowAiIntentTestAttemptCreateRequest,
  type WorkflowSurface,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Kysely } from "kysely";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";
import {
  createWorkflowEntitlementPort,
  MysqlWorkflowLlmTestAttemptRepository,
} from "@chatai/workflow-runtime";
import { MysqlWorkflowRepository } from "./workflow-mysql.repository.js";
import { WorkflowService } from "./workflow.service.js";
import { MysqlWorkflowSourceIdentityResolver } from "./workflow-source-identity.js";
import { MysqlWorkflowManagedAccountReader } from "./workflow-managed-account-reader.js";
import { MysqlWorkflowMetricReader } from "./workflow-metric-reader.js";
import { MysqlWorkflowDataReader } from "./workflow-data-mysql.repository.js";
import { WorkflowDataService } from "./workflow-data.service.js";
import { createWecomContactJavaClient } from "./wecom-contact-java-client.js";
import { registerAudienceGroupRoutes } from "./audience-group.routes.js";
import { canViewInsightsWorkerObservability } from "../insights/insights-worker-observer-access.js";
import { createJavaWorkflowDirectEntryEndpointPort } from "./direct-entry-endpoint-port.js";
import { getWorkflowActiveRunLimit } from "../../config/env.js";
import { createCustomFieldService } from "../ai-hosting/custom-field.service.js";
import { createWecomMemberService } from "./wecom-member.service.js";

const WorkflowParamsSchema = Type.Object({
  workflowId: Type.String({ pattern: "^[1-9][0-9]*$" }),
});

const WorkflowRevisionParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
]);
const WorkflowReviewParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ reviewId: Type.String({ pattern: "^[1-9][0-9]*$" }) }),
]);

type WorkflowParams = Static<typeof WorkflowParamsSchema>;
type WorkflowRevisionParams = Static<typeof WorkflowRevisionParamsSchema>;
type WorkflowReviewParams = Static<typeof WorkflowReviewParamsSchema>;

const WorkflowRecordsQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  nodeId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
  status: Type.Optional(WorkflowEntryRecordStatusSchema),
});
const WorkflowHistoryQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});
const WorkflowDefinitionListQuerySchema = Type.Object({
  cursor: Type.Optional(Type.String({ maxLength: 512, minLength: 1 })),
  limit: Type.Optional(Type.Integer({ maximum: 50, minimum: 1 })),
  query: Type.Optional(Type.String({ maxLength: 100 })),
  status: Type.Optional(WorkflowDefinitionListStatusSchema),
});
const WorkflowRecordParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ recordId: Type.String({ pattern: "^[1-9][0-9]*$" }) }),
]);
const WorkflowLlmTestNodeParamsSchema = Type.Intersect([
  WorkflowParamsSchema,
  Type.Object({ nodeId: Type.String({ minLength: 1, maxLength: 128 }) }),
]);
const WorkflowLlmTestAttemptParamsSchema = Type.Intersect([
  WorkflowLlmTestNodeParamsSchema,
  Type.Object({ attemptId: Type.String({ pattern: "^[1-9][0-9]*$" }) }),
]);

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  options: {
    dataService?: WorkflowDataService;
    observerSubjects?: ReadonlySet<string>;
    service?: WorkflowService;
  } = {},
) {
  const workflowDatabase = app.db as unknown as Kysely<WorkflowDatabase>;
  const entitlementPort = createWorkflowEntitlementPort({
    activeRunLimit: getWorkflowActiveRunLimit(),
    baseUrl: process.env.JAVA_INTERNAL_API_BASE_URL,
    cache: app.cache,
    cacheKeyPrefix: process.env.REDIS_KEY_PREFIX,
    token: process.env.JAVA_INTERNAL_API_TOKEN,
  });
  const customFieldService = createCustomFieldService(app.log);
  const service = options.service ?? new WorkflowService(
    new MysqlWorkflowRepository(workflowDatabase),
    {
      customFieldReader: {
        listActiveFields: async uid => (await customFieldService.listFields(uid, { status: 1 })).fields,
      },
      directEntryEndpointPort: createJavaWorkflowDirectEntryEndpointPort(app.log),
      entitlementPort,
      managedAccountReader: new MysqlWorkflowManagedAccountReader(app.db),
      metricReader: new MysqlWorkflowMetricReader(workflowDatabase),
      sourceIdentityResolver: new MysqlWorkflowSourceIdentityResolver(app.db),
      llmTestAttemptRepository: new MysqlWorkflowLlmTestAttemptRepository(workflowDatabase),
      logger: app.log,
      wecomMemberReader: createWecomMemberService(app.log),
    },
  );
  await registerAudienceGroupRoutes(app);
  const dataService = options.dataService ?? new WorkflowDataService(
    new MysqlWorkflowDataReader(app.db, {
      logger: app.log,
      wecomContactDirectory: createWecomContactJavaClient(app.log),
    }),
    { capacityPort: entitlementPort },
  );

  await app.register(async surfaceApp => registerWorkflowSurfaceRoutes(
    surfaceApp,
    {
      dataService,
      observerSubjects: options.observerSubjects,
      service,
      surface: "chatai",
    },
  ), { prefix: "/api/server" });
  await app.register(async surfaceApp => registerWorkflowSurfaceRoutes(
    surfaceApp,
    { dataService, service, surface: "sop_embed" },
  ), { prefix: "/api/server/embed" });
}

function registerWorkflowSurfaceRoutes(
  app: FastifyInstance,
  options: {
    dataService: WorkflowDataService;
    observerSubjects?: ReadonlySet<string>;
    service: WorkflowService;
    surface: WorkflowSurface;
  },
) {
  const { dataService, observerSubjects, service, surface } = options;
  const authenticated = { preHandler: app.authenticate };

  app.get(
    "/workflows/capacity",
    authenticated,
    async request => apiSuccess(await dataService.getCapacityOverview(getWorkflowScope(request, surface))),
  );

  app.get(
    "/workflows/overview",
    authenticated,
    async request => apiSuccess({
      ...(await dataService.getTenantOverview(getWorkflowScope(request, surface))),
      canViewWorkflowObservability: surface === "chatai"
        && canViewInsightsWorkerObservability(
          observerSubjects ?? new Set(),
          { subUserId: request.user.subUserId, uid: request.user.uid },
        ),
    }),
  );

  app.get<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/data",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async request => apiSuccess(await dataService.getOverview(
      getWorkflowScope(request, surface), request.params.workflowId,
    )),
  );

  app.get<{ Params: WorkflowParams; Querystring: Static<typeof WorkflowRecordsQuerySchema> }>(
    "/workflows/:workflowId/records",
    { ...authenticated, schema: { params: WorkflowParamsSchema, querystring: WorkflowRecordsQuerySchema } },
    async request => apiSuccess(await dataService.listRecords(getWorkflowScope(request, surface), {
      cursor: request.query.cursor,
      limit: request.query.limit ?? 50,
      nodeId: request.query.nodeId,
      status: request.query.status,
      workflowId: request.params.workflowId,
    })),
  );

  app.get<{ Params: Static<typeof WorkflowRecordParamsSchema> }>(
    "/workflows/:workflowId/records/:recordId",
    { ...authenticated, schema: { params: WorkflowRecordParamsSchema } },
    async request => apiSuccess(await dataService.getRecord(
      getWorkflowScope(request, surface), request.params.workflowId, request.params.recordId,
    )),
  );

  app.get<{ Querystring: Static<typeof WorkflowDefinitionListQuerySchema> }>(
    "/workflows",
    { ...authenticated, schema: { querystring: WorkflowDefinitionListQuerySchema } },
    async request => apiSuccess(await service.list(getWorkflowScope(request, surface), {
      cursor: request.query.cursor,
      limit: request.query.limit ?? 20,
      query: request.query.query,
      status: request.query.status ?? "all",
    })),
  );

  app.post<{ Body: WorkflowCreateRequest }>(
    "/workflows",
    { ...authenticated, schema: { body: WorkflowCreateRequestSchema } },
    async (request) => apiSuccess(await service.create(getWorkflowScope(request, surface), request.body)),
  );

  app.get<{ Params: WorkflowParams }>(
    "/workflows/:workflowId",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.get(getWorkflowScope(request, surface), request.params.workflowId)),
  );

  app.get<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/direct-entry-endpoint",
    {
      ...authenticated,
      schema: { params: WorkflowParamsSchema },
    },
    async request => apiSuccess(await service.getDirectEntryEndpoint(
      getWorkflowScope(request, surface),
      request.params.workflowId,
    )),
  );

  app.post<{
    Body: WorkflowLlmTestAttemptCreateRequest;
    Params: Static<typeof WorkflowLlmTestNodeParamsSchema>;
  }>(
    "/workflows/:workflowId/nodes/:nodeId/llm-test-attempts",
    {
      ...authenticated,
      schema: {
        body: WorkflowLlmTestAttemptCreateRequestSchema,
        params: WorkflowLlmTestNodeParamsSchema,
      },
    },
    async request => apiSuccess(await service.createLlmTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.body,
    )),
  );

  app.post<{
    Body: WorkflowAiIntentTestAttemptCreateRequest;
    Params: Static<typeof WorkflowLlmTestNodeParamsSchema>;
  }>(
    "/workflows/:workflowId/nodes/:nodeId/ai-intent-test-attempts",
    {
      ...authenticated,
      schema: {
        body: WorkflowAiIntentTestAttemptCreateRequestSchema,
        params: WorkflowLlmTestNodeParamsSchema,
      },
    },
    async request => apiSuccess(await service.createAiIntentTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.body,
    )),
  );

  app.get<{ Params: Static<typeof WorkflowLlmTestAttemptParamsSchema> }>(
    "/workflows/:workflowId/nodes/:nodeId/llm-test-attempts/:attemptId",
    {
      ...authenticated,
      schema: { params: WorkflowLlmTestAttemptParamsSchema },
    },
    async request => apiSuccess(await service.getLlmTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.params.attemptId,
    )),
  );

  app.get<{ Params: Static<typeof WorkflowLlmTestAttemptParamsSchema> }>(
    "/workflows/:workflowId/nodes/:nodeId/ai-intent-test-attempts/:attemptId",
    {
      ...authenticated,
      schema: { params: WorkflowLlmTestAttemptParamsSchema },
    },
    async request => apiSuccess(await service.getLlmTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.params.attemptId,
    )),
  );

  app.post<{ Params: Static<typeof WorkflowLlmTestAttemptParamsSchema> }>(
    "/workflows/:workflowId/nodes/:nodeId/llm-test-attempts/:attemptId/cancel",
    {
      ...authenticated,
      schema: { params: WorkflowLlmTestAttemptParamsSchema },
    },
    async request => apiSuccess(await service.cancelLlmTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.params.attemptId,
    )),
  );

  app.post<{ Params: Static<typeof WorkflowLlmTestAttemptParamsSchema> }>(
    "/workflows/:workflowId/nodes/:nodeId/ai-intent-test-attempts/:attemptId/cancel",
    {
      ...authenticated,
      schema: { params: WorkflowLlmTestAttemptParamsSchema },
    },
    async request => apiSuccess(await service.cancelLlmTestAttempt(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.nodeId,
      request.params.attemptId,
    )),
  );

  app.put<{ Body: WorkflowSaveDraftRequest; Params: WorkflowParams }>(
    "/workflows/:workflowId/draft",
    {
      ...authenticated,
      schema: { body: WorkflowSaveDraftRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.saveDraft(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.body,
    )),
  );

  app.patch<{ Body: WorkflowMetadataUpdateRequest; Params: WorkflowParams }>(
    "/workflows/:workflowId/metadata",
    {
      ...authenticated,
      schema: { body: WorkflowMetadataUpdateRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.updateMetadata(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.body,
    )),
  );

  app.delete<{ Params: WorkflowParams }>(
    "/workflows/:workflowId",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => {
      await service.delete(getWorkflowScope(request, surface), request.params.workflowId);
      return apiSuccess({ deleted: true });
    },
  );

  app.post<{ Body: WorkflowPublishRequest; Params: WorkflowParams }>(
    "/workflows/:workflowId/publish",
    {
      ...authenticated,
      schema: { body: WorkflowPublishRequestSchema, params: WorkflowParamsSchema },
    },
    async (request) => apiSuccess(await service.publish(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.body,
    )),
  );

  app.get<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/review",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async request => apiSuccess(await service.getCurrentReview(
      getWorkflowScope(request, surface), request.params.workflowId,
    )),
  );

  app.get<{ Params: WorkflowParams; Querystring: Static<typeof WorkflowHistoryQuerySchema> }>(
    "/workflows/:workflowId/reviews",
    { ...authenticated, schema: { params: WorkflowParamsSchema, querystring: WorkflowHistoryQuerySchema } },
    async request => apiSuccess(await service.listReviews(
      getWorkflowScope(request, surface), request.params.workflowId, {
        cursor: request.query.cursor,
        limit: request.query.limit ?? 20,
      },
    )),
  );

  app.post<{ Body: WorkflowReviewSubmitRequest; Params: WorkflowParams }>(
    "/workflows/:workflowId/reviews",
    { ...authenticated, schema: { body: WorkflowReviewSubmitRequestSchema, params: WorkflowParamsSchema } },
    async request => apiSuccess(await service.submitReview(
      getWorkflowScope(request, surface), request.params.workflowId, request.body,
    )),
  );

  app.post<{ Body: WorkflowReviewApproveRequest; Params: WorkflowReviewParams }>(
    "/workflows/:workflowId/reviews/:reviewId/approve",
    { ...authenticated, schema: { body: WorkflowReviewApproveRequestSchema, params: WorkflowReviewParamsSchema } },
    async request => apiSuccess(await service.approveReview(
      getWorkflowScope(request, surface), request.params.workflowId, request.params.reviewId, request.body,
    )),
  );

  app.post<{ Body: WorkflowReviewRejectRequest; Params: WorkflowReviewParams }>(
    "/workflows/:workflowId/reviews/:reviewId/reject",
    { ...authenticated, schema: { body: WorkflowReviewRejectRequestSchema, params: WorkflowReviewParamsSchema } },
    async request => apiSuccess(await service.rejectReview(
      getWorkflowScope(request, surface), request.params.workflowId, request.params.reviewId, request.body,
    )),
  );

  app.post<{ Params: WorkflowReviewParams }>(
    "/workflows/:workflowId/reviews/:reviewId/withdraw",
    { ...authenticated, schema: { params: WorkflowReviewParamsSchema } },
    async request => apiSuccess(await service.withdrawReview(
      getWorkflowScope(request, surface), request.params.workflowId, request.params.reviewId,
    )),
  );

  app.post<{ Body: WorkflowRestoreRequest; Params: WorkflowReviewParams }>(
    "/workflows/:workflowId/reviews/:reviewId/restore",
    { ...authenticated, schema: { body: WorkflowRestoreRequestSchema, params: WorkflowReviewParamsSchema } },
    async request => apiSuccess(await service.restoreReview(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.reviewId,
      request.body,
    )),
  );

  app.post<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/enable",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.enable(getWorkflowScope(request, surface), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/pause",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.pause(getWorkflowScope(request, surface), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/resume",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.resume(getWorkflowScope(request, surface), request.params.workflowId)),
  );

  app.post<{ Params: WorkflowParams }>(
    "/workflows/:workflowId/stop",
    { ...authenticated, schema: { params: WorkflowParamsSchema } },
    async (request) => apiSuccess(await service.stop(getWorkflowScope(request, surface), request.params.workflowId)),
  );

  app.get<{ Params: WorkflowParams; Querystring: Static<typeof WorkflowHistoryQuerySchema> }>(
    "/workflows/:workflowId/revisions",
    { ...authenticated, schema: { params: WorkflowParamsSchema, querystring: WorkflowHistoryQuerySchema } },
    async (request) => apiSuccess(await service.listRevisions(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      {
        cursor: request.query.cursor,
        limit: request.query.limit ?? 20,
      },
    )),
  );

  app.get<{ Params: WorkflowRevisionParams }>(
    "/workflows/:workflowId/revisions/:revision",
    { ...authenticated, schema: { params: WorkflowRevisionParamsSchema } },
    async request => apiSuccess(await service.getRevision(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.revision,
    )),
  );

  app.post<{
    Body: WorkflowRestoreRequest;
    Params: WorkflowRevisionParams;
  }>(
    "/workflows/:workflowId/revisions/:revision/restore",
    {
      ...authenticated,
      schema: { body: WorkflowRestoreRequestSchema, params: WorkflowRevisionParamsSchema },
    },
    async (request) => apiSuccess(await service.restoreRevision(
      getWorkflowScope(request, surface),
      request.params.workflowId,
      request.params.revision,
      request.body,
    )),
  );
}

function getWorkflowScope(request: FastifyRequest, surface: WorkflowSurface) {
  return {
    roles: request.user.roles,
    subUserId: request.user.subUserId,
    surface,
    uid: request.user.uid,
  };
}

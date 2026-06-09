import {
  apiSuccess,
  InsightAnalysisPolicyUpdateRequestSchema,
  InsightConfigStatusUpdateRequestSchema,
  InsightEntityDictionaryMutationRequestSchema,
  InsightFeatureConfigUpdateRequestSchema,
  InsightIntentConfigMutationRequestSchema,
  InsightLabelConfigMutationRequestSchema,
  InsightActionStatusSchema,
  InsightCreateActionItemRequestSchema,
  InsightMessageContextRequestSchema,
  InsightQaRuleConfigMutationRequestSchema,
  InsightSessionizationSettingsUpdateRequestSchema,
  InsightsRescanRequestSchema,
  type AccountRole,
  type InsightAnalysisPolicyUpdateRequest,
  type InsightConfigStatusUpdateRequest,
  type InsightEntityDictionaryMutationRequest,
  type InsightFeatureConfigUpdateRequest,
  type InsightIntentConfigMutationRequest,
  type InsightLabelConfigMutationRequest,
  type InsightActionStatus,
  type InsightCreateActionItemRequest,
  type InsightQaRuleConfigMutationRequest,
  type InsightSessionizationSettingsUpdateRequest,
  type InsightsRescanRequest,
} from "@chatai/contracts";
import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { InsightsRepository } from "./insights.repository.js";
import {
  InsightsService,
  type InsightsBusinessRelatedSessionFilters,
  type InsightsOverviewFilters,
  type InsightsUidScope,
} from "./insights.service.js";
import { UnauthorizedError } from "../../shared/errors.js";

const DateQuerySchema = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?(?:Z|[+-]\\d{2}:\\d{2})?)?$",
});

const FollowUpsQuerySchema = Type.Object({
  from: Type.Optional(DateQuerySchema),
  page: Type.Optional(Type.Number()),
  pageSize: Type.Optional(Type.Number()),
  priority: Type.Optional(Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ])),
  status: Type.Optional(Type.Union([
    InsightActionStatusSchema,
    Type.Literal("processed"),
  ])),
  to: Type.Optional(DateQuerySchema),
});

const OverviewQuerySchema = Type.Object({
  from: Type.Optional(DateQuerySchema),
  to: Type.Optional(DateQuerySchema),
});

const QualityQuerySchema = Type.Object({
  from: Type.Optional(DateQuerySchema),
  page: Type.Optional(Type.Number()),
  pageSize: Type.Optional(Type.Number()),
  passed: Type.Optional(Type.Boolean()),
  to: Type.Optional(DateQuerySchema),
  view: Type.Optional(Type.Union([
    Type.Literal("agent-report"),
    Type.Literal("all"),
    Type.Literal("quality-results"),
  ])),
});

const OverviewSessionsQuerySchema = Type.Object({
  analysisStatus: Type.Optional(Type.Union([
    Type.Literal("ready"),
    Type.Literal("analyzing"),
    Type.Literal("partial"),
    Type.Literal("failed"),
    Type.Literal("stale"),
  ])),
  entityId: Type.Optional(Type.String()),
  from: Type.Optional(DateQuerySchema),
  intentId: Type.Optional(Type.String()),
  keyword: Type.Optional(Type.String()),
  page: Type.Optional(Type.Number()),
  pageSize: Type.Optional(Type.Number()),
  problemScope: Type.Optional(Type.Union([
    Type.Literal("all"),
    Type.Literal("problem"),
    Type.Literal("unresolved"),
  ])),
  resolutionStatus: Type.Optional(Type.Union([
    Type.Literal("resolved"),
    Type.Literal("unresolved"),
    Type.Literal("partially_resolved"),
    Type.Literal("no_customer_problem"),
    Type.Literal("unknown"),
  ])),
  tagId: Type.Optional(Type.String()),
  to: Type.Optional(DateQuerySchema),
});

const BusinessRelatedSessionsQuerySchema = Type.Intersect([
  Type.Pick(OverviewSessionsQuerySchema, ["from", "keyword", "page", "pageSize", "to"]),
  Type.Object({
    dimension: Type.Union([
      Type.Literal("asset"),
      Type.Literal("entity"),
      Type.Literal("intent"),
      Type.Literal("tag"),
    ]),
    topicCode: Type.String({ minLength: 1 }),
    topicType: Type.Optional(Type.String()),
  }),
]);

const RescanTasksQuerySchema = Type.Object({
  page: Type.Optional(Type.Number()),
  pageSize: Type.Optional(Type.Number()),
});

const SessionParamsSchema = Type.Object({
  sessionId: Type.String({ minLength: 1 }),
});

const ActionItemParamsSchema = Type.Object({
  actionItemId: Type.String({ minLength: 1 }),
});

const ActionStatusBodySchema = Type.Object({
  status: InsightActionStatusSchema,
});

const ConfigParamsSchema = Type.Object({
  configId: Type.String({ minLength: 1 }),
});

type FollowUpsQuery = Static<typeof FollowUpsQuerySchema>;
type OverviewQuery = Static<typeof OverviewQuerySchema>;
type OverviewSessionsQuery = Static<typeof OverviewSessionsQuerySchema>;
type BusinessRelatedSessionsQuery = Static<typeof BusinessRelatedSessionsQuerySchema>;
type QualityQuery = Static<typeof QualityQuerySchema>;
type SessionParams = Static<typeof SessionParamsSchema>;
type ActionItemParams = Static<typeof ActionItemParamsSchema>;
type ActionStatusBody = Static<typeof ActionStatusBodySchema>;
type CreateActionItemBody = InsightCreateActionItemRequest;
type ConfigParams = Static<typeof ConfigParamsSchema>;
type MessageContextQuery = Static<typeof InsightMessageContextRequestSchema>;

export async function registerInsightsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: OverviewQuery }>(
    "/api/server/insights/overview",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: OverviewQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getOverview(
          await getUidScope(app, request),
          normalizeOverviewQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: OverviewSessionsQuery }>(
    "/api/server/insights/overview/sessions",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: OverviewSessionsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getOverviewSessions(
          await getUidScope(app, request),
          normalizeOverviewSessionsQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: OverviewSessionsQuery }>(
    "/api/server/insights/business",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: OverviewSessionsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getBusiness(
          await getUidScope(app, request),
          normalizeOverviewSessionsQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: BusinessRelatedSessionsQuery }>(
    "/api/server/insights/business/related-sessions",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: BusinessRelatedSessionsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getBusinessRelatedSessions(
          await getUidScope(app, request),
          normalizeBusinessRelatedSessionsQuery(request.query),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/filter-options",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getFilterOptions(
          await getUidScope(app, request),
        ),
      );
    },
  );

  app.get<{ Querystring: QualityQuery }>(
    "/api/server/insights/quality",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: QualityQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQuality(
          await getUidScope(app, request),
          normalizeQualityQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: FollowUpsQuery }>(
    "/api/server/insights/follow-ups",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: FollowUpsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getFollowUps(
          await getUidScope(app, request),
          normalizeFollowUpsQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Params: SessionParams }>(
    "/api/server/insights/sessions/:sessionId",
    {
      preHandler: app.authenticate,
      schema: {
        params: SessionParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getDetail(
          await getUidScope(app, request),
          request.params.sessionId,
        ),
      );
    },
  );

  app.get<{ Params: SessionParams }>(
    "/api/server/insights/sessions/:sessionId/messages",
    {
      preHandler: app.authenticate,
      schema: {
        params: SessionParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getSessionMessages(
          await getUidScope(app, request),
          request.params.sessionId,
        ),
      );
    },
  );

  app.get<{ Querystring: MessageContextQuery }>(
    "/api/server/insights/messages/context",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: InsightMessageContextRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getMessageContext(
          await getUidScope(app, request),
          request.query.conversationId,
          request.query.messageId,
        ),
      );
    },
  );

  app.patch<{ Body: ActionStatusBody; Params: ActionItemParams }>(
    "/api/server/insights/action-items/:actionItemId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: ActionStatusBodySchema,
        params: ActionItemParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateActionStatus(
          await getUidScope(app, request),
          request.params.actionItemId,
          request.body.status,
        ),
      );
    },
  );

  app.post<{ Body: CreateActionItemBody }>(
    "/api/server/insights/action-items",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightCreateActionItemRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createActionItem(
          await getUidScope(app, request),
          request.body,
          request.user?.subUserId,
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getSettings(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/summary",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getSettingsSummary(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/policy",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getPolicySettings(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/intent-configs",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).listIntentConfigs(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/label-configs",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).listLabelConfigs(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/qa-rule-configs",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).listQaRuleConfigs(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/entity-dictionary",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).listEntityDictionary(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.put<{ Body: InsightSessionizationSettingsUpdateRequest }>(
    "/api/server/insights/settings/sessionization",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightSessionizationSettingsUpdateRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateSessionizationSettings(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: InsightAnalysisPolicyUpdateRequest }>(
    "/api/server/insights/settings/analysis-policy",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightAnalysisPolicyUpdateRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateAnalysisPolicy(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/settings/feature-config",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getFeatureConfig(
          await getUidScope(app, request),
          getAccountRole(request),
        ),
      );
    },
  );

  app.put<{ Body: InsightFeatureConfigUpdateRequest }>(
    "/api/server/insights/settings/feature-config",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightFeatureConfigUpdateRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateFeatureConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.post<{ Body: InsightIntentConfigMutationRequest }>(
    "/api/server/insights/settings/intent-configs",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightIntentConfigMutationRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createIntentConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: InsightIntentConfigMutationRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/intent-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightIntentConfigMutationRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateIntentConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.patch<{ Body: InsightConfigStatusUpdateRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/intent-configs/:configId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightConfigStatusUpdateRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateIntentConfigStatus(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.delete<{ Params: ConfigParams }>(
    "/api/server/insights/settings/intent-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).deleteIntentConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
        ),
      );
    },
  );

  app.post<{ Body: InsightLabelConfigMutationRequest }>(
    "/api/server/insights/settings/label-configs",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightLabelConfigMutationRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createLabelConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: InsightLabelConfigMutationRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/label-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightLabelConfigMutationRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateLabelConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.patch<{ Body: InsightConfigStatusUpdateRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/label-configs/:configId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightConfigStatusUpdateRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateLabelConfigStatus(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.delete<{ Params: ConfigParams }>(
    "/api/server/insights/settings/label-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).deleteLabelConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
        ),
      );
    },
  );

  app.post<{ Body: InsightQaRuleConfigMutationRequest }>(
    "/api/server/insights/settings/qa-rule-configs",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightQaRuleConfigMutationRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createQaRuleConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: InsightQaRuleConfigMutationRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/qa-rule-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightQaRuleConfigMutationRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateQaRuleConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.patch<{ Body: InsightConfigStatusUpdateRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/qa-rule-configs/:configId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightConfigStatusUpdateRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateQaRuleConfigStatus(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.delete<{ Params: ConfigParams }>(
    "/api/server/insights/settings/qa-rule-configs/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).deleteQaRuleConfig(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
        ),
      );
    },
  );

  app.post<{ Body: InsightEntityDictionaryMutationRequest }>(
    "/api/server/insights/settings/entity-dictionary",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightEntityDictionaryMutationRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createEntityDictionaryItem(
          await getUidScope(app, request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.put<{ Body: InsightEntityDictionaryMutationRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/entity-dictionary/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightEntityDictionaryMutationRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateEntityDictionaryItem(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.patch<{ Body: InsightConfigStatusUpdateRequest; Params: ConfigParams }>(
    "/api/server/insights/settings/entity-dictionary/:configId/status",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightConfigStatusUpdateRequestSchema,
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).updateEntityDictionaryItemStatus(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
          request.body,
        ),
      );
    },
  );

  app.delete<{ Params: ConfigParams }>(
    "/api/server/insights/settings/entity-dictionary/:configId",
    {
      preHandler: app.authenticate,
      schema: {
        params: ConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).deleteEntityDictionaryItem(
          await getUidScope(app, request),
          getAccountRole(request),
          request.params.configId,
        ),
      );
    },
  );

  app.post<{ Body: InsightsRescanRequest }>(
    "/api/server/insights/jobs/rescan",
    {
      preHandler: app.authenticate,
      schema: {
        body: InsightsRescanRequestSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).createRescanJob(
          await getUidScope(app, request),
          request.body,
          request.user?.subUserId,
        ),
      );
    },
  );

  app.get(
    "/api/server/insights/jobs/rescan",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: RescanTasksQuerySchema,
      },
    },
    async (request) => {
      const query = request.query as Static<typeof RescanTasksQuerySchema>;
      const page = normalizePositiveQueryNumber(query.page) ?? 1;
      const pageSize = Math.min(50, normalizePositiveQueryNumber(query.pageSize) ?? 10);

      return apiSuccess(
        await createInsightsService(app).listRescanTasks(
          await getUidScope(app, request),
          { page, pageSize },
        ),
      );
    },
  );
}

function normalizeOverviewQuery(query: OverviewQuery): InsightsOverviewFilters {
  return {
    from: query.from,
    to: query.to,
  };
}

function normalizeOverviewSessionsQuery(query: OverviewSessionsQuery): InsightsOverviewFilters {
  return {
    analysisStatus: query.analysisStatus,
    entityId: query.entityId,
    from: query.from,
    intentId: query.intentId,
    keyword: query.keyword,
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    problemScope: query.problemScope,
    resolutionStatus: query.resolutionStatus,
    tagId: query.tagId,
    to: query.to,
  };
}

function normalizeQualityQuery(query: QualityQuery) {
  return {
    from: query.from,
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    passed: query.passed,
    to: query.to,
    view: query.view,
  };
}

function normalizeFollowUpsQuery(query: FollowUpsQuery) {
  return {
    from: query.from,
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    priority: query.priority,
    status: query.status,
    to: query.to,
  };
}

function normalizeBusinessRelatedSessionsQuery(
  query: BusinessRelatedSessionsQuery,
): InsightsBusinessRelatedSessionFilters {
  return {
    dimension: query.dimension,
    from: query.from,
    keyword: query.keyword,
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    topicCode: query.topicCode,
    topicType: query.topicType,
    to: query.to,
  };
}

function normalizePositiveQueryNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);

  return normalized > 0 ? normalized : undefined;
}

function createInsightsService(app: FastifyInstance) {
  return new InsightsService(new InsightsRepository(app.db));
}

function getAccountRole(request: FastifyRequest): AccountRole | undefined {
  const roles = request.user?.roles ?? [];

  if (roles.includes("owner")) {
    return "owner";
  }

  if (roles.includes("admin")) {
    return "admin";
  }

  if (roles.includes("operator")) {
    return "operator";
  }

  if (roles.includes("viewer")) {
    return "viewer";
  }

  return undefined;
}

async function getUidScope(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<InsightsUidScope> {
  const subUserId = request.user?.subUserId;

  if (!subUserId) {
    throw new UnauthorizedError();
  }

  const row = await app.db
    .selectFrom("xy_wap_embed_sub_user")
    .select(["uid"])
    .where("id", "=", subUserId as never)
    .where("status", "=", 1)
    .executeTakeFirst();

  if (!row) {
    throw new UnauthorizedError();
  }

  return {
    uid: Number(row.uid),
  };
}

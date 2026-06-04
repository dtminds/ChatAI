import {
  apiSuccess,
  InsightAnalysisPolicyUpdateRequestSchema,
  InsightConfigStatusUpdateRequestSchema,
  InsightEntityDictionaryMutationRequestSchema,
  InsightLabelConfigMutationRequestSchema,
  InsightActionStatusSchema,
  InsightMessageContextRequestSchema,
  InsightQaRuleConfigMutationRequestSchema,
  InsightSessionizationSettingsUpdateRequestSchema,
  InsightsRescanRequestSchema,
  type AccountRole,
  type InsightAnalysisPolicyUpdateRequest,
  type InsightConfigStatusUpdateRequest,
  type InsightEntityDictionaryMutationRequest,
  type InsightLabelConfigMutationRequest,
  type InsightActionStatus,
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

const FollowUpsQuerySchema = Type.Object({
  priority: Type.Optional(Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ])),
  status: Type.Optional(InsightActionStatusSchema),
  type: Type.Optional(Type.String()),
});

const OverviewQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
});

const OverviewSessionsQuerySchema = Type.Object({
  analysisStatus: Type.Optional(Type.Union([
    Type.Literal("ready"),
    Type.Literal("partial"),
    Type.Literal("failed"),
    Type.Literal("stale"),
  ])),
  entityName: Type.Optional(Type.String()),
  from: Type.Optional(Type.String()),
  intentCode: Type.Optional(Type.String()),
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
  tagCode: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
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
type SessionParams = Static<typeof SessionParamsSchema>;
type ActionItemParams = Static<typeof ActionItemParamsSchema>;
type ActionStatusBody = Static<typeof ActionStatusBodySchema>;
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
    "/api/server/insights/quality",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQuality(await getUidScope(app, request)),
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
          request.query,
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

  app.get(
    "/api/server/insights/settings",
    {
      preHandler: app.authenticate,
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getSettings(
          await getUidScope(app, request),
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
          request.body,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
          request.user?.roles?.[0] as AccountRole | undefined,
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
    entityName: query.entityName,
    from: query.from,
    intentCode: query.intentCode,
    keyword: query.keyword,
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    problemScope: query.problemScope,
    resolutionStatus: query.resolutionStatus,
    tagCode: query.tagCode,
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
    .where("id", "=", Number(subUserId))
    .where("status", "=", 1)
    .executeTakeFirst();

  if (!row) {
    throw new UnauthorizedError();
  }

  return {
    uid: Number(row.uid),
  };
}

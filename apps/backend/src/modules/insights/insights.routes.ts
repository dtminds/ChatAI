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
});

const QualitySummaryQuerySchema = Type.Object({
  from: Type.Optional(DateQuerySchema),
  to: Type.Optional(DateQuerySchema),
});

const OverviewSessionsQuerySchema = Type.Object({
  analysisStatus: Type.Optional(Type.Union([
    Type.Literal("ready"),
    Type.Literal("analyzing"),
    Type.Literal("partial"),
    Type.Literal("failed"),
    Type.Literal("stale"),
    Type.Literal("skipped"),
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
  Type.Pick(OverviewSessionsQuerySchema, ["from", "page", "pageSize", "to"]),
  Type.Object({
    dimension: Type.Union([
      Type.Literal("asset"),
      Type.Literal("entity"),
      Type.Literal("intent"),
      Type.Literal("tag"),
    ]),
    topicCode: Type.String({ minLength: 1 }),
  }),
]);

const BusinessTopicsQuerySchema = Type.Intersect([
  Type.Pick(OverviewSessionsQuerySchema, ["from", "to"]),
  Type.Object({
    dimension: Type.Union([
      Type.Literal("asset"),
      Type.Literal("entity"),
      Type.Literal("intent"),
      Type.Literal("tag"),
    ]),
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

const PresetConfigParamsSchema = Type.Object({
  presetCode: Type.String({ minLength: 1 }),
});

type FollowUpsQuery = Static<typeof FollowUpsQuerySchema>;
type OverviewQuery = Static<typeof OverviewQuerySchema>;
type OverviewSessionsQuery = Static<typeof OverviewSessionsQuerySchema>;
type BusinessRelatedSessionsQuery = Static<typeof BusinessRelatedSessionsQuerySchema>;
type BusinessTopicsQuery = Static<typeof BusinessTopicsQuerySchema>;
type QualityQuery = Static<typeof QualityQuerySchema>;
type QualitySummaryQuery = Static<typeof QualitySummaryQuerySchema>;
type SessionParams = Static<typeof SessionParamsSchema>;
type ActionItemParams = Static<typeof ActionItemParamsSchema>;
type ActionStatusBody = Static<typeof ActionStatusBodySchema>;
type CreateActionItemBody = InsightCreateActionItemRequest;
type ConfigParams = Static<typeof ConfigParamsSchema>;
type PresetConfigParams = Static<typeof PresetConfigParamsSchema>;
type MessageContextQuery = Static<typeof InsightMessageContextRequestSchema>;

export async function registerInsightsRoutes(app: FastifyInstance) {
  app.get(
    "/api/server/insights/capabilities",
    { preHandler: app.authenticate },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getCapabilities(
          getUidScope(request),
          getAccountRole(request),
        ),
      );
    },
  );

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
          getUidScope(request),
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
          getUidScope(request),
          normalizeOverviewSessionsQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: BusinessTopicsQuery }>(
    "/api/server/insights/business/topics",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: BusinessTopicsQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getBusinessTopics(
          getUidScope(request),
          normalizeBusinessTopicsQuery(request.query),
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
          getUidScope(request),
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
          getUidScope(request),
        ),
      );
    },
  );

  app.get<{ Querystring: QualitySummaryQuery }>(
    "/api/server/insights/quality/overview",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: QualitySummaryQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQualityOverview(
          getUidScope(request),
          normalizeQualitySummaryQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: QualitySummaryQuery }>(
    "/api/server/insights/quality/agent-stats",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: QualitySummaryQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQualityAgentStats(
          getUidScope(request),
          normalizeQualitySummaryQuery(request.query),
        ),
      );
    },
  );

  app.get<{ Querystring: QualityQuery }>(
    "/api/server/insights/quality/results",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: QualityQuerySchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).getQualityResults(
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: PresetConfigParams }>(
    "/api/server/insights/settings/intent-configs/presets/:presetCode",
    {
      preHandler: app.authenticate,
      schema: {
        params: PresetConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).activatePresetIntentConfig(
          getUidScope(request),
          getAccountRole(request),
          request.params.presetCode,
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: PresetConfigParams }>(
    "/api/server/insights/settings/label-configs/presets/:presetCode",
    {
      preHandler: app.authenticate,
      schema: {
        params: PresetConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).activatePresetLabelConfig(
          getUidScope(request),
          getAccountRole(request),
          request.params.presetCode,
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: PresetConfigParams }>(
    "/api/server/insights/settings/qa-rule-configs/presets/:presetCode",
    {
      preHandler: app.authenticate,
      schema: {
        params: PresetConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).activatePresetQaRuleConfig(
          getUidScope(request),
          getAccountRole(request),
          request.params.presetCode,
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
          getAccountRole(request),
          request.body,
        ),
      );
    },
  );

  app.post<{ Params: PresetConfigParams }>(
    "/api/server/insights/settings/entity-dictionary/presets/:presetCode",
    {
      preHandler: app.authenticate,
      schema: {
        params: PresetConfigParamsSchema,
      },
    },
    async (request) => {
      return apiSuccess(
        await createInsightsService(app).activatePresetEntityDictionaryItem(
          getUidScope(request),
          getAccountRole(request),
          request.params.presetCode,
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
          getUidScope(request),
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
  };
}

function normalizeQualitySummaryQuery(query: QualitySummaryQuery) {
  return {
    from: query.from,
    to: query.to,
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
    page: normalizePositiveQueryNumber(query.page),
    pageSize: normalizePositiveQueryNumber(query.pageSize),
    topicCode: query.topicCode,
    to: query.to,
  };
}

function normalizeBusinessTopicsQuery(
  query: BusinessTopicsQuery,
) {
  return {
    dimension: query.dimension,
    from: query.from,
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

function getUidScope(request: FastifyRequest): InsightsUidScope {
  const uid = request.user?.uid;

  if (!Number.isSafeInteger(uid) || uid <= 0) {
    throw new UnauthorizedError();
  }

  return {
    uid,
  };
}

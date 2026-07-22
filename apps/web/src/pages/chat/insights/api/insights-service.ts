import type {
  ApiSuccessEnvelope,
  InsightActionStatus,
  InsightCapabilitiesResponse,
  InsightOverviewQuery as ContractInsightOverviewQuery,
  InsightOverviewSessionsQuery as ContractInsightOverviewSessionsQuery,
  InsightOverviewSessionsResponse,
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightConfigDeletedResponse,
  InsightConfigStatusUpdateRequest,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightFeatureConfig,
  InsightFeatureConfigUpdateRequest,
  InsightFilterOptionsResponse,
  InsightIntentConfig,
  InsightIntentConfigMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextRequest,
  InsightMessageContextResponse,
  InsightSessionMessagesResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightRescanTaskListResponse,
  InsightSettingsResponse,
  InsightSettingsSummaryResponse,
  InsightSessionizationSettings,
  InsightSessionizationSettingsUpdateRequest,
  InsightBusinessRelatedSessionsResponse,
  InsightBusinessTopicsResponse,
  InsightsFollowUpsResponse,
  InsightsOverviewResponse,
  InsightsQualityAgentStatsResponse,
  InsightsQualityOverviewResponse,
  InsightsQualityResultsResponse,
  InsightsRescanRequest,
  InsightsRescanResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type InsightFollowUpQuery = {
  from?: string;
  page?: number;
  pageSize?: number;
  priority?: "low" | "medium" | "high";
  status?: InsightActionStatus | "processed";
  to?: string;
};

export type InsightQualityQuery = {
  from?: string;
  page?: number;
  pageSize?: number;
  passed?: boolean;
  to?: string;
};

export type InsightQualitySummaryQuery = Pick<InsightQualityQuery, "from" | "to">;

export type InsightOverviewQuery = {
  from?: ContractInsightOverviewQuery["from"];
  to?: ContractInsightOverviewQuery["to"];
};

export type InsightOverviewSessionsQuery = {
  analysisStatus?: ContractInsightOverviewSessionsQuery["analysisStatus"];
  entityId?: string;
  from?: string;
  intentId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: ContractInsightOverviewSessionsQuery["problemScope"];
  resolutionStatus?: ContractInsightOverviewSessionsQuery["resolutionStatus"];
  tagId?: string;
  to?: string;
};

export type InsightBusinessRelatedSessionsQuery = Pick<
  InsightOverviewSessionsQuery,
  "from" | "page" | "pageSize" | "to"
> & {
  dimension: InsightBusinessTopicsResponse["dimension"];
  topicCode: string;
};

export type InsightBusinessTopicsQuery = Pick<
  InsightOverviewSessionsQuery,
  "from" | "to"
> & {
  dimension: InsightBusinessTopicsResponse["dimension"];
};

type InsightRequestOptions = {
  signal?: AbortSignal;
};

export async function getInsightOverview(query: InsightOverviewQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<InsightsOverviewResponse>>(
    "/server/insights/overview",
    {
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightCapabilities() {
  const response = await http.get<ApiSuccessEnvelope<InsightCapabilitiesResponse>>(
    "/server/insights/capabilities",
  );

  return response.data;
}

export async function getInsightOverviewSessions(query: InsightOverviewSessionsQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<InsightOverviewSessionsResponse>>(
    "/server/insights/overview/sessions",
    {
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightFilterOptions() {
  const response = await http.get<ApiSuccessEnvelope<InsightFilterOptionsResponse>>(
    "/server/insights/filter-options",
  );

  return response.data;
}

export async function getInsightBusinessTopics(
  query: InsightBusinessTopicsQuery,
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightBusinessTopicsResponse>>(
    "/server/insights/business/topics",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightBusinessRelatedSessions(
  query: InsightBusinessRelatedSessionsQuery,
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightBusinessRelatedSessionsResponse>>(
    "/server/insights/business/related-sessions",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightQualityOverview(
  query: InsightQualitySummaryQuery = {},
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightsQualityOverviewResponse>>(
    "/server/insights/quality/overview",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightQualityAgentStats(
  query: InsightQualitySummaryQuery = {},
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightsQualityAgentStatsResponse>>(
    "/server/insights/quality/agent-stats",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightQualityResults(
  query: InsightQualityQuery = {},
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightsQualityResultsResponse>>(
    "/server/insights/quality/results",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightFollowUps(
  query: InsightFollowUpQuery = {},
  options: InsightRequestOptions = {},
) {
  const response = await http.get<ApiSuccessEnvelope<InsightsFollowUpsResponse>>(
    "/server/insights/follow-ups",
    {
      ...options,
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightDetail(sessionId: string) {
  const response = await http.get<ApiSuccessEnvelope<InsightDetailResponse>>(
    `/server/insights/sessions/${sessionId}`,
  );

  return response.data;
}

export async function getInsightSessionMessages(sessionId: string) {
  const response = await http.get<ApiSuccessEnvelope<InsightSessionMessagesResponse>>(
    `/server/insights/sessions/${sessionId}/messages`,
  );

  return response.data;
}

export async function getInsightMessageContext(
  query: InsightMessageContextRequest,
) {
  const response = await http.get<ApiSuccessEnvelope<InsightMessageContextResponse>>(
    "/server/insights/messages/context",
    {
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function updateInsightActionStatus(
  actionItemId: string,
  status: Extract<InsightActionStatus, "done" | "dismissed" | "open">,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<{ actionItemId: string; status: InsightActionStatus }>,
    { status: InsightActionStatus }
  >(`/server/insights/action-items/${actionItemId}/status`, { status });

  return response.data;
}

export async function getInsightSettings() {
  const response = await http.get<ApiSuccessEnvelope<InsightSettingsResponse>>(
    "/server/insights/settings",
  );

  return response.data;
}

export async function getInsightSettingsSummary() {
  const response = await http.get<ApiSuccessEnvelope<InsightSettingsSummaryResponse>>(
    "/server/insights/settings/summary",
  );

  return response.data;
}

export async function getInsightPolicyAndSessionization() {
  const response = await http.get<
    ApiSuccessEnvelope<{
      analysisPolicy: InsightAnalysisPolicy;
      sessionization: InsightSessionizationSettings;
    }>
  >("/server/insights/settings/policy");

  return response.data;
}

export async function listInsightIntentConfigs() {
  const response = await http.get<ApiSuccessEnvelope<InsightIntentConfig[]>>(
    "/server/insights/settings/intent-configs",
  );

  return response.data;
}

export async function listInsightLabelConfigs() {
  const response = await http.get<ApiSuccessEnvelope<InsightLabelConfig[]>>(
    "/server/insights/settings/label-configs",
  );

  return response.data;
}

export async function listInsightQaRuleConfigs() {
  const response = await http.get<ApiSuccessEnvelope<InsightQaRuleConfig[]>>(
    "/server/insights/settings/qa-rule-configs",
  );

  return response.data;
}

export async function listInsightEntityDictionary() {
  const response = await http.get<ApiSuccessEnvelope<InsightEntityDictionaryItem[]>>(
    "/server/insights/settings/entity-dictionary",
  );

  return response.data;
}

export async function updateInsightSessionizationSettings(
  payload: InsightSessionizationSettingsUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightSessionizationSettings>,
    InsightSessionizationSettingsUpdateRequest
  >("/server/insights/settings/sessionization", payload);

  return response.data;
}

export async function updateInsightAnalysisPolicy(
  payload: InsightAnalysisPolicyUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightAnalysisPolicy>,
    InsightAnalysisPolicyUpdateRequest
  >("/server/insights/settings/analysis-policy", payload);

  return response.data;
}

export async function getInsightFeatureConfig() {
  const response = await http.get<ApiSuccessEnvelope<InsightFeatureConfig>>(
    "/server/insights/settings/feature-config",
  );

  return response.data;
}

export async function updateInsightFeatureConfig(
  payload: InsightFeatureConfigUpdateRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightFeatureConfig>,
    InsightFeatureConfigUpdateRequest
  >("/server/insights/settings/feature-config", payload);

  return response.data;
}

export async function createInsightIntentConfig(payload: InsightIntentConfigMutationRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightIntentConfig>,
    InsightIntentConfigMutationRequest
  >("/server/insights/settings/intent-configs", payload);

  return response.data;
}

export async function activatePresetInsightIntentConfig(presetCode: string) {
  const response = await http.post<ApiSuccessEnvelope<InsightIntentConfig>>(
    `/server/insights/settings/intent-configs/presets/${presetCode}`,
  );

  return response.data;
}

export async function updateInsightIntentConfig(
  configId: string,
  payload: InsightIntentConfigMutationRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightIntentConfig>,
    InsightIntentConfigMutationRequest
  >(`/server/insights/settings/intent-configs/${configId}`, payload);

  return response.data;
}

export async function updateInsightIntentConfigStatus(
  configId: string,
  payload: InsightConfigStatusUpdateRequest,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<InsightIntentConfig>,
    InsightConfigStatusUpdateRequest
  >(`/server/insights/settings/intent-configs/${configId}/status`, payload);

  return response.data;
}

export async function deleteInsightIntentConfig(configId: string) {
  const response = await http.delete<ApiSuccessEnvelope<InsightConfigDeletedResponse>>(
    `/server/insights/settings/intent-configs/${configId}`,
  );

  return response.data;
}

export async function createInsightLabelConfig(payload: InsightLabelConfigMutationRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightLabelConfig>,
    InsightLabelConfigMutationRequest
  >("/server/insights/settings/label-configs", payload);

  return response.data;
}

export async function activatePresetInsightLabelConfig(presetCode: string) {
  const response = await http.post<ApiSuccessEnvelope<InsightLabelConfig>>(
    `/server/insights/settings/label-configs/presets/${presetCode}`,
  );

  return response.data;
}

export async function updateInsightLabelConfig(
  configId: string,
  payload: InsightLabelConfigMutationRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightLabelConfig>,
    InsightLabelConfigMutationRequest
  >(`/server/insights/settings/label-configs/${configId}`, payload);

  return response.data;
}

export async function updateInsightLabelConfigStatus(
  configId: string,
  payload: InsightConfigStatusUpdateRequest,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<InsightLabelConfig>,
    InsightConfigStatusUpdateRequest
  >(`/server/insights/settings/label-configs/${configId}/status`, payload);

  return response.data;
}

export async function deleteInsightLabelConfig(configId: string) {
  const response = await http.delete<ApiSuccessEnvelope<InsightConfigDeletedResponse>>(
    `/server/insights/settings/label-configs/${configId}`,
  );

  return response.data;
}

export async function createInsightQaRuleConfig(payload: InsightQaRuleConfigMutationRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightQaRuleConfig>,
    InsightQaRuleConfigMutationRequest
  >("/server/insights/settings/qa-rule-configs", payload);

  return response.data;
}

export async function activatePresetInsightQaRuleConfig(presetCode: string) {
  const response = await http.post<ApiSuccessEnvelope<InsightQaRuleConfig>>(
    `/server/insights/settings/qa-rule-configs/presets/${presetCode}`,
  );

  return response.data;
}

export async function updateInsightQaRuleConfig(
  configId: string,
  payload: InsightQaRuleConfigMutationRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightQaRuleConfig>,
    InsightQaRuleConfigMutationRequest
  >(`/server/insights/settings/qa-rule-configs/${configId}`, payload);

  return response.data;
}

export async function updateInsightQaRuleConfigStatus(
  configId: string,
  payload: InsightConfigStatusUpdateRequest,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<InsightQaRuleConfig>,
    InsightConfigStatusUpdateRequest
  >(`/server/insights/settings/qa-rule-configs/${configId}/status`, payload);

  return response.data;
}

export async function deleteInsightQaRuleConfig(configId: string) {
  const response = await http.delete<ApiSuccessEnvelope<InsightConfigDeletedResponse>>(
    `/server/insights/settings/qa-rule-configs/${configId}`,
  );

  return response.data;
}

export async function createInsightEntityDictionaryItem(
  payload: InsightEntityDictionaryMutationRequest,
) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightEntityDictionaryItem>,
    InsightEntityDictionaryMutationRequest
  >("/server/insights/settings/entity-dictionary", payload);

  return response.data;
}

export async function activatePresetInsightEntityDictionaryItem(presetCode: string) {
  const response = await http.post<ApiSuccessEnvelope<InsightEntityDictionaryItem>>(
    `/server/insights/settings/entity-dictionary/presets/${presetCode}`,
  );

  return response.data;
}

export async function updateInsightEntityDictionaryItem(
  configId: string,
  payload: InsightEntityDictionaryMutationRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<InsightEntityDictionaryItem>,
    InsightEntityDictionaryMutationRequest
  >(`/server/insights/settings/entity-dictionary/${configId}`, payload);

  return response.data;
}

export async function updateInsightEntityDictionaryItemStatus(
  configId: string,
  payload: InsightConfigStatusUpdateRequest,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<InsightEntityDictionaryItem>,
    InsightConfigStatusUpdateRequest
  >(`/server/insights/settings/entity-dictionary/${configId}/status`, payload);

  return response.data;
}

export async function deleteInsightEntityDictionaryItem(configId: string) {
  const response = await http.delete<ApiSuccessEnvelope<InsightConfigDeletedResponse>>(
    `/server/insights/settings/entity-dictionary/${configId}`,
  );

  return response.data;
}

export async function createInsightRescanJob(payload: InsightsRescanRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightsRescanResponse>,
    InsightsRescanRequest
  >("/server/insights/jobs/rescan", payload);

  return response.data;
}

export async function getInsightRescanTasks(page = 1, pageSize = 10) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const response = await http.get<ApiSuccessEnvelope<InsightRescanTaskListResponse>>(
    `/server/insights/jobs/rescan?${params.toString()}`,
  );

  return response.data;
}

function compactQuery<T extends Record<string, unknown>>(query: T) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value != null && value !== ""),
  );
}

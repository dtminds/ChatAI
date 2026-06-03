import type {
  ApiSuccessEnvelope,
  InsightActionStatus,
  InsightOverviewQuery as ContractInsightOverviewQuery,
  InsightAnalysisPolicy,
  InsightAnalysisPolicyUpdateRequest,
  InsightConfigDeletedResponse,
  InsightConfigStatusUpdateRequest,
  InsightDetailResponse,
  InsightEntityDictionaryItem,
  InsightEntityDictionaryMutationRequest,
  InsightLabelConfig,
  InsightLabelConfigMutationRequest,
  InsightMessageContextRequest,
  InsightMessageContextResponse,
  InsightQaRuleConfig,
  InsightQaRuleConfigMutationRequest,
  InsightSettingsResponse,
  InsightSessionizationSettings,
  InsightSessionizationSettingsUpdateRequest,
  InsightsBusinessResponse,
  InsightsFollowUpsResponse,
  InsightsOverviewResponse,
  InsightsQualityResponse,
  InsightsRescanRequest,
  InsightsRescanResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type InsightFollowUpQuery = {
  priority?: "low" | "medium" | "high";
  status?: InsightActionStatus;
  type?: string;
};

export type InsightOverviewQuery = {
  analysisStatus?: ContractInsightOverviewQuery["analysisStatus"];
  entityName?: string;
  from?: string;
  intentCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  problemScope?: ContractInsightOverviewQuery["problemScope"];
  resolutionStatus?: ContractInsightOverviewQuery["resolutionStatus"];
  tagCode?: string;
  to?: string;
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

export async function getInsightBusiness(query: InsightOverviewQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<InsightsBusinessResponse>>(
    "/server/insights/business",
    {
      params: compactQuery(query),
    },
  );

  return response.data;
}

export async function getInsightQuality() {
  const response = await http.get<ApiSuccessEnvelope<InsightsQualityResponse>>(
    "/server/insights/quality",
  );

  return response.data;
}

export async function getInsightFollowUps(query: InsightFollowUpQuery = {}) {
  const response = await http.get<ApiSuccessEnvelope<InsightsFollowUpsResponse>>(
    "/server/insights/follow-ups",
    {
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
  status: Extract<InsightActionStatus, "done" | "dismissed">,
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

export async function createInsightLabelConfig(payload: InsightLabelConfigMutationRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<InsightLabelConfig>,
    InsightLabelConfigMutationRequest
  >("/server/insights/settings/label-configs", payload);

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

function compactQuery<T extends Record<string, unknown>>(query: T) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value != null && value !== ""),
  );
}

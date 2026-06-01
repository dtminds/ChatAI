import type {
  ApiSuccessEnvelope,
  InsightActionStatus,
  InsightDetailResponse,
  InsightMessageContextRequest,
  InsightMessageContextResponse,
  InsightSettingsResponse,
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
  from?: string;
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

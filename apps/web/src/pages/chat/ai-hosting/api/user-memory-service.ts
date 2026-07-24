import type {
  AgentUserMemoryCustomerDetailResponse,
  AgentUserMemoryCustomerListResponse,
  AgentUserMemoryEvidenceResponse,
  AgentUserMemoryManualCreateRequest,
  AgentUserMemoryManualDeleteRequest,
  AgentUserMemoryManualUpdateRequest,
  AgentUserMemoryOverviewResponse,
  AgentUserMemoryRetryFailedResponse,
  AgentUserMemoryRunDetailResponse,
  AgentUserMemoryRunItemStatus,
  AgentUserMemoryRunListResponse,
  AgentUserMemorySettingsRequest,
  ApiSuccessEnvelope,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function getUserMemoryOverview() {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryOverviewResponse>>("/server/ai-hosting/user-memory/overview")).data;
}
export async function updateUserMemorySettings(payload: AgentUserMemorySettingsRequest) {
  return (await http.put<ApiSuccessEnvelope<AgentUserMemoryOverviewResponse>>("/server/ai-hosting/user-memory/settings", payload)).data;
}
export async function listUserMemoryRuns(params: { cursor?: string; pageSize?: number } = {}) {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryRunListResponse>>(`/server/ai-hosting/user-memory/runs${queryString(params)}`)).data;
}
export async function getUserMemoryRun(runId: number, params: { itemCursor?: string; itemPageSize?: number; status?: AgentUserMemoryRunItemStatus } = {}) {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryRunDetailResponse>>(`/server/ai-hosting/user-memory/runs/${runId}${queryString(params)}`)).data;
}
export async function retryUserMemoryRun(runId: number) {
  return (await http.post<ApiSuccessEnvelope<AgentUserMemoryRetryFailedResponse>>(`/server/ai-hosting/user-memory/runs/${runId}/retry-failed`)).data;
}
export async function listUserMemoryCustomers(params: { cursor?: string; pageSize?: number; query?: string } = {}) {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryCustomerListResponse>>(`/server/ai-hosting/user-memory/customers${queryString(params)}`)).data;
}
export async function getUserMemoryCustomer(platform: number, externalId: string) {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryCustomerDetailResponse>>(`/server/ai-hosting/user-memory/customers/${encodeURIComponent(externalId)}${queryString({ platform })}`)).data;
}
export async function getUserMemoryEvidence(platform: number, externalId: string, itemId: number) {
  return (await http.get<ApiSuccessEnvelope<AgentUserMemoryEvidenceResponse>>(`/server/ai-hosting/user-memory/customers/${encodeURIComponent(externalId)}/items/${itemId}/evidence${queryString({ platform })}`)).data;
}
export async function createUserMemoryItem(platform: number, externalId: string, payload: AgentUserMemoryManualCreateRequest) {
  return (await http.post<ApiSuccessEnvelope<AgentUserMemoryCustomerDetailResponse>>(`/server/ai-hosting/user-memory/customers/${encodeURIComponent(externalId)}/items${queryString({ platform })}`, payload)).data;
}
export async function updateUserMemoryItem(platform: number, externalId: string, itemId: number, payload: AgentUserMemoryManualUpdateRequest) {
  return (await http.patch<ApiSuccessEnvelope<AgentUserMemoryCustomerDetailResponse>>(`/server/ai-hosting/user-memory/customers/${encodeURIComponent(externalId)}/items/${itemId}${queryString({ platform })}`, payload)).data;
}
export async function deleteUserMemoryItem(platform: number, externalId: string, itemId: number, payload: AgentUserMemoryManualDeleteRequest) {
  return (await http.delete<ApiSuccessEnvelope<AgentUserMemoryCustomerDetailResponse>>(`/server/ai-hosting/user-memory/customers/${encodeURIComponent(externalId)}/items/${itemId}${queryString({ platform })}`, { data: payload })).data;
}

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && String(value).trim()) search.set(key, String(value));
  const result = search.toString();
  return result ? `?${result}` : "";
}

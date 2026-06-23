import type {
  AiHostingAgentDetail,
  AiHostingAgentListResponse,
  AiHostingAgentRenameRequest,
  AiHostingAgentRemoveResponse,
  AiHostingAgentSaveRequest,
  AiHostingAgentSettingsSaveRequest,
  AiHostingSettingsResponse,
  AiHostingSettingsUpdateRequest,
  AiHostingModelListResponse,
  ApiSuccessEnvelope,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type ListAgentsParams = {
  page?: number;
  pageSize?: number;
  query?: string;
};

export async function listAiHostingAgents(params: ListAgentsParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }

  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  if (params.query?.trim()) {
    searchParams.set("query", params.query.trim());
  }

  const queryString = searchParams.toString();
  const response = await http.get<ApiSuccessEnvelope<AiHostingAgentListResponse>>(
    `/server/ai-hosting/agents${queryString ? `?${queryString}` : ""}`,
  );

  return response.data;
}

export async function listAiHostingModels() {
  const response = await http.get<ApiSuccessEnvelope<AiHostingModelListResponse>>(
    "/server/ai-hosting/models",
  );

  return response.data;
}

export async function listAiHostingSettings() {
  const response = await http.get<ApiSuccessEnvelope<AiHostingSettingsResponse>>(
    "/server/ai-hosting/hosting-settings",
  );

  return response.data;
}

export async function updateAiHostingSettings(payload: AiHostingSettingsUpdateRequest) {
  const response = await http.put<
    ApiSuccessEnvelope<AiHostingSettingsResponse>,
    AiHostingSettingsUpdateRequest
  >("/server/ai-hosting/hosting-settings", payload);

  return response.data;
}

export async function getAiHostingAgent(agentId: string) {
  const response = await http.get<ApiSuccessEnvelope<AiHostingAgentDetail>>(
    `/server/ai-hosting/agents/${agentId}`,
  );

  return response.data;
}

export async function createAiHostingAgent(payload: AiHostingAgentSaveRequest) {
  const response = await http.post<
    ApiSuccessEnvelope<AiHostingAgentDetail>,
    AiHostingAgentSaveRequest
  >("/server/ai-hosting/agents", payload);

  return response.data;
}

export async function updateAiHostingAgent(
  agentId: string,
  payload: AiHostingAgentSettingsSaveRequest,
) {
  const response = await http.put<
    ApiSuccessEnvelope<AiHostingAgentDetail>,
    AiHostingAgentSettingsSaveRequest
  >(`/server/ai-hosting/agents/${agentId}`, payload);

  return response.data;
}

export async function renameAiHostingAgent(
  agentId: string,
  payload: AiHostingAgentRenameRequest,
) {
  const response = await http.patch<
    ApiSuccessEnvelope<AiHostingAgentDetail>,
    AiHostingAgentRenameRequest
  >(`/server/ai-hosting/agents/${agentId}/name`, payload);

  return response.data;
}

export async function publishAiHostingAgent(agentId: string) {
  const response = await http.post<ApiSuccessEnvelope<AiHostingAgentDetail>>(
    `/server/ai-hosting/agents/${agentId}/publish`,
  );

  return response.data;
}

export async function restoreAiHostingAgent(agentId: string) {
  const response = await http.post<ApiSuccessEnvelope<AiHostingAgentDetail>>(
    `/server/ai-hosting/agents/${agentId}/restore`,
  );

  return response.data;
}

export async function removeAiHostingAgent(agentId: string) {
  const response = await http.delete<ApiSuccessEnvelope<AiHostingAgentRemoveResponse>>(
    `/server/ai-hosting/agents/${agentId}`,
  );

  return response.data;
}

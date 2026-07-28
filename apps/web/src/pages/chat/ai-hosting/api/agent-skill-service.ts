import type {
  AgentSkillDetail,
  AgentSkillListResponse,
  AgentSkillMutationResponse,
  AgentSkillSaveRequest,
  AgentSkillStatus,
  ApiSuccessEnvelope,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type ListAgentSkillsParams = {
  page?: number;
  pageSize?: number;
  query?: string;
};

export async function listAgentSkills(params: ListAgentSkillsParams = {}) {
  const query = new URLSearchParams();

  if (params.page != null) {
    query.set("page", String(params.page));
  }

  if (params.pageSize != null) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params.query?.trim()) {
    query.set("query", params.query.trim());
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await http.get<ApiSuccessEnvelope<AgentSkillListResponse>>(
    `/server/ai-hosting/skills${suffix}`,
  );

  return response.data;
}

export async function getAgentSkill(skillId: string) {
  const response = await http.get<ApiSuccessEnvelope<AgentSkillDetail>>(
    `/server/ai-hosting/skills/${skillId}`,
  );

  return response.data;
}

export async function createAgentSkill(payload: AgentSkillSaveRequest) {
  const response = await http.post<ApiSuccessEnvelope<AgentSkillMutationResponse>>(
    "/server/ai-hosting/skills",
    payload,
  );

  return response.data;
}

export async function updateAgentSkill(
  skillId: string,
  payload: AgentSkillSaveRequest,
) {
  const response = await http.put<ApiSuccessEnvelope<AgentSkillMutationResponse>>(
    `/server/ai-hosting/skills/${skillId}`,
    payload,
  );

  return response.data;
}

export async function updateAgentSkillStatus(
  skillId: string,
  status: AgentSkillStatus,
) {
  const response = await http.patch<ApiSuccessEnvelope<AgentSkillMutationResponse>>(
    `/server/ai-hosting/skills/${skillId}/status`,
    { status },
  );

  return response.data;
}

export async function deleteAgentSkill(skillId: string) {
  const response = await http.delete<ApiSuccessEnvelope<AgentSkillMutationResponse>>(
    `/server/ai-hosting/skills/${skillId}`,
  );

  return response.data;
}

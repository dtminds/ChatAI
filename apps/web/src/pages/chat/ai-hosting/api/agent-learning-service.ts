import type {
  AiHostingLearningCandidateApproveRequest,
  AiHostingLearningCandidateBatchApproveRequest,
  AiHostingLearningCandidateBatchApproveResponse,
  AiHostingLearningCandidateBatchRejectRequest,
  AiHostingLearningCandidateBatchRejectResponse,
  AiHostingLearningCandidateActionResponse,
  AiHostingLearningCandidateListResponse,
  AiHostingLearningCandidateRejectRequest,
  AiHostingLearningCandidateStatus,
  ApiSuccessEnvelope,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type ListLearningCandidatesParams = {
  page?: number;
  pageSize?: number;
  status: AiHostingLearningCandidateStatus;
};

export async function listAgentLearningCandidates(
  agentId: string,
  params: ListLearningCandidatesParams,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("status", params.status);

  if (params.page) {
    searchParams.set("page", String(params.page));
  }

  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  const response = await http.get<ApiSuccessEnvelope<AiHostingLearningCandidateListResponse>>(
    `/server/ai-hosting/agents/${agentId}/learning-candidates?${searchParams.toString()}`,
  );

  return response.data;
}

export async function approveAgentLearningCandidate(
  agentId: string,
  candidateId: string,
  payload: AiHostingLearningCandidateApproveRequest,
) {
  const response = await http.post<
    ApiSuccessEnvelope<AiHostingLearningCandidateActionResponse>,
    AiHostingLearningCandidateApproveRequest
  >(
    `/server/ai-hosting/agents/${agentId}/learning-candidates/${candidateId}/approve`,
    payload,
  );

  return response.data;
}

export async function rejectAgentLearningCandidate(
  agentId: string,
  candidateId: string,
  payload: AiHostingLearningCandidateRejectRequest = {},
) {
  const response = await http.post<
    ApiSuccessEnvelope<AiHostingLearningCandidateActionResponse>,
    AiHostingLearningCandidateRejectRequest
  >(
    `/server/ai-hosting/agents/${agentId}/learning-candidates/${candidateId}/reject`,
    payload,
  );

  return response.data;
}

export async function batchApproveAgentLearningCandidates(
  agentId: string,
  payload: AiHostingLearningCandidateBatchApproveRequest,
) {
  const response = await http.post<
    ApiSuccessEnvelope<AiHostingLearningCandidateBatchApproveResponse>,
    AiHostingLearningCandidateBatchApproveRequest
  >(`/server/ai-hosting/agents/${agentId}/learning-candidates/batch-approve`, payload);

  return response.data;
}

export async function batchRejectAgentLearningCandidates(
  agentId: string,
  payload: AiHostingLearningCandidateBatchRejectRequest,
) {
  const response = await http.post<
    ApiSuccessEnvelope<AiHostingLearningCandidateBatchRejectResponse>,
    AiHostingLearningCandidateBatchRejectRequest
  >(`/server/ai-hosting/agents/${agentId}/learning-candidates/batch-reject`, payload);

  return response.data;
}

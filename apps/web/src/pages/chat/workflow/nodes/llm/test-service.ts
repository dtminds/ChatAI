import type {
  ApiSuccessEnvelope,
  WorkflowLlmTestAttempt,
  WorkflowLlmTestAttemptCreateRequest,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function createWorkflowLlmTestAttempt(
  workflowId: string,
  nodeId: string,
  input: WorkflowLlmTestAttemptCreateRequest,
) {
  const response = await http.post<
    ApiSuccessEnvelope<WorkflowLlmTestAttempt>,
    WorkflowLlmTestAttemptCreateRequest
  >(`/server/workflows/${workflowId}/nodes/${nodeId}/llm-test-attempts`, input);
  return response.data;
}

export async function getWorkflowLlmTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowLlmTestAttempt>>(
    `/server/workflows/${workflowId}/nodes/${nodeId}/llm-test-attempts/${attemptId}`,
  );
  return response.data;
}

export async function cancelWorkflowLlmTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
) {
  const response = await http.post<ApiSuccessEnvelope<WorkflowLlmTestAttempt>>(
    `/server/workflows/${workflowId}/nodes/${nodeId}/llm-test-attempts/${attemptId}/cancel`,
  );
  return response.data;
}

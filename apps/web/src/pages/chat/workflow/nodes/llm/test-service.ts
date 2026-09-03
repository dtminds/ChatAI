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
  apiBasePath = "/server/workflows",
) {
  const response = await http.post<
    ApiSuccessEnvelope<WorkflowLlmTestAttempt>,
    WorkflowLlmTestAttemptCreateRequest
  >(`${apiBasePath}/${workflowId}/nodes/${nodeId}/llm-test-attempts`, input);
  return response.data;
}

export async function getWorkflowLlmTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
  apiBasePath = "/server/workflows",
) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowLlmTestAttempt>>(
    `${apiBasePath}/${workflowId}/nodes/${nodeId}/llm-test-attempts/${attemptId}`,
  );
  return response.data;
}

export async function cancelWorkflowLlmTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
  apiBasePath = "/server/workflows",
) {
  const response = await http.post<ApiSuccessEnvelope<WorkflowLlmTestAttempt>>(
    `${apiBasePath}/${workflowId}/nodes/${nodeId}/llm-test-attempts/${attemptId}/cancel`,
  );
  return response.data;
}

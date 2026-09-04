import type {
  ApiSuccessEnvelope,
  WorkflowAiIntentTestAttemptCreateRequest,
  WorkflowInferenceTestAttempt,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function createWorkflowAiIntentTestAttempt(
  workflowId: string,
  nodeId: string,
  input: WorkflowAiIntentTestAttemptCreateRequest,
  apiBasePath = "/server/workflows",
) {
  const response = await http.post<
    ApiSuccessEnvelope<WorkflowInferenceTestAttempt>,
    WorkflowAiIntentTestAttemptCreateRequest
  >(`${apiBasePath}/${workflowId}/nodes/${nodeId}/ai-intent-test-attempts`, input);
  return response.data;
}

export async function getWorkflowAiIntentTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
  apiBasePath = "/server/workflows",
) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowInferenceTestAttempt>>(
    `${apiBasePath}/${workflowId}/nodes/${nodeId}/ai-intent-test-attempts/${attemptId}`,
  );
  return response.data;
}

export async function cancelWorkflowAiIntentTestAttempt(
  workflowId: string,
  nodeId: string,
  attemptId: string,
  apiBasePath = "/server/workflows",
) {
  const response = await http.post<ApiSuccessEnvelope<WorkflowInferenceTestAttempt>>(
    `${apiBasePath}/${workflowId}/nodes/${nodeId}/ai-intent-test-attempts/${attemptId}/cancel`,
  );
  return response.data;
}

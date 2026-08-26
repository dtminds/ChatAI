import type {
  ApiSuccessEnvelope,
  WorkflowDirectEntryEndpointResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function getWorkflowDirectEntryEndpoint(workflowId: string) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowDirectEntryEndpointResponse>>(
    `/server/workflows/${workflowId}/direct-entry-endpoint`,
  );
  return response.data;
}

import type {
  ApiSuccessEnvelope,
  WorkflowDirectEntryEndpointResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function getWorkflowDirectEntryEndpoint(
  workflowId: string,
  apiBasePath = "/server/workflows",
) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowDirectEntryEndpointResponse>>(
    `${apiBasePath}/${workflowId}/direct-entry-endpoint`,
  );
  return response.data;
}

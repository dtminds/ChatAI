import type {
  ApiSuccessEnvelope,
  WorkflowOrderQueryTestRunRequest,
  WorkflowOrderQueryTestRunResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function runWorkflowOrderQueryTest(
  workflowId: string,
  nodeId: string,
  input: WorkflowOrderQueryTestRunRequest,
  apiBasePath = "/server/workflows",
  signal?: AbortSignal,
) {
  const response = await http.post<
    ApiSuccessEnvelope<WorkflowOrderQueryTestRunResponse>,
    WorkflowOrderQueryTestRunRequest
  >(`${apiBasePath}/${workflowId}/nodes/${nodeId}/order-query-test-run`, input, { signal });
  return response.data;
}

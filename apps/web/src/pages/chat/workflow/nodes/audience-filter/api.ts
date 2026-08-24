import type {
  ApiSuccessEnvelope,
  WorkflowAudienceGroupListResponse,
  WorkflowAudienceGroupSnapshot,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listWorkflowAudienceGroups(): Promise<WorkflowAudienceGroupSnapshot[]> {
  const response = await http.get<ApiSuccessEnvelope<WorkflowAudienceGroupListResponse>>(
    "/server/workflow/audience-groups",
  );
  return response.data.groups;
}

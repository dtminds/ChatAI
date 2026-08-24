import type {
  ApiSuccessEnvelope,
  WorkflowAudienceGroupListResponse,
} from "@chatai/contracts";
import { WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE } from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listWorkflowAudienceGroups(params: {
  page?: number;
  pageSize?: number;
} = {}): Promise<WorkflowAudienceGroupListResponse> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE));
  const response = await http.get<ApiSuccessEnvelope<WorkflowAudienceGroupListResponse>>(
    `/server/workflow/audience-groups?${query.toString()}`,
  );
  return response.data;
}

import type {
  ApiSuccessEnvelope,
  WorkflowAudienceGroupListResponse,
} from "@chatai/contracts";
import {
  WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE,
  WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listWorkflowAudienceGroups(params: {
  name?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<WorkflowAudienceGroupListResponse> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? WORKFLOW_AUDIENCE_GROUP_LIST_PAGE_SIZE));
  const name = params.name?.trim().slice(0, WORKFLOW_AUDIENCE_GROUP_NAME_MAX_LENGTH) ?? "";
  if (name) query.set("name", name);
  const response = await http.get<ApiSuccessEnvelope<WorkflowAudienceGroupListResponse>>(
    `/server/workflow/audience-groups?${query.toString()}`,
  );
  return response.data;
}

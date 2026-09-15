import {
  WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE,
  WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH,
  type ApiSuccessEnvelope,
  type WorkflowMarketingPlanListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listWorkflowMarketingPlans(params: {
  page?: number;
  pageSize?: number;
  planName?: string;
} = {}): Promise<WorkflowMarketingPlanListResponse> {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? WORKFLOW_MARKETING_PLAN_LIST_PAGE_SIZE),
  });
  const planName = params.planName?.trim().slice(0, WORKFLOW_MARKETING_PLAN_NAME_MAX_LENGTH) ?? "";
  if (planName) query.set("planName", planName);
  const response = await http.get<ApiSuccessEnvelope<WorkflowMarketingPlanListResponse>>(
    `/server/workflow/marketing-plans?${query.toString()}`,
  );
  return response.data;
}

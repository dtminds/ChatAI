import type { ApiSuccessEnvelope, WorkflowCouponListQuery, WorkflowCouponListResponse } from "@chatai/contracts";
import { http } from "@/lib/request";

export async function listWorkflowCoupons(query: WorkflowCouponListQuery, signal?: AbortSignal) {
  const response = await http.get<ApiSuccessEnvelope<WorkflowCouponListResponse>>(
    "/server/workflow/coupons", { params: query, signal },
  );
  return response.data;
}

import type {
  ApiSuccessEnvelope,
  WorkflowObservabilityListState,
  WorkflowObservabilitySummaryResponse,
  WorkflowObservabilityWorkflowDetailResponse,
  WorkflowObservabilityWorkflowListResponse,
} from "@chatai/contracts";
import { http } from "@/lib/request";

export type WorkflowObservabilityListQuery = {
  page?: number;
  pageSize?: number;
  state?: WorkflowObservabilityListState;
  uid?: number;
  workflowId?: string;
};

export async function getWorkflowObservabilitySummary(options: { signal?: AbortSignal } = {}) {
  return (await http.get<ApiSuccessEnvelope<WorkflowObservabilitySummaryResponse>>(
    "/server/workflows/observability/summary",
    options,
  )).data;
}

export async function listWorkflowObservabilityWorkflows(
  query: WorkflowObservabilityListQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  return (await http.get<ApiSuccessEnvelope<WorkflowObservabilityWorkflowListResponse>>(
    "/server/workflows/observability/workflows",
    { ...options, params: compactQuery(query) },
  )).data;
}

export async function getWorkflowObservabilityDetail(
  workflowId: string,
  options: { signal?: AbortSignal } = {},
) {
  return (await http.get<ApiSuccessEnvelope<WorkflowObservabilityWorkflowDetailResponse>>(
    `/server/workflows/observability/workflows/${workflowId}`,
    options,
  )).data;
}

function compactQuery<T extends Record<string, unknown>>(query: T) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value != null && value !== ""),
  );
}

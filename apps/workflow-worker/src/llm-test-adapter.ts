import type {
  WorkflowInferenceMessageListRequest,
  WorkflowInferenceMessageListResult,
} from "@chatai/contracts";

export type WorkflowLlmTestAdapterRequest = {
  deadlineAt: Date;
  executionKey: string;
  payload: WorkflowInferenceMessageListRequest;
  signal: AbortSignal;
  uid: number;
};

export interface WorkflowLlmTestAdapter {
  execute(request: WorkflowLlmTestAdapterRequest): Promise<WorkflowInferenceMessageListResult>;
}

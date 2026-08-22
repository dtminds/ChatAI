import type {
  WorkflowInferenceRequest,
  WorkflowInferenceResult,
} from "@chatai/contracts";

export type WorkflowChatCompletionRequest = {
  contractVersion: number;
  deadlineAt: Date;
  executionKey: string;
  payload: WorkflowInferenceRequest;
  signal: AbortSignal;
  uid: number;
};

export interface WorkflowChatCompletionPort {
  execute(request: WorkflowChatCompletionRequest): Promise<WorkflowInferenceResult>;
}

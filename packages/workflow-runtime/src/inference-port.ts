import type {
  AiUsageModel,
  AiUsageModelToken,
  WorkflowInferenceRequest,
  WorkflowInferenceResult,
} from "@chatai/contracts";

export type WorkflowInferenceUsage = {
  billingModel: AiUsageModel;
  modelUsage: AiUsageModelToken;
};

export type WorkflowChatCompletionRequest = {
  contractVersion: number;
  deadlineAt: Date;
  executionKey: string;
  onUsage?: (usage: WorkflowInferenceUsage) => void;
  payload: WorkflowInferenceRequest;
  signal: AbortSignal;
  uid: number;
};

export interface WorkflowChatCompletionPort {
  execute(request: WorkflowChatCompletionRequest): Promise<WorkflowInferenceResult>;
}

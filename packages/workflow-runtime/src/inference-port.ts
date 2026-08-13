import type {
  WorkflowInferenceRequest,
  WorkflowInferenceResult,
} from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";

export type WorkflowJavaInferenceRequest = {
  contractVersion: number;
  deadlineAt: Date;
  executionKey: string;
  payload: WorkflowInferenceRequest;
  signal: AbortSignal;
  uid: number;
};

export interface WorkflowJavaInferencePort {
  execute(request: WorkflowJavaInferenceRequest): Promise<WorkflowInferenceResult>;
}

export class UnavailableWorkflowJavaInferencePort implements WorkflowJavaInferencePort {
  async execute(): Promise<never> {
    throw new WorkflowCapabilityExecutionError(
      "unknown",
      "WORKFLOW_JAVA_INFERENCE_UNAVAILABLE",
      "推理服务暂不可用",
      { diagnosticMessage: "Java inference adapter is not configured" },
    );
  }
}

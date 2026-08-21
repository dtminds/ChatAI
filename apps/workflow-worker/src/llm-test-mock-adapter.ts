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

export class WorkflowLlmTestMockAdapter implements WorkflowLlmTestAdapter {
  async execute(request: WorkflowLlmTestAdapterRequest): Promise<WorkflowInferenceMessageListResult> {
    if (request.signal.aborted) throw new Error("Workflow LLM test Attempt aborted");
    const format = request.payload.responseFormat;
    if (format.type !== "json") {
      return { content: "这是试运行模拟结果", type: "text" };
    }
    return {
      type: "json",
      value: Object.fromEntries(format.fields.map(field => [
        field.name,
        field.type === "boolean" ? false : field.type === "number" ? 0 : "示例文本",
      ])),
    };
  }
}

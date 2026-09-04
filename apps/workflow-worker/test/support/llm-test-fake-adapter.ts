import type { WorkflowInferenceMessageListResult } from "@chatai/contracts";
import type {
  WorkflowLlmTestAdapter,
  WorkflowLlmTestAdapterRequest,
} from "../../src/llm-test-adapter.js";

export class WorkflowLlmTestFakeAdapter implements WorkflowLlmTestAdapter {
  async execute(request: WorkflowLlmTestAdapterRequest): Promise<WorkflowInferenceMessageListResult> {
    if (request.signal.aborted) throw new Error("Workflow LLM test Attempt aborted");
    const format = request.payload.responseFormat;
    if (format.type !== "json") return { content: "这是试运行模拟结果", type: "text" };
    return {
      type: "json",
      value: Object.fromEntries(format.fields.map(field => [
        field.name,
        field.type === "boolean" ? false : field.type === "number" ? 0 : "示例文本",
      ])),
    };
  }
}

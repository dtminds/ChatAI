import type { WorkflowNodeUiBinding } from "../ui-types";
import { getVariableContentPreview } from "../variable-content/content";
import {
  getLlmInputVariables,
  normalizeLlmInputs,
  normalizeLlmModelSnapshot,
  normalizeLlmOutput,
  normalizeLlmPrompt,
} from "./config";
import { LlmConfig } from "./panel";

export const llmNodeUi: WorkflowNodeUiBinding<"llm"> = {
  body: {
    getFields: (data) => {
      const inputs = normalizeLlmInputs(data.inputs);
      const inputVariables = getLlmInputVariables(inputs);
      const systemPrompt = getVariableContentPreview(
        normalizeLlmPrompt(data.systemPrompt),
        inputVariables,
      );
      const output = normalizeLlmOutput(data.output);
      const outputLabel = output.format === "json"
        ? `JSON · ${output.fields.length} 个字段`
        : `${output.format === "markdown" ? "Markdown" : "Text"} · ${output.field.name || "未配置"}`;

      return [
        {
          id: "model",
          label: "模型",
          value: normalizeLlmModelSnapshot(data.modelLabel)
            ? { kind: "text", text: normalizeLlmModelSnapshot(data.modelLabel)! }
            : { kind: "empty" },
        },
        {
          id: "inputs",
          label: "输入",
          value: inputs.length
            ? { kind: "text", text: `${inputs.length} 个参数` }
            : { kind: "empty" },
        },
        {
          id: "prompt",
          label: "提示词",
          value: systemPrompt
            ? { kind: "text", maxLines: 2, text: systemPrompt }
            : { kind: "empty" },
        },
        {
          id: "output",
          label: "输出",
          value: { kind: "text", maxLines: 1, text: outputLabel },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: LlmConfig, kind: "custom" },
};

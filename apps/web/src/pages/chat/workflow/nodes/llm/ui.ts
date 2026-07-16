import type { WorkflowNodeUiBinding } from "../ui-types";
import { isWorkflowOutputValueTypeEqual } from "../../workflow-node-outputs";
import { resolveWorkflowVariable } from "../../workflow-variables";
import {
  LLM_INPUT_MAX_COUNT,
  LLM_OUTPUT_FIELD_MAX_COUNT,
  isLlmIdentifier,
  normalizeLlmInputs,
  normalizeLlmModelSnapshot,
  normalizeLlmOutput,
} from "./config";
import { LlmConfig } from "./panel";

export const llmNodeUi: WorkflowNodeUiBinding<"llm"> = {
  body: {
    getFields: (data) => {
      const inputs = normalizeLlmInputs(data.inputs);
      const output = normalizeLlmOutput(data.output);
      const modelLabel = normalizeLlmModelSnapshot(data.modelLabel);
      const modelName = normalizeLlmModelSnapshot(data.modelName) ?? modelLabel;
      const inputNames = inputs.map((input) => input.name.trim());
      const outputFields = output.format === "json" ? output.fields : [output.field];
      const outputNames = outputFields.map((field) => field.name.trim());
      const duplicateInputNames = getDuplicateNames(inputNames);
      const duplicateOutputNames = getDuplicateNames(outputNames);
      const availableVariables = data.availableVariables ?? [];
      const inputTags = inputs.map((input, index) => ({
        text: inputNames[index] || "未配置",
        tone: !isLlmIdentifier(inputNames[index] ?? "")
          || duplicateInputNames.has(inputNames[index] ?? "")
          || input.value.kind === "literal" && !input.value.value.trim()
          || input.value.kind === "variable" && !isAvailableVariableInput(input, availableVariables)
          ? "warning" as const
          : "default" as const,
      }));
      const outputTags = outputFields.map((field, index) => ({
        text: outputNames[index] || "未配置",
        tone: !isLlmIdentifier(outputNames[index] ?? "")
          || duplicateOutputNames.has(outputNames[index] ?? "")
          ? "warning" as const
          : "default" as const,
      }));

      if (!inputTags.length || inputs.length > LLM_INPUT_MAX_COUNT) {
        inputTags.push({ text: "未配置", tone: "warning" });
      }
      if (!outputTags.length || outputFields.length > LLM_OUTPUT_FIELD_MAX_COUNT) {
        outputTags.push({ text: "未配置", tone: "warning" });
      }

      return [
        {
          id: "model",
          label: "模型",
          value: modelLabel && modelName
            ? { kind: "model", label: modelLabel, model: modelName }
            : { kind: "empty" },
        },
        {
          id: "inputs",
          label: "输入",
          value: { items: inputTags, kind: "tags", singleLine: true },
        },
        {
          id: "output",
          label: "输出",
          value: { items: outputTags, kind: "tags", singleLine: true },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: LlmConfig, kind: "custom" },
};

function getDuplicateNames(names: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  names.filter(Boolean).forEach((name) => {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  });
  return duplicates;
}

function isAvailableVariableInput(
  input: ReturnType<typeof normalizeLlmInputs>[number],
  variables: NonNullable<Parameters<typeof resolveWorkflowVariable>[0]>,
) {
  if (input.value.kind !== "variable") return true;
  const variable = resolveWorkflowVariable(variables, input.value.selector);
  return Boolean(variable && isWorkflowOutputValueTypeEqual(input.value.valueType, variable.valueType));
}

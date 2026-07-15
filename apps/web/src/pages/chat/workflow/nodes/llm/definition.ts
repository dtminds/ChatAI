import { AiMagicIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import {
  createCatalogIssue,
  createDefaultSourceHandles,
  createDefaultTargetHandles,
  createNodeData,
  sourceNodeKinds,
  targetNodeKinds,
} from "../definition-shared";
import {
  LLM_IDENTIFIER_PATTERN,
  LLM_INPUT_MAX_COUNT,
  LLM_INPUT_NAME_MAX_LENGTH,
  LLM_OUTPUT_DESCRIPTION_MAX_LENGTH,
  LLM_OUTPUT_FIELD_MAX_COUNT,
  LLM_OUTPUT_NAME_MAX_LENGTH,
  LLM_PROMPT_MAX_LENGTH,
  createDefaultLlmOutput,
  getInvalidLlmPromptSelectors,
  getLlmInputVariables,
  getLlmMetric,
  getLlmOutputDefinitions,
  getLlmStatus,
  normalizeLlmInputs,
  normalizeLlmModelId,
  normalizeLlmModelSnapshot,
  normalizeLlmOutput,
  normalizeLlmPrompt,
} from "./config";
import { getVariableContentText } from "../variable-content/content";

export const llmNodeDefinition: WorkflowNodeDefinition<"llm"> = {
  availableNextKinds: targetNodeKinds,
  availablePrevKinds: sourceNodeKinds,
  canDelete: true,
  canDuplicate: true,
  canInsertAfter: true,
  canRename: true,
  configSections: [],
  createDefaultData: () => createNodeData("llm", 1, {
    inputs: [],
    label: "大模型",
    metric: "待选择模型",
    modelId: "",
    modelLabel: undefined,
    modelName: undefined,
    output: createDefaultLlmOutput(),
    status: "warning",
    systemPrompt: [],
    title: "大模型",
    userPrompt: [],
  }),
  createExecutionConfig: (data) => ({
    inputs: normalizeLlmInputs(data.inputs),
    modelId: normalizeLlmModelId(data.modelId),
    output: normalizeLlmOutput(data.output),
    systemPrompt: normalizeLlmPrompt(data.systemPrompt),
    userPrompt: normalizeLlmPrompt(data.userPrompt),
  }),
  description: "调用大模型生成文本或结构化结果",
  getOutputVariables: (node) => getLlmOutputDefinitions(node.data.output),
  getSourceHandles: createDefaultSourceHandles,
  getTargetHandles: createDefaultTargetHandles,
  insertable: true,
  kind: "llm",
  layout: {
    estimatedHeight: 190,
    width: 320,
  },
  ownsOutputConfiguration: true,
  paletteGroup: "data",
  paletteLabel: "大模型",
  sanitizeData: (data) => {
    const nextData = {
      ...data,
      inputs: normalizeLlmInputs(data.inputs),
      modelId: normalizeLlmModelId(data.modelId),
      modelLabel: normalizeLlmModelSnapshot(data.modelLabel),
      modelName: normalizeLlmModelSnapshot(data.modelName),
      output: normalizeLlmOutput(data.output),
      systemPrompt: normalizeLlmPrompt(data.systemPrompt),
      userPrompt: normalizeLlmPrompt(data.userPrompt),
    };

    return {
      ...nextData,
      metric: getLlmMetric(nextData),
      status: getLlmStatus(nextData),
    };
  },
  schemaVersion: 1,
  sort: 40,
  validate: (node) => {
    const issues = [];
    const inputs = normalizeLlmInputs(node.data.inputs);
    const inputVariables = getLlmInputVariables(inputs);
    const inputNames = inputs.map((input) => input.name.trim());
    const rawInputs = Array.isArray(node.data.inputs) ? node.data.inputs : [];
    const systemPrompt = normalizeLlmPrompt(node.data.systemPrompt);
    const userPrompt = normalizeLlmPrompt(node.data.userPrompt);
    const output = normalizeLlmOutput(node.data.output);
    const outputFields = output.format === "json" ? output.fields : [output.field];
    const outputNames = outputFields.map((field) => field.name.trim());
    const rawOutputFields = getRawOutputFields(node.data.output);

    if (!normalizeLlmModelId(node.data.modelId)) {
      issues.push(createCatalogIssue("llm-model-required", "大模型需要选择模型"));
    }
    if (rawInputs.length > LLM_INPUT_MAX_COUNT) {
      issues.push(createCatalogIssue(
        "llm-input-count-invalid",
        `输入参数不能超过 ${LLM_INPUT_MAX_COUNT} 个`,
      ));
    }
    if (inputNames.some((name) => !name)) {
      issues.push(createCatalogIssue("llm-input-name-required", "输入参数名不能为空"));
    }
    if (rawInputs.some((input) =>
      input && typeof input.name === "string" && input.name.length > LLM_INPUT_NAME_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "llm-input-name-too-long",
        `输入参数名不能超过 ${LLM_INPUT_NAME_MAX_LENGTH} 个字符`,
      ));
    }
    if (inputNames.some((name) => name && !LLM_IDENTIFIER_PATTERN.test(name))) {
      issues.push(createCatalogIssue(
        "llm-input-name-invalid",
        "输入参数名仅支持字母、数字和下划线，且不能以数字开头",
      ));
    }
    if (new Set(inputNames).size !== inputNames.length) {
      issues.push(createCatalogIssue("llm-input-name-duplicate", "输入参数名不能重复"));
    }
    if (inputs.some((input) => input.value.kind === "literal" && !input.value.value.trim())) {
      issues.push(createCatalogIssue("llm-input-value-required", "输入参数值不能为空"));
    }
    const systemPromptText = getVariableContentText(systemPrompt, inputVariables);
    const userPromptText = getVariableContentText(userPrompt, inputVariables);
    if (!systemPromptText.trim()) {
      issues.push(createCatalogIssue("llm-system-prompt-required", "系统提示词不能为空"));
    }
    if (systemPromptText.length > LLM_PROMPT_MAX_LENGTH) {
      issues.push(createCatalogIssue(
        "llm-system-prompt-too-long",
        `系统提示词不能超过 ${LLM_PROMPT_MAX_LENGTH} 字`,
      ));
    }
    if (userPromptText.length > LLM_PROMPT_MAX_LENGTH) {
      issues.push(createCatalogIssue(
        "llm-user-prompt-too-long",
        `用户提示词不能超过 ${LLM_PROMPT_MAX_LENGTH} 字`,
      ));
    }
    if (
      getInvalidLlmPromptSelectors(systemPrompt, inputs).length
      || getInvalidLlmPromptSelectors(userPrompt, inputs).length
    ) {
      issues.push(createCatalogIssue("llm-prompt-input-invalid", "提示词引用了不可用输入参数"));
    }

    if (output.format === "json" && (rawOutputFields.length < 1
      || rawOutputFields.length > LLM_OUTPUT_FIELD_MAX_COUNT)) {
      issues.push(createCatalogIssue(
        "llm-output-count-invalid",
        `JSON 输出字段需要为 1-${LLM_OUTPUT_FIELD_MAX_COUNT} 个`,
      ));
    }
    if (outputNames.some((name) => !name)) {
      issues.push(createCatalogIssue("llm-output-name-required", "输出变量名不能为空"));
    }
    if (rawOutputFields.some((field) =>
      field && typeof field.name === "string" && field.name.length > LLM_OUTPUT_NAME_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "llm-output-name-too-long",
        `输出变量名不能超过 ${LLM_OUTPUT_NAME_MAX_LENGTH} 个字符`,
      ));
    }
    if (outputNames.some((name) => name && !LLM_IDENTIFIER_PATTERN.test(name))) {
      issues.push(createCatalogIssue(
        "llm-output-name-invalid",
        "输出变量名仅支持字母、数字和下划线，且不能以数字开头",
      ));
    }
    if (new Set(outputNames).size !== outputNames.length) {
      issues.push(createCatalogIssue("llm-output-name-duplicate", "输出变量名不能重复"));
    }
    if (rawOutputFields.some((field) =>
      field && typeof field.description === "string"
      && field.description.length > LLM_OUTPUT_DESCRIPTION_MAX_LENGTH,
    )) {
      issues.push(createCatalogIssue(
        "llm-output-description-too-long",
        `输出描述不能超过 ${LLM_OUTPUT_DESCRIPTION_MAX_LENGTH} 字`,
      ));
    }

    return issues;
  },
  visual: {
    accentClassName: "bg-neutral-950 text-white ring-neutral-950/20",
    accentRgb: "10 10 10",
    badge: "ai",
    icon: AiMagicIcon,
    label: "大模型",
  },
};

function getRawOutputFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const output = value as Record<string, unknown>;
  if (output.format === "json") {
    return Array.isArray(output.fields)
      ? output.fields.filter((field): field is Record<string, unknown> =>
          Boolean(field) && typeof field === "object" && !Array.isArray(field))
      : [];
  }
  return output.field && typeof output.field === "object" && !Array.isArray(output.field)
    ? [output.field as Record<string, unknown>]
    : [];
}

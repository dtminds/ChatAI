import type {
  LlmNodeData,
  WorkflowLlmInputParameter,
  WorkflowLlmInputValue,
  WorkflowLlmOutputConfig,
  WorkflowLlmOutputField,
  WorkflowLlmOutputFieldType,
  WorkflowNodeOutputDefinition,
  WorkflowNodeStatus,
  WorkflowOutputValueType,
  WorkflowVariableContentSegment,
  WorkflowVariableDefinition,
  WorkflowVariableSelector,
} from "../../types";
import { getVariableContentText, normalizeVariableContent } from "../variable-content/content";

export const LLM_INPUT_MAX_COUNT = 10;
export const LLM_INPUT_NAME_MAX_LENGTH = 15;
export const LLM_PROMPT_MAX_LENGTH = 10_000;
export const LLM_OUTPUT_FIELD_MAX_COUNT = 10;
export const LLM_OUTPUT_NAME_MAX_LENGTH = 15;
export const LLM_OUTPUT_DESCRIPTION_MAX_LENGTH = 200;
export const LLM_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

let llmItemIdSequence = 0;

export function createLlmInputParameter(
  inputs: WorkflowLlmInputParameter[] = [],
): WorkflowLlmInputParameter {
  return {
    id: createUniqueItemId("input", inputs.map((input) => input.id)),
    name: "",
    value: { kind: "literal", value: "" },
  };
}

export function createLlmOutputField(
  fields: WorkflowLlmOutputField[] = [],
  defaults: Partial<Pick<WorkflowLlmOutputField, "description" | "name" | "type">> = {},
): WorkflowLlmOutputField {
  return {
    description: defaults.description ?? "",
    id: createUniqueItemId("output", fields.map((field) => field.id)),
    name: defaults.name ?? "",
    type: defaults.type ?? "string",
  };
}

export function createDefaultLlmOutput(): WorkflowLlmOutputConfig {
  return createNormalizedDefaultOutput();
}

export function normalizeLlmModelId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeLlmModelSnapshot(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function normalizeLlmInputs(value: unknown): WorkflowLlmInputParameter[] {
  if (!Array.isArray(value)) return [];

  const inputs: WorkflowLlmInputParameter[] = [];
  const seenIds = new Set<string>();

  for (const [index, rawInput] of value.entries()) {
    if (!isRecord(rawInput) || inputs.length >= LLM_INPUT_MAX_COUNT) continue;
    const id = normalizeStableId(rawInput.id, "input", index, seenIds);
    seenIds.add(id);
    inputs.push({
      id,
      name: normalizeIdentifierText(rawInput.name, LLM_INPUT_NAME_MAX_LENGTH),
      value: normalizeLlmInputValue(rawInput.value),
    });
  }

  return inputs;
}

function normalizeLlmInputValue(value: unknown): WorkflowLlmInputValue {
  if (isRecord(value) && value.kind === "variable") {
    const selector = normalizeSelector(value.selector);
    const valueType = normalizeInputValueType(value.valueType);
    if (selector && valueType) {
      return { kind: "variable", selector, valueType };
    }
  }

  return {
    kind: "literal",
    value: isRecord(value) && typeof value.value === "string" ? value.value : "",
  };
}

export function normalizeLlmPrompt(value: unknown): WorkflowVariableContentSegment[] {
  return normalizeVariableContent(Array.isArray(value)
    ? value.filter(isVariableContentSegment)
    : []);
}

export function normalizeLlmOutput(value: unknown): WorkflowLlmOutputConfig {
  if (!isRecord(value)) return createNormalizedDefaultOutput();
  const format = normalizeLlmOutputFormat(value.format);

  if (format === "json") {
    const rawFields = Array.isArray(value.fields) ? value.fields : [];
    const fields: WorkflowLlmOutputField[] = [];
    const seenIds = new Set<string>();
    for (const [index, rawField] of rawFields.entries()) {
      if (!isRecord(rawField) || fields.length >= LLM_OUTPUT_FIELD_MAX_COUNT) continue;
      const id = normalizeStableId(rawField.id, "output", index, seenIds);
      seenIds.add(id);
      fields.push(normalizeLlmOutputField(rawField, id));
    }
    return { fields, format: "json" };
  }

  const rawField = isRecord(value.field) ? value.field : {};
  return {
    field: {
      ...normalizeLlmOutputField(
        rawField,
        normalizeStableId(rawField.id, "output", 0, new Set()),
      ),
      type: "string",
    },
    format,
  };
}

export function getLlmInputVariables(
  inputs: WorkflowLlmInputParameter[],
): WorkflowVariableDefinition[] {
  return normalizeLlmInputs(inputs).map((input, index) => {
    const valueType = input.value.kind === "variable"
      ? input.value.valueType
      : { kind: "string" as const };
    return {
      key: input.id,
      label: input.name.trim() || `参数 ${index + 1}`,
      scope: "input",
      selector: getLlmInputSelector(input.id),
      type: getInputVariableType(valueType),
      usages: ["variable"],
      valueType,
    };
  });
}

export function getLlmInputSelector(inputId: string): WorkflowVariableSelector {
  return ["input", inputId];
}

export function getLlmOutputDefinitions(
  output: WorkflowLlmOutputConfig,
): WorkflowNodeOutputDefinition[] {
  const normalized = normalizeLlmOutput(output);
  const fields = normalized.format === "json" ? normalized.fields : [normalized.field];

  return fields.map((field, index) => ({
    description: field.description.trim() || undefined,
    key: field.id,
    label: field.name.trim() || `未命名输出 ${index + 1}`,
    usages: field.type === "string"
      ? ["variable", "message-content"]
      : ["variable"],
    valueType: primitiveOutputType(field.type),
  }));
}

export function getLlmMetric(data: Pick<LlmNodeData, "modelLabel" | "modelId" | "output">) {
  const modelLabel = normalizeLlmModelSnapshot(data.modelLabel);
  if (!normalizeLlmModelId(data.modelId)) return "待选择模型";
  if (modelLabel) return modelLabel;
  return normalizeLlmOutput(data.output).format === "json" ? "JSON 输出" : "文本输出";
}

export function getLlmStatus(data: Pick<
  LlmNodeData,
  "inputs" | "modelId" | "output" | "systemPrompt" | "userPrompt"
>): WorkflowNodeStatus {
  const inputs = normalizeLlmInputs(data.inputs);
  const inputVariables = getLlmInputVariables(inputs);
  const output = normalizeLlmOutput(data.output);
  const systemPromptText = getVariableContentText(data.systemPrompt, inputVariables);
  const userPromptText = getVariableContentText(data.userPrompt, inputVariables);

  return normalizeLlmModelId(data.modelId)
    && areLlmInputsComplete(inputs)
    && Boolean(systemPromptText.trim())
    && systemPromptText.length <= LLM_PROMPT_MAX_LENGTH
    && userPromptText.length <= LLM_PROMPT_MAX_LENGTH
    && arePromptSelectorsAvailable(data.systemPrompt, inputVariables)
    && arePromptSelectorsAvailable(data.userPrompt, inputVariables)
    && isLlmOutputComplete(output)
    ? "ready"
    : "warning";
}

export function isLlmIdentifier(value: string) {
  return Boolean(value.trim())
    && value.length <= LLM_INPUT_NAME_MAX_LENGTH
    && LLM_IDENTIFIER_PATTERN.test(value);
}

export function areLlmInputsComplete(inputs: WorkflowLlmInputParameter[]) {
  const normalized = normalizeLlmInputs(inputs);
  const names = normalized.map((input) => input.name.trim());
  return normalized.length <= LLM_INPUT_MAX_COUNT
    && names.every(isLlmIdentifier)
    && new Set(names).size === names.length
    && normalized.every((input) => input.value.kind === "variable"
      ? Boolean(normalizeSelector(input.value.selector))
      : Boolean(input.value.value.trim()));
}

export function isLlmOutputComplete(output: WorkflowLlmOutputConfig) {
  const normalized = normalizeLlmOutput(output);
  const fields = normalized.format === "json" ? normalized.fields : [normalized.field];
  const names = fields.map((field) => field.name.trim());
  return fields.length > 0
    && fields.length <= LLM_OUTPUT_FIELD_MAX_COUNT
    && names.every(isLlmIdentifier)
    && new Set(names).size === names.length;
}

export function getInvalidLlmPromptSelectors(
  prompt: WorkflowVariableContentSegment[] | undefined,
  inputs: WorkflowLlmInputParameter[],
) {
  const availableIds = new Set(normalizeLlmInputs(inputs).map((input) => input.id));
  return normalizeLlmPrompt(prompt)
    .filter((segment): segment is Extract<WorkflowVariableContentSegment, { type: "variable" }> =>
      segment.type === "variable")
    .map((segment) => segment.selector)
    .filter((selector) => selector.length !== 2
      || selector[0] !== "input"
      || !availableIds.has(selector[1]));
}

function arePromptSelectorsAvailable(
  prompt: WorkflowVariableContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[],
) {
  const available = new Set(variables.map((variable) => variable.selector.join(".")));
  return normalizeLlmPrompt(prompt).every((segment) =>
    segment.type === "text" || available.has(segment.selector.join(".")));
}

function normalizeLlmOutputField(
  value: Record<string, unknown>,
  id: string,
): WorkflowLlmOutputField {
  return {
    description: typeof value.description === "string"
      ? value.description.slice(0, LLM_OUTPUT_DESCRIPTION_MAX_LENGTH)
      : "",
    id,
    name: normalizeIdentifierText(value.name, LLM_OUTPUT_NAME_MAX_LENGTH),
    type: normalizeLlmOutputFieldType(value.type),
  };
}

function normalizeLlmOutputFormat(value: unknown): WorkflowLlmOutputConfig["format"] {
  return value === "markdown" || value === "json" ? value : "text";
}

function normalizeLlmOutputFieldType(value: unknown): WorkflowLlmOutputFieldType {
  return value === "number" || value === "boolean" ? value : "string";
}

function normalizeInputValueType(value: unknown): WorkflowOutputValueType | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "string" || value.kind === "number" || value.kind === "boolean" || value.kind === "datetime") {
    return { kind: value.kind };
  }
  if (
    value.kind === "reference"
    && (value.semantic === "customer" || value.semantic === "message"
      || value.semantic === "order" || value.semantic === "tag")
  ) {
    return { kind: "reference", semantic: value.semantic };
  }
  if (
    value.kind === "array"
    && (value.itemType === "bigint" || value.itemType === "number" || value.itemType === "string")
    && (value.semantic === undefined || value.semantic === "message"
      || value.semantic === "order" || value.semantic === "tag")
  ) {
    return {
      itemType: value.itemType,
      kind: "array",
      semantic: value.semantic,
    };
  }
  if (value.kind === "object" && typeof value.schemaRef === "string" && value.schemaRef.trim()) {
    return { kind: "object", schemaRef: value.schemaRef.trim() };
  }
  return undefined;
}

function primitiveOutputType(
  type: WorkflowLlmOutputFieldType | "datetime",
): WorkflowOutputValueType {
  if (type === "number") return { kind: "number" };
  if (type === "boolean") return { kind: "boolean" };
  if (type === "datetime") return { kind: "datetime" };
  return { kind: "string" };
}

function getInputVariableType(valueType: WorkflowOutputValueType): WorkflowVariableDefinition["type"] {
  if (
    valueType.kind === "string"
    || valueType.kind === "number"
    || valueType.kind === "boolean"
    || valueType.kind === "datetime"
  ) {
    return valueType.kind;
  }
  if (valueType.kind === "array" && valueType.semantic === "message") {
    return "message-id-list";
  }
  if (valueType.kind === "reference") return "string";
  return "object";
}

function normalizeSelector(value: unknown): WorkflowVariableSelector | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  if (value.some((part) => typeof part !== "string" || !part.trim())) return undefined;
  return [...value];
}

function normalizeIdentifierText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function normalizeStableId(
  value: unknown,
  prefix: "input" | "output",
  index: number,
  seenIds: Set<string>,
) {
  const rawId = typeof value === "string" ? value.trim() : "";
  if (rawId && /^[A-Za-z][A-Za-z0-9_-]*$/.test(rawId) && !seenIds.has(rawId)) {
    return rawId;
  }

  const base = `${prefix}-${index + 1}`;
  let candidate = base;
  let suffix = 1;
  while (seenIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function createUniqueItemId(prefix: "input" | "output", existingIds: string[]) {
  const existing = new Set(existingIds);
  let candidate = "";
  do {
    candidate = createItemIdCandidate(prefix);
  } while (existing.has(candidate));
  return candidate;
}

function createItemIdCandidate(prefix: "input" | "output") {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  llmItemIdSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${llmItemIdSequence.toString(36)}`;
}

function createNormalizedDefaultOutput(): WorkflowLlmOutputConfig {
  return {
    field: {
      description: "",
      id: "output-1",
      name: "output",
      type: "string",
    },
    format: "text",
  };
}

function isVariableContentSegment(value: unknown): value is WorkflowVariableContentSegment {
  if (!isRecord(value)) return false;
  return value.type === "text" && typeof value.value === "string"
    || value.type === "variable" && Boolean(normalizeSelector(value.selector));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

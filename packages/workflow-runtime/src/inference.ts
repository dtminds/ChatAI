import {
  isWorkflowAiCollectExecutionConfigComplete,
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  WORKFLOW_MESSAGE_SCHEMA_REF,
  WORKFLOW_MESSAGES_SCHEMA_REF,
  WorkflowAiIntentCompletionValueSchema,
  WorkflowInferenceRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowMessageSchema,
  WorkflowMessagesV1Schema,
  type WorkflowAiCollectExecutionConfig,
  type WorkflowAiIntentExecutionConfig,
  type WorkflowExecutionNode,
  type WorkflowInferenceContentPart,
  type WorkflowInferenceRequest,
  type WorkflowInferenceMessageListResult,
  type WorkflowInferenceMessageListRequest,
  type WorkflowInferenceResult,
  type WorkflowJsonObject,
  type WorkflowLlmInputParameter,
  type WorkflowOutputValueType,
  type WorkflowVariableContentSegment,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import {
  VOLCENGINE_ARK_WORKFLOW_AI_COLLECT_MODEL,
  VOLCENGINE_ARK_WORKFLOW_AI_INTENT_MODEL,
} from "@chatai/llm";
import type { WorkflowRunRecord } from "./types.js";
import { getWorkflowMessageRoleLabel } from "./workflow-messages.js";

export function createWorkflowInferenceRequest(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string } = {},
): WorkflowInferenceRequest {
  const request = node.kind === "llm"
    ? createLlmRequest(node, input => input.value.kind === "literal"
        ? input.value.value
        : requireSelectorValue(input.value.selector, run, currentNodeLifecycle))
    : node.kind === "ai-intent"
      ? createIntentRequest(node, run)
      : null;
  if (!request) throw inferenceConfigError(`Unsupported inference node kind: ${node.kind}`);
  if (!Value.Check(WorkflowInferenceRequestSchema, request)) {
    throw inferenceConfigError("Rendered inference request failed schema validation");
  }
  return request;
}

export function createWorkflowLlmInferenceRequest(
  node: WorkflowExecutionNode,
  inputValues: ReadonlyMap<string, unknown>,
): WorkflowInferenceMessageListRequest {
  if (node.kind !== "llm") {
    throw inferenceConfigError(`Expected an LLM node, received: ${node.kind}`);
  }
  const request = createLlmRequest(node, input => requireInputValue(input.id, inputValues));
  if (!Value.Check(WorkflowInferenceRequestSchema, request)) {
    throw inferenceConfigError("Rendered inference request failed schema validation");
  }
  return request;
}

export function createWorkflowAiIntentInferenceRequest(
  node: WorkflowExecutionNode,
  inputValue: unknown,
): WorkflowInferenceMessageListRequest {
  if (node.kind !== "ai-intent") {
    throw inferenceConfigError(`Expected an AI Intent node, received: ${node.kind}`);
  }
  const request = createIntentRequestFromValue(node, inputValue);
  if (!Value.Check(WorkflowInferenceRequestSchema, request)) {
    throw inferenceConfigError("Rendered inference request failed schema validation");
  }
  return request;
}

export function hasWorkflowInferenceInput(value: unknown) {
  if (value === undefined) return false;
  return hasInferenceContent(renderInferenceValue(value));
}

export function resolveWorkflowAiCollectInput(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string } = {},
) {
  if (node.kind !== "ai-collect" || !isWorkflowAiCollectExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("AI Collect execution config failed schema validation");
  }
  return node.config.inputSelector
    ? requireSelectorValue(node.config.inputSelector, run, currentNodeLifecycle)
    : undefined;
}

export function createWorkflowAiCollectInferenceRequest(
  node: WorkflowExecutionNode,
  inputValue: unknown,
  collected: Readonly<Record<string, unknown>> = {},
): WorkflowInferenceMessageListRequest {
  if (node.kind !== "ai-collect" || !isWorkflowAiCollectExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("AI Collect execution config failed schema validation");
  }
  const content = renderInferenceValue(inputValue);
  if (!hasInferenceContent(content)) {
    throw inferenceConfigError("AI Collect input is empty");
  }
  const missingFields = node.config.fields.filter(field => !(field.id in collected));
  if (missingFields.length === 0) {
    throw inferenceConfigError("AI Collect has no missing fields");
  }
  const catalog = missingFields.map((field, index) => ({
    code: `F${index + 1}`,
    instruction: field.instruction,
    name: field.name,
    type: field.type,
  }));
  const request: WorkflowInferenceMessageListRequest = {
    kind: "message-list",
    messageList: [
      {
        content: [{
          text: [
            "Extract explicitly provided values for the configured fields from the user input.",
            "For every configured field code, return both <code>_present and <code>_value.",
            "Set <code>_present to false when the value is missing, ambiguous, incomplete, or cannot be normalized. In that case, use a type-safe empty placeholder for <code>_value.",
            "For date use YYYY-MM-DD, for time use HH:mm, and do not infer unsupported facts.",
            `Fields:\n${JSON.stringify(catalog, null, 2)}`,
          ].join("\n\n"),
          type: "text",
        }],
        role: "system",
      },
      { content, role: "user" },
    ],
    modelTarget: {
      endpointId: VOLCENGINE_ARK_WORKFLOW_AI_COLLECT_MODEL,
      kind: "endpoint",
    },
    reasoningEffort: "low",
    responseFormat: {
      fields: missingFields.flatMap((field, index) => {
        const code = `F${index + 1}`;
        return [
          {
            description: `Whether ${field.name} was explicitly provided and valid`,
            name: `${code}_present`,
            type: "boolean" as const,
          },
          {
            description: createAiCollectFieldDescription(field),
            name: `${code}_value`,
            type: field.type === "number" || field.type === "boolean"
              ? field.type
              : "string" as const,
          },
        ];
      }),
      type: "json",
    },
  };
  if (!Value.Check(WorkflowInferenceRequestSchema, request)) {
    throw inferenceConfigError("Rendered AI Collect request failed schema validation");
  }
  return request;
}

export function mapWorkflowAiCollectInferenceResult(
  node: WorkflowExecutionNode,
  result: WorkflowInferenceResult,
  collected: Readonly<Record<string, unknown>> = {},
): WorkflowJsonObject {
  if (node.kind !== "ai-collect" || !isWorkflowAiCollectExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("AI Collect execution config failed schema validation");
  }
  if (!Value.Check(WorkflowInferenceMessageListResultSchema, result) || result.type !== "json") {
    throw inferenceOutputError("AI Collect result failed schema validation");
  }
  const missingFields = node.config.fields.filter(field => !(field.id in collected));
  const next = structuredClone(collected) as Record<string, unknown>;
  const allowedKeys = new Set(missingFields.flatMap((_, index) => [
    `F${index + 1}_present`,
    `F${index + 1}_value`,
  ]));
  if (Object.keys(result.value).some(key => !allowedKeys.has(key))) {
    throw inferenceOutputError("AI Collect result contains an unknown field");
  }
  for (const [index, field] of missingFields.entries()) {
    const code = `F${index + 1}`;
    const present = result.value[`${code}_present`];
    const value = result.value[`${code}_value`];
    if (typeof present !== "boolean" || value === undefined) {
      throw inferenceOutputError(`AI Collect result is incomplete for ${code}`);
    }
    if (!present) continue;
    if (!isValidAiCollectValue(field.type, value)) {
      throw inferenceOutputError(`AI Collect result is invalid for ${code}`);
    }
    next[field.id] = typeof value === "string" ? value.trim() : value;
  }
  return next as WorkflowJsonObject;
}

export function resolveWorkflowAiIntentTestWithoutProvider(
  node: WorkflowExecutionNode,
  inputValue: unknown,
): {
  output: Record<string, unknown>;
  result: WorkflowInferenceMessageListResult;
  sourceOutletId: string;
} | null {
  if (node.kind !== "ai-intent") return null;
  const content = renderInferenceValue(inputValue);
  if (hasInferenceContent(content)) return null;
  const result: WorkflowInferenceMessageListResult = {
    type: "json",
    value: { matchedCode: "fallback", reason: "输入为空" },
  };
  return { ...mapIntentResult(node, result), result };
}

export function mapWorkflowInferenceResult(
  node: WorkflowExecutionNode,
  result: WorkflowInferenceResult,
): { output: Record<string, unknown>; sourceOutletId: string } {
  if (node.kind === "llm") return mapLlmResult(node, result);
  if (node.kind === "ai-intent") return mapIntentResult(node, result);
  throw inferenceOutputError(`Unsupported inference node kind: ${node.kind}`);
}

export function resolveWorkflowInferenceWithoutProvider(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string } = {},
): { output: Record<string, unknown>; sourceOutletId: string } | null {
  if (node.kind !== "ai-intent") return null;
  const { content } = resolveAiIntentInput(node, run, currentNodeLifecycle);
  if (hasInferenceContent(content)) return null;
  return {
    output: { matchedIntentDescription: "其他意图", reason: "输入为空" },
    sourceOutletId: "fallback",
  };
}

function createLlmRequest(
  node: WorkflowExecutionNode,
  resolveInput: (input: WorkflowLlmInputParameter) => unknown,
): WorkflowInferenceMessageListRequest {
  if (!isWorkflowLlmExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("LLM execution config failed schema validation");
  }
  const inputs = new Map(node.config.inputs.map(input => [
    input.id,
    {
      value: resolveInput(input),
      valueType: input.value.kind === "literal"
        ? { kind: "string" as const }
        : input.value.valueType,
    },
  ]));
  const system = renderPrompt(node.config.systemPrompt, inputs);
  if (!hasInferenceContent(system)) throw inferenceConfigError("LLM system prompt is empty");
  const user = renderPrompt(node.config.userPrompt, inputs);
  const messageList: Array<{
    content: WorkflowInferenceContentPart[];
    role: "system" | "user";
  }> = [
    { content: system, role: "system" },
  ];
  if (hasInferenceContent(user)) messageList.push({ content: user, role: "user" });
  const responseFormat = node.config.output.format === "json"
    ? {
        fields: node.config.output.fields.map(field => ({
          description: field.description,
          name: field.name,
          type: field.type,
        })),
        type: "json" as const,
      }
    : { type: node.config.output.format };
  return {
    kind: "message-list",
    messageList,
    modelTarget: { kind: "catalog-model", modelId: node.config.modelId },
    reasoningEffort: node.config.reasoningEffort ?? "medium",
    responseFormat,
  };
}

function requireInputValue(inputId: string, inputValues: ReadonlyMap<string, unknown>) {
  if (!inputValues.has(inputId)) {
    throw inferenceConfigError("LLM test input is missing a configured parameter");
  }
  return inputValues.get(inputId);
}

function createIntentRequest(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
): WorkflowInferenceMessageListRequest {
  const { content } = resolveAiIntentInput(node, run);
  return createIntentRequestFromContent(node, content);
}

function createIntentRequestFromValue(
  node: WorkflowExecutionNode,
  inputValue: unknown,
): WorkflowInferenceMessageListRequest {
  return createIntentRequestFromContent(node, renderInferenceValue(inputValue));
}

function createIntentRequestFromContent(
  node: WorkflowExecutionNode,
  content: WorkflowInferenceContentPart[],
): WorkflowInferenceMessageListRequest {
  if (!isWorkflowAiIntentExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("AI Intent execution config failed schema validation");
  }
  return {
    kind: "message-list",
    messageList: buildAiIntentPromptV1(
      content,
      node.config.intents,
      node.config.prompt ?? "",
    ),
    modelTarget: {
      endpointId: VOLCENGINE_ARK_WORKFLOW_AI_INTENT_MODEL,
      kind: "endpoint",
    },
    reasoningEffort: "low",
    responseFormat: {
      fields: [
        {
          description: "Matched intent code or fallback",
          name: "matchedCode",
          type: "string",
        },
        {
          description: "Brief reason for the classification",
          name: "reason",
          type: "string",
        },
      ],
      type: "json",
    },
  };
}

function buildAiIntentPromptV1(
  input: WorkflowInferenceContentPart[],
  intents: Array<{ description: string; modelCode: string }>,
  additionalRules: string,
): Array<{ content: WorkflowInferenceContentPart[]; role: "system" | "user" }> {
  const intentCatalog = JSON.stringify(intents.map(intent => ({
    code: intent.modelCode,
    description: intent.description,
  })), null, 2);
  const rules = additionalRules.trim()
    ? `\n\nAdditional classification rules:\n${additionalRules.trim()}`
    : "";
  const messageList: Array<{
    content: WorkflowInferenceContentPart[];
    role: "system" | "user";
  }> = [
    {
      content: [{
        text: [
          "Classify the user input into exactly one configured intent.",
          "Use fallback only when none of the configured intents match.",
          "Return matchedCode and a brief reason. Do not return any other fields.",
          `Configured intents:\n${intentCatalog}\nfallback: no configured intent matches`,
        ].join("\n\n") + rules,
        type: "text",
      }],
      role: "system",
    },
  ];
  if (hasInferenceContent(input)) messageList.push({ content: input, role: "user" });
  return messageList;
}

function createAiCollectFieldDescription(
  field: WorkflowAiCollectExecutionConfig["fields"][number],
) {
  const format = field.type === "date"
    ? " Format: YYYY-MM-DD."
    : field.type === "time"
      ? " Format: HH:mm."
      : "";
  return `${field.name}. ${field.instruction}${format}`.slice(0, 200);
}

function isValidAiCollectValue(
  type: WorkflowAiCollectExecutionConfig["fields"][number]["type"],
  value: unknown,
) {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (typeof value !== "string" || !value.trim() || value.length > 500) return false;
  if (type === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const normalized = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return normalized.getUTCFullYear() === Number(match[1])
      && normalized.getUTCMonth() === Number(match[2]) - 1
      && normalized.getUTCDate() === Number(match[3]);
  }
  if (type === "time") return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  return true;
}

function resolveAiIntentInput(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string } = {},
): { config: WorkflowAiIntentExecutionConfig; content: WorkflowInferenceContentPart[] } {
  if (!isWorkflowAiIntentExecutionConfigComplete(node.config) || !node.config.inputSelector) {
    throw inferenceConfigError("AI Intent execution config failed schema validation");
  }
  return {
    config: node.config,
    content: renderInferenceValue(requireSelectorValue(
      node.config.inputSelector,
      run,
      currentNodeLifecycle,
    )),
  };
}

function mapLlmResult(
  node: WorkflowExecutionNode,
  result: WorkflowInferenceResult,
): { output: Record<string, unknown>; sourceOutletId: string } {
  if (!isWorkflowLlmExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("LLM execution config failed schema validation");
  }
  if (node.config.output.format !== "json") {
    if (!Value.Check(WorkflowInferenceMessageListResultSchema, result)
      || result.type !== "text") {
      throw inferenceOutputError("LLM text result failed schema validation");
    }
    return {
      output: { [node.config.output.field.id]: result.content },
      sourceOutletId: "default",
    };
  }
  if (!Value.Check(WorkflowInferenceMessageListResultSchema, result) || result.type !== "json") {
    throw inferenceOutputError("LLM JSON result failed schema validation");
  }
  const expectedNames = new Set(node.config.output.fields.map(field => field.name));
  const actualNames = Object.keys(result.value);
  if (actualNames.length !== expectedNames.size || actualNames.some(name => !expectedNames.has(name))) {
    throw inferenceOutputError("LLM JSON result fields do not match the configured output");
  }
  const output: Record<string, unknown> = {};
  for (const field of node.config.output.fields) {
    const value = result.value[field.name];
    if (typeof value !== field.type) {
      throw inferenceOutputError(`LLM JSON result type mismatch for ${field.name}`);
    }
    output[field.id] = value;
  }
  return { output, sourceOutletId: "default" };
}

function mapIntentResult(
  node: WorkflowExecutionNode,
  result: WorkflowInferenceResult,
): { output: Record<string, unknown>; sourceOutletId: string } {
  if (!isWorkflowAiIntentExecutionConfigComplete(node.config)) {
    throw inferenceConfigError("AI Intent execution config failed schema validation");
  }
  if (!Value.Check(WorkflowInferenceMessageListResultSchema, result)
    || result.type !== "json"
    || !Value.Check(WorkflowAiIntentCompletionValueSchema, result.value)) {
    throw inferenceOutputError("AI Intent result failed schema validation");
  }
  if (result.value.matchedCode === "fallback") {
    return {
      output: { matchedIntentDescription: "其他意图", reason: result.value.reason },
      sourceOutletId: "fallback",
    };
  }
  const intent = node.config.intents.find(item => item.modelCode === result.value.matchedCode);
  if (!intent) {
    throw inferenceOutputError(`Unknown AI Intent result code: ${result.value.matchedCode}`);
  }
  return {
    output: { matchedIntentDescription: intent.description, reason: result.value.reason },
    sourceOutletId: `intent:${intent.id}`,
  };
}

function renderPrompt(
  segments: WorkflowVariableContentSegment[],
  inputs: Map<string, { value: unknown; valueType: WorkflowOutputValueType }>,
) {
  const content: WorkflowInferenceContentPart[] = [];
  for (const segment of segments) {
    if (segment.type === "text") {
      appendTextPart(content, segment.value);
      continue;
    }
    const [scope, id] = segment.selector;
    if (scope !== "input" || !id || segment.selector.length !== 2 || !inputs.has(id)) {
      throw inferenceConfigError("LLM prompt references an unavailable input");
    }
    const input = inputs.get(id)!;
    if (input.valueType.kind === "object"
      && (input.valueType.schemaRef === WORKFLOW_MESSAGE_SCHEMA_REF
        || input.valueType.schemaRef === WORKFLOW_MESSAGES_SCHEMA_REF)) {
      appendWorkflowMessages(
        content,
        input.valueType.schemaRef === WORKFLOW_MESSAGE_SCHEMA_REF ? [input.value] : input.value,
      );
      continue;
    }
    appendTextPart(content, stringifyPromptValue(input.value));
  }
  return content;
}

function renderInferenceValue(value: unknown): WorkflowInferenceContentPart[] {
  const content: WorkflowInferenceContentPart[] = [];
  if (Value.Check(WorkflowMessageSchema, value)) {
    appendWorkflowMessages(content, [value]);
  } else if (Value.Check(WorkflowMessagesV1Schema, value)) {
    appendWorkflowMessages(content, value);
  } else {
    appendTextPart(content, stringifyPromptValue(value));
  }
  return content;
}

function appendWorkflowMessages(
  content: WorkflowInferenceContentPart[],
  value: unknown,
) {
  if (!Value.Check(WorkflowMessagesV1Schema, value)) {
    throw inferenceConfigError("Workflow messages input failed schema validation");
  }
  for (const message of value) {
    appendTextPart(
      content,
      `${content.length ? "\n" : ""}${getWorkflowMessageRoleLabel(message.role)}: `,
    );
    for (const part of message.parts) {
      if (part.type === "text") appendTextPart(content, part.text);
      else if (part.type === "unsupported") appendTextPart(content, `[${part.label}]`);
      else content.push({ type: part.type, url: part.url });
    }
  }
}

function appendTextPart(content: WorkflowInferenceContentPart[], text: string) {
  if (!text) return;
  const previous = content.at(-1);
  if (previous?.type === "text") previous.text += text;
  else content.push({ text, type: "text" });
}

function hasInferenceContent(content: WorkflowInferenceContentPart[]) {
  return content.some(part => part.type !== "text" || Boolean(part.text.trim()));
}

function requireSelectorValue(
  selector: WorkflowVariableSelector,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string } = {},
) {
  const resolved = resolveSelector(selector, run, currentNodeLifecycle);
  if (!resolved.available) throw inferenceConfigError("Inference input references unavailable data");
  return resolved.value;
}

function resolveSelector(
  selector: WorkflowVariableSelector,
  run: WorkflowRunRecord,
  currentNodeLifecycle: { enteredAt?: string },
) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return { available: false, value: undefined };
  if (scope === "subject" && key === "id" && path.length === 0) {
    return { available: true, value: run.subjectId };
  }
  if (scope === "trigger") return readPath(run.context.trigger, [key, ...path]);
  if (scope === "node") return readPath(readRecord(run.context.outputs)?.[key], path);
  if (scope === "node-lifecycle") return readPath(readRecord(run.context.nodeLifecycle)?.[key], path);
  if (scope === "current-node-lifecycle") return readPath(currentNodeLifecycle, [key, ...path]);
  return { available: false, value: undefined };
}

function readPath(value: unknown, path: string[]) {
  if (value === undefined) return { available: false, value: undefined };
  let current: unknown = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { available: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { available: true, value: current };
}

function stringifyPromptValue(value: unknown) {
  if (typeof value === "string") return value;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw inferenceConfigError("Inference input cannot be serialized");
  return serialized;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function inferenceConfigError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_INFERENCE_INPUT_INVALID",
    "执行所需数据不可用，流程已停止",
    { diagnosticMessage },
  );
}

function inferenceOutputError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_INFERENCE_OUTPUT_INVALID",
    "返回结果异常，流程已停止",
    { diagnosticMessage },
  );
}

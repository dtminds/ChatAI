import {
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  WORKFLOW_MESSAGE_SCHEMA_REF,
  WORKFLOW_MESSAGES_SCHEMA_REF,
  WorkflowAiIntentCompletionValueSchema,
  WorkflowInferenceRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowMessageSchema,
  WorkflowMessagesV1Schema,
  type WorkflowAiIntentExecutionConfig,
  type WorkflowExecutionNode,
  type WorkflowInferenceContentPart,
  type WorkflowInferenceRequest,
  type WorkflowInferenceMessageListResult,
  type WorkflowInferenceMessageListRequest,
  type WorkflowInferenceResult,
  type WorkflowLlmInputParameter,
  type WorkflowOutputValueType,
  type WorkflowVariableContentSegment,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { VOLCENGINE_ARK_WORKFLOW_AI_INTENT_MODEL } from "@chatai/llm";
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

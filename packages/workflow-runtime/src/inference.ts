import {
  WORKFLOW_INTENT_TEMPLATE_KEY,
  isWorkflowAiIntentExecutionConfigComplete,
  isWorkflowLlmExecutionConfigComplete,
  WorkflowInferenceRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowInferenceTemplateResultSchema,
  type WorkflowExecutionNode,
  type WorkflowInferenceRequest,
  type WorkflowInferenceMessageListRequest,
  type WorkflowInferenceResult,
  type WorkflowLlmInputParameter,
  type WorkflowVariableContentSegment,
  type WorkflowVariableSelector,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import type { WorkflowRunRecord } from "./types.js";

export function createWorkflowInferenceRequest(
  node: WorkflowExecutionNode,
  run: WorkflowRunRecord,
): WorkflowInferenceRequest {
  const request = node.kind === "llm"
    ? createLlmRequest(node, input => input.value.kind === "literal"
        ? input.value.value
        : requireSelectorValue(input.value.selector, run))
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

export function mapWorkflowInferenceResult(
  node: WorkflowExecutionNode,
  result: WorkflowInferenceResult,
): { output: Record<string, unknown>; sourceOutletId: string } {
  if (node.kind === "llm") return mapLlmResult(node, result);
  if (node.kind === "ai-intent") return mapIntentResult(node, result);
  throw inferenceOutputError(`Unsupported inference node kind: ${node.kind}`);
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
    resolveInput(input),
  ]));
  const system = renderPrompt(node.config.systemPrompt, inputs);
  if (!system.trim()) throw inferenceConfigError("LLM system prompt is empty");
  const user = renderPrompt(node.config.userPrompt, inputs);
  const messageList: Array<{ content: string; role: "system" | "user" }> = [
    { content: system, role: "system" },
  ];
  if (user.trim()) messageList.push({ content: user, role: "user" });
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
    modelId: node.config.modelId,
    responseFormat,
  };
}

function requireInputValue(inputId: string, inputValues: ReadonlyMap<string, unknown>) {
  if (!inputValues.has(inputId)) {
    throw inferenceConfigError("LLM test input is missing a configured parameter");
  }
  return inputValues.get(inputId);
}

function createIntentRequest(node: WorkflowExecutionNode, run: WorkflowRunRecord): WorkflowInferenceRequest {
  if (!isWorkflowAiIntentExecutionConfigComplete(node.config) || !node.config.inputSelector) {
    throw inferenceConfigError("AI Intent execution config failed schema validation");
  }
  const input = requireSelectorValue(node.config.inputSelector, run);
  return {
    kind: "template",
    templateKey: WORKFLOW_INTENT_TEMPLATE_KEY,
    variables: {
      additionalRules: node.config.prompt ?? "",
      input: stringifyPromptValue(input),
      intents: JSON.stringify(node.config.intents.map(intent => ({
        code: intent.modelCode,
        description: intent.description,
      }))),
    },
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
  if (!Value.Check(WorkflowInferenceTemplateResultSchema, result)) {
    throw inferenceOutputError("AI Intent result failed schema validation");
  }
  if (result.matchedCode === "fallback") {
    return {
      output: { matchedIntentDescription: "其他意图", reason: result.reason },
      sourceOutletId: "fallback",
    };
  }
  const intent = node.config.intents.find(item => item.modelCode === result.matchedCode);
  if (!intent) throw inferenceOutputError(`Unknown AI Intent result code: ${result.matchedCode}`);
  return {
    output: { matchedIntentDescription: intent.description, reason: result.reason },
    sourceOutletId: `intent:${intent.id}`,
  };
}

function renderPrompt(
  segments: WorkflowVariableContentSegment[],
  inputs: Map<string, unknown>,
) {
  return segments.map(segment => {
    if (segment.type === "text") return segment.value;
    const [scope, id] = segment.selector;
    if (scope !== "input" || !id || segment.selector.length !== 2 || !inputs.has(id)) {
      throw inferenceConfigError("LLM prompt references an unavailable input");
    }
    return stringifyPromptValue(inputs.get(id));
  }).join("");
}

function requireSelectorValue(selector: WorkflowVariableSelector, run: WorkflowRunRecord) {
  const resolved = resolveSelector(selector, run);
  if (!resolved.available) throw inferenceConfigError("Inference input references unavailable data");
  return resolved.value;
}

function resolveSelector(selector: WorkflowVariableSelector, run: WorkflowRunRecord) {
  const [scope, key, ...path] = selector;
  if (!scope || !key) return { available: false, value: undefined };
  if (scope === "subject" && key === "id" && path.length === 0) {
    return { available: true, value: run.subjectId };
  }
  if (scope === "trigger") return readPath(run.context.trigger, [key, ...path]);
  if (scope === "node") return readPath(readRecord(run.context.outputs)?.[key], path);
  if (scope === "node-lifecycle") return readPath(readRecord(run.context.nodeLifecycle)?.[key], path);
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
    "节点配置无法执行",
    { diagnosticMessage },
  );
}

function inferenceOutputError(diagnosticMessage: string) {
  return new WorkflowCapabilityExecutionError(
    "terminal",
    "WORKFLOW_INFERENCE_OUTPUT_INVALID",
    "节点返回的数据无法处理，流程已停止",
    { diagnosticMessage },
  );
}

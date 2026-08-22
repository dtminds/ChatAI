import type { WorkflowExecutionNode } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  createWorkflowLlmInferenceRequest,
  createWorkflowInferenceRequest,
  mapWorkflowInferenceResult,
  type WorkflowRunRecord,
} from "../src/index.js";

describe("workflow inference payloads", () => {
  it("resolves LLM inputs into a complete message list and maps public names to stable output IDs", () => {
    const node = llmNode({
      inputs: [
        { id: "input-1", name: "message", value: { kind: "variable", selector: ["trigger", "text"], valueType: { kind: "string" } } },
        { id: "input-2", name: "tone", value: { kind: "literal", value: "简洁" } },
      ],
      output: {
        fields: [
          { description: "摘要", id: "field-summary", name: "summary", type: "string" },
          { description: "是否紧急", id: "field-urgent", name: "urgent", type: "boolean" },
        ],
        format: "json",
      },
      systemPrompt: [
        { type: "text", value: "请用" },
        { selector: ["input", "input-2"], type: "variable" },
        { type: "text", value: "方式处理" },
      ],
      userPrompt: [{ selector: ["input", "input-1"], type: "variable" }],
    });

    expect(createWorkflowInferenceRequest(node, run())).toEqual({
      kind: "message-list",
      messageList: [
        { content: "请用简洁方式处理", role: "system" },
        { content: "退款什么时候到账", role: "user" },
      ],
      modelTarget: { kind: "catalog-model", modelId: "model-1" },
      reasoningEffort: "medium",
      responseFormat: {
        fields: [
          { description: "摘要", name: "summary", type: "string" },
          { description: "是否紧急", name: "urgent", type: "boolean" },
        ],
        type: "json",
      },
    });
    expect(mapWorkflowInferenceResult(node, {
      type: "json",
      value: { summary: "客户询问退款进度", urgent: false },
    })).toEqual({
      output: { "field-summary": "客户询问退款进度", "field-urgent": false },
      sourceOutletId: "default",
    });
  });

  it("sends AI Intent as template variables and maps model code to the stable handle", () => {
    const node: WorkflowExecutionNode = {
      config: {
        fallback: { id: "fallback" },
        inputSelector: ["trigger", "text"],
        intents: [
          { description: "咨询退款", id: "intent-refund", modelCode: "I1" },
          { description: "咨询物流", id: "intent-logistics", modelCode: "I2" },
        ],
        prompt: "退款未到账优先判断为退款",
      },
      id: "intent-1",
      kind: "ai-intent",
      nodeSchemaVersion: 1,
    };

    expect(createWorkflowInferenceRequest(node, run())).toEqual({
      kind: "template",
      templateKey: "workflow.intent.classify.v1",
      variables: {
        additionalRules: "退款未到账优先判断为退款",
        input: "退款什么时候到账",
        intents: JSON.stringify([
          { code: "I1", description: "咨询退款" },
          { code: "I2", description: "咨询物流" },
        ]),
      },
    });
    expect(mapWorkflowInferenceResult(node, { matchedCode: "I2", reason: "用户询问物流" }))
      .toEqual({
        output: { matchedIntentDescription: "咨询物流", reason: "用户询问物流" },
        sourceOutletId: "intent:intent-logistics",
      });
    expect(mapWorkflowInferenceResult(node, { matchedCode: "fallback", reason: "未命中" }))
      .toEqual({
        output: { matchedIntentDescription: "其他意图", reason: "未命中" },
        sourceOutletId: "fallback",
      });
  });

  it("resolves upstream and current-node lifecycle values for LLM inputs", () => {
    const node = llmNode({
      inputs: [
        {
          id: "input-1",
          name: "previousExit",
          value: {
            kind: "variable",
            selector: ["node-lifecycle", "wait-1", "exitedAt"],
            valueType: { kind: "datetime" },
          },
        },
        {
          id: "input-2",
          name: "currentEntry",
          value: {
            kind: "variable",
            selector: ["current-node-lifecycle", "enteredAt"],
            valueType: { kind: "datetime" },
          },
        },
      ],
      systemPrompt: [
        { selector: ["input", "input-1"], type: "variable" },
        { type: "text", value: " -> " },
        { selector: ["input", "input-2"], type: "variable" },
      ],
    });
    const workflowRun = run();
    workflowRun.context = {
      ...workflowRun.context,
      nodeLifecycle: {
        "wait-1": {
          enteredAt: "2026-08-14T01:00:00.000Z",
          exitedAt: "2026-08-14T02:00:00.000Z",
        },
      },
    };

    expect(createWorkflowInferenceRequest(
      node,
      workflowRun,
      { enteredAt: "2026-08-14T02:00:01.000Z" },
    )).toEqual(expect.objectContaining({
      messageList: [{
        content: "2026-08-14T02:00:00.000Z -> 2026-08-14T02:00:01.000Z",
        role: "system",
      }],
    }));
  });

  it("rejects unavailable selectors, unknown intent codes, and mismatched JSON fields", () => {
    expect(() => createWorkflowInferenceRequest(llmNode({
      inputs: [{
        id: "input-1",
        name: "missing",
        value: { kind: "variable", selector: ["node", "missing", "output"], valueType: { kind: "string" } },
      }],
      systemPrompt: [{ selector: ["input", "input-1"], type: "variable" }],
    }), run())).toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_INPUT_INVALID" }));

    const intentNode: WorkflowExecutionNode = {
      config: {
        fallback: { id: "fallback" },
        inputSelector: ["trigger", "text"],
        intents: [{ description: "咨询退款", id: "intent-refund", modelCode: "I1" }],
      },
      id: "intent-1",
      kind: "ai-intent",
      nodeSchemaVersion: 1,
    };
    expect(() => mapWorkflowInferenceResult(intentNode, { matchedCode: "I2", reason: "wrong" }))
      .toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_OUTPUT_INVALID" }));
    expect(() => mapWorkflowInferenceResult(llmNode({
      output: {
        fields: [{ description: "摘要", id: "field-summary", name: "summary", type: "string" }],
        format: "json",
      },
    }), { type: "json", value: { unexpected: "value" } }))
      .toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_OUTPUT_INVALID" }));
  });

  it("rejects a rendered Java request that exceeds the shared request contract", () => {
    expect(() => createWorkflowInferenceRequest(llmNode({
      systemPrompt: [
        { type: "text", value: "x".repeat(10_000) },
        { type: "text", value: "x".repeat(10_000) },
        { type: "text", value: "x" },
      ],
    }), run())).toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_INPUT_INVALID" }));
  });

  it("renders the same LLM request from explicit test values", () => {
    const node = llmNode({
      inputs: [{
        id: "input-1",
        name: "message",
        value: {
          kind: "variable",
          selector: ["trigger", "text"],
          valueType: { kind: "string" },
        },
      }],
      systemPrompt: [
        { type: "text", value: "Classify: " },
        { selector: ["input", "input-1"], type: "variable" },
      ],
    });

    expect(createWorkflowLlmInferenceRequest(
      node,
      new Map([["input-1", "退款什么时候到账"]]),
    )).toEqual(createWorkflowInferenceRequest(node, run()));
  });
});

function llmNode(overrides: Record<string, unknown> = {}): WorkflowExecutionNode {
  return {
    config: {
      inputs: [],
      modelId: "model-1",
      reasoningEffort: "medium",
      output: {
        field: { description: "", id: "output-1", name: "output", type: "string" },
        format: "text",
      },
      systemPrompt: [{ type: "text", value: "Summarize" }],
      userPrompt: [],
      ...overrides,
    },
    id: "llm-1",
    kind: "llm",
    nodeSchemaVersion: 1,
  };
}

function run(): WorkflowRunRecord {
  return {
    context: { trigger: { text: "退款什么时候到账" } },
    createdAt: new Date("2026-08-12T00:00:00.000Z"),
    currentNodeId: "llm-1",
    entryEventId: "event-1",
    id: "run-1",
    lockVersion: 1,
    nextExecuteAt: null,
    revision: 1,
    sequence: 2,
    shardId: 1,
    status: "running",
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
  };
}

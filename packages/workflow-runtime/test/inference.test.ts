import type { WorkflowExecutionNode } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  createWorkflowLlmInferenceRequest,
  createWorkflowInferenceRequest,
  mapWorkflowInferenceResult,
  resolveWorkflowInferenceWithoutProvider,
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
        { content: [{ text: "请用简洁方式处理", type: "text" }], role: "system" },
        { content: [{ text: "退款什么时候到账", type: "text" }], role: "user" },
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

  it("renders AI Intent as a complete direct-endpoint request and maps codes to stable handles", () => {
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
      kind: "message-list",
      messageList: [
        {
          content: [{
            text: expect.stringMatching(
              /"code": "I1"[\s\S]*"description": "咨询退款"[\s\S]*"code": "I2"[\s\S]*fallback[\s\S]*退款未到账优先判断为退款/,
            ),
            type: "text",
          }],
          role: "system",
        },
        { content: [{ text: "退款什么时候到账", type: "text" }], role: "user" },
      ],
      modelTarget: { endpointId: "ep-20260227145914-nxcmn", kind: "endpoint" },
      reasoningEffort: "low",
      responseFormat: {
        fields: [
          { description: "Matched intent code or fallback", name: "matchedCode", type: "string" },
          { description: "Brief reason for the classification", name: "reason", type: "string" },
        ],
        type: "json",
      },
    });
    expect(mapWorkflowInferenceResult(node, {
      type: "json",
      value: { matchedCode: "I2", reason: "用户询问物流" },
    }))
      .toEqual({
        output: { matchedIntentDescription: "咨询物流", reason: "用户询问物流" },
        sourceOutletId: "intent:intent-logistics",
      });
    expect(mapWorkflowInferenceResult(node, {
      type: "json",
      value: { matchedCode: "fallback", reason: "未命中" },
    }))
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
        content: [{
          text: "2026-08-14T02:00:00.000Z -> 2026-08-14T02:00:01.000Z",
          type: "text",
        }],
        role: "system",
      }],
    }));
  });

  it("expands structured messages inline in system and user prompts", () => {
    const messages = [
      {
        id: 101,
        parts: [
          { text: "你好", type: "text" as const },
          { text: "，看下这个", type: "text" as const },
          { type: "image" as const, url: "/media/error.png" },
          { text: "这个报错怎么解决？", type: "text" as const },
        ],
        role: "customer" as const,
      },
      {
        id: 102,
        parts: [
          { text: "请稍等", type: "text" as const },
          { label: "语音", type: "unsupported" as const },
          { type: "video" as const, url: "https://media.example/demo.mp4" },
        ],
        role: "agent" as const,
      },
    ];
    const input = {
      id: "input-messages",
      name: "messages",
      value: {
        kind: "variable" as const,
        selector: ["node", "query", "messages"] as const,
        valueType: { kind: "object" as const, schemaRef: "workflow.messages.v1" },
      },
    };
    const node = llmNode({
      inputs: [input],
      systemPrompt: [
        { type: "text", value: "上下文：" },
        { selector: ["input", "input-messages"], type: "variable" },
      ],
      userPrompt: [
        { selector: ["input", "input-messages"], type: "variable" },
        { type: "text", value: "\n请回答" },
      ],
    });
    const workflowRun = run();
    workflowRun.context = {
      ...workflowRun.context,
      outputs: { query: { messages } },
    };

    expect(createWorkflowInferenceRequest(node, workflowRun)).toMatchObject({
      messageList: [
        {
          content: [
            { text: "上下文：\n用户: 你好，看下这个", type: "text" },
            { type: "image", url: "/media/error.png" },
            { text: "这个报错怎么解决？\n客服: 请稍等[语音]", type: "text" },
            { type: "video", url: "https://media.example/demo.mp4" },
          ],
          role: "system",
        },
        {
          content: [
            { text: "用户: 你好，看下这个", type: "text" },
            { type: "image", url: "/media/error.png" },
            { text: "这个报错怎么解决？\n客服: 请稍等[语音]", type: "text" },
            { type: "video", url: "https://media.example/demo.mp4" },
            { text: "\n请回答", type: "text" },
          ],
          role: "user",
        },
      ],
    });
  });

  it("falls back only when AI Intent has no text or media content", () => {
    const node: WorkflowExecutionNode = {
      config: {
        fallback: { id: "fallback" },
        inputSelector: ["node", "query", "messages"],
        intents: [{ description: "咨询退款", id: "intent-refund", modelCode: "I1" }],
      },
      id: "intent-1",
      kind: "ai-intent",
      nodeSchemaVersion: 1,
    };
    const imageRun = run();
    imageRun.context = {
      outputs: {
        query: {
          messages: [{
            id: 101,
            parts: [{ type: "image", url: "/media/order.png" }],
            role: "customer",
          }],
        },
      },
    };
    expect(resolveWorkflowInferenceWithoutProvider(node, imageRun)).toBeNull();

    const emptyRun = run();
    emptyRun.context = { outputs: { query: { messages: [] } } };
    expect(resolveWorkflowInferenceWithoutProvider(node, emptyRun)).toEqual({
      output: { matchedIntentDescription: "其他意图", reason: "输入为空" },
      sourceOutletId: "fallback",
    });
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
    expect(() => mapWorkflowInferenceResult(intentNode, {
      type: "json",
      value: { matchedCode: "I2", reason: "wrong" },
    }))
      .toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_OUTPUT_INVALID" }));
    expect(() => mapWorkflowInferenceResult(intentNode, {
      type: "json",
      value: { matchedCode: "I1" },
    } as never)).toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_OUTPUT_INVALID" }));
    expect(() => mapWorkflowInferenceResult(intentNode, {
      type: "json",
      value: { matchedCode: "I1", reason: "matched", unexpected: true },
    } as never)).toThrow(expect.objectContaining({ code: "WORKFLOW_INFERENCE_OUTPUT_INVALID" }));
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

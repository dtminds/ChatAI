import type {
  WorkflowExecutionNode,
  WorkflowInferenceMessageListRequest,
} from "@chatai/contracts";
import {
  InMemoryWorkflowLlmTestAttemptRepository,
} from "@chatai/workflow-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processWorkflowLlmTestAttemptBatch } from "../src/llm-test-attempt-worker.js";
import { WorkflowLlmTestFakeAdapter } from "./support/llm-test-fake-adapter.js";

const now = new Date("2099-01-01T00:00:00.000Z");

describe("Workflow LLM test Attempt worker", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["text", "markdown"] as const)(
    "maps the %s Mock result to the configured stable output field",
    async format => {
      const { attempt, repository } = await createAttempt(llmNode(format));

      await expect(processWorkflowLlmTestAttemptBatch({
        adapter: new WorkflowLlmTestFakeAdapter(),
        heartbeatIntervalMs: 10_000,
        leaseDurationMs: 60_000,
        leaseOwner: "llm-test-worker-1",
        limit: 10,
        now: () => now,
        repository,
      })).resolves.toEqual({ claimed: 1, failed: 0, succeeded: 1, timedOut: 0 });
      await expect(find(repository, attempt.id)).resolves.toMatchObject({
        output: { "output-text": "这是试运行模拟结果" },
        status: "succeeded",
      });
    },
  );

  it("maps a JSON Mock result by configured stable field IDs", async () => {
    const { attempt, repository } = await createAttempt(llmNode("json"));

    await processWorkflowLlmTestAttemptBatch({
      adapter: new WorkflowLlmTestFakeAdapter(),
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository,
    });

    await expect(find(repository, attempt.id)).resolves.toMatchObject({
      output: { "field-approved": false, "field-score": 0, "field-summary": "示例文本" },
      status: "succeeded",
    });
  });

  it("completes an empty AI Intent input as fallback without calling the Adapter", async () => {
    const repository = new InMemoryWorkflowLlmTestAttemptRepository();
    const node = aiIntentNode();
    const attempt = await repository.createLlmTestAttempt({
      contractVersion: 1,
      createdAt: now,
      deadlineAt: new Date(now.getTime() + 600_000),
      executionKey: "test:empty-ai-intent",
      expiresAt: new Date(now.getTime() + 86_400_000),
      inputValues: { inputValue: [] },
      node,
      opSubUserId: "17",
      payload: aiIntentPayload(),
      uid: 9,
      workflowId: "31",
    });
    const execute = vi.fn();

    await expect(processWorkflowLlmTestAttemptBatch({
      adapter: { execute },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository,
    })).resolves.toEqual({ claimed: 1, failed: 0, succeeded: 1, timedOut: 0 });

    expect(execute).not.toHaveBeenCalled();
    await expect(find(repository, attempt.id)).resolves.toMatchObject({
      output: { matchedIntentDescription: "其他意图", reason: "输入为空" },
      status: "succeeded",
    });
  });

  it("maps a non-empty AI Intent Adapter result to the configured intent", async () => {
    const repository = new InMemoryWorkflowLlmTestAttemptRepository();
    const node = aiIntentNode();
    const attempt = await repository.createLlmTestAttempt({
      contractVersion: 1,
      createdAt: now,
      deadlineAt: new Date(now.getTime() + 600_000),
      executionKey: "test:ai-intent",
      expiresAt: new Date(now.getTime() + 86_400_000),
      inputValues: {
        inputValue: [{
          id: 101,
          parts: [{ text: "退款什么时候到账", type: "text" }],
          role: "customer",
        }],
      },
      node,
      opSubUserId: "17",
      payload: aiIntentPayload(),
      uid: 9,
      workflowId: "31",
    });
    const execute = vi.fn(async () => ({
      type: "json" as const,
      value: { matchedCode: "I1", reason: "用户询问退款" },
    }));

    await processWorkflowLlmTestAttemptBatch({
      adapter: { execute },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository,
    });

    expect(execute).toHaveBeenCalledOnce();
    await expect(find(repository, attempt.id)).resolves.toMatchObject({
      output: { matchedIntentDescription: "咨询退款", reason: "用户询问退款" },
      status: "succeeded",
    });
  });

  it("records malformed and oversized Adapter results as failed", async () => {
    const malformed = await createAttempt(llmNode("text"));
    await processWorkflowLlmTestAttemptBatch({
      adapter: { execute: async () => ({ invalid: true }) as never },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository: malformed.repository,
    });
    await expect(find(malformed.repository, malformed.attempt.id)).resolves.toMatchObject({
      errorCode: "WORKFLOW_LLM_TEST_OUTPUT_INVALID",
      status: "failed",
    });

    const oversized = await createAttempt(llmNode("text"));
    await processWorkflowLlmTestAttemptBatch({
      adapter: { execute: async () => ({ content: "x".repeat(8 * 1024), type: "text" }) },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository: oversized.repository,
    });
    await expect(find(oversized.repository, oversized.attempt.id)).resolves.toMatchObject({
      errorCode: "WORKFLOW_LLM_TEST_OUTPUT_TOO_LARGE",
      status: "failed",
    });
  });

  it("aborts a running Adapter call at the Attempt deadline", async () => {
    vi.useFakeTimers();
    const { attempt, repository } = await createAttempt(
      llmNode("text"),
      new Date(now.getTime() + 100),
    );
    const processing = processWorkflowLlmTestAttemptBatch({
      adapter: { execute: async () => new Promise<never>(() => undefined) },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "llm-test-worker-1",
      limit: 10,
      now: () => now,
      repository,
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(processing).resolves.toEqual({
      claimed: 1,
      failed: 0,
      succeeded: 0,
      timedOut: 1,
    });
    await expect(find(repository, attempt.id)).resolves.toMatchObject({
      errorCode: "WORKFLOW_LLM_TEST_TIMEOUT",
      status: "timed_out",
    });
  });
});

async function createAttempt(
  node: WorkflowExecutionNode,
  deadlineAt = new Date(now.getTime() + 600_000),
) {
  const repository = new InMemoryWorkflowLlmTestAttemptRepository();
  const payload = payloadFor(node);
  const attempt = await repository.createLlmTestAttempt({
    contractVersion: 1,
    createdAt: now,
    deadlineAt,
    executionKey: `test:${Math.random()}`,
    expiresAt: new Date(now.getTime() + 86_400_000),
    inputValues: {},
    node,
    opSubUserId: "17",
    payload,
    uid: 9,
    workflowId: "31",
  });
  return { attempt, repository };
}

function payloadFor(node: WorkflowExecutionNode): WorkflowInferenceMessageListRequest {
  if (node.kind !== "llm") throw new Error("Expected LLM node");
  return {
    kind: "message-list",
    messageList: [{ content: [{ text: "Summarize", type: "text" }], role: "system" }],
    modelTarget: { kind: "catalog-model", modelId: "model-1" },
    reasoningEffort: "medium",
    responseFormat: node.config.output.format === "json"
      ? {
          fields: node.config.output.fields.map(field => ({
            description: field.description,
            name: field.name,
            type: field.type,
          })),
          type: "json",
        }
      : { type: node.config.output.format },
  };
}

function llmNode(format: "json" | "markdown" | "text"): WorkflowExecutionNode {
  return {
    config: {
      inputs: [],
      modelId: "model-1",
      reasoningEffort: "medium",
      output: format === "json"
        ? {
            fields: [
              { description: "摘要", id: "field-summary", name: "summary", type: "string" },
              { description: "评分", id: "field-score", name: "score", type: "number" },
              { description: "是否通过", id: "field-approved", name: "approved", type: "boolean" },
            ],
            format,
          }
        : {
            field: { description: "", id: "output-text", name: "output", type: "string" },
            format,
          },
      systemPrompt: [{ type: "text", value: "Summarize" }],
      userPrompt: [],
    },
    id: "llm-1",
    kind: "llm",
    nodeSchemaVersion: 1,
  };
}

function aiIntentNode(): WorkflowExecutionNode {
  return {
    config: {
      fallback: { id: "fallback" },
      inputSelector: ["node", "query", "messages"],
      intents: [{ description: "咨询退款", id: "refund", modelCode: "I1" }],
    },
    id: "ai-intent-1",
    kind: "ai-intent",
    nodeSchemaVersion: 1,
  };
}

function aiIntentPayload(): WorkflowInferenceMessageListRequest {
  return {
    kind: "message-list",
    messageList: [{ content: [{ text: "Classify", type: "text" }], role: "system" }],
    modelTarget: { endpointId: "ep-20260227145914-nxcmn", kind: "endpoint" },
    reasoningEffort: "low",
    responseFormat: {
      fields: [
        { description: "Matched code", name: "matchedCode", type: "string" },
        { description: "Reason", name: "reason", type: "string" },
      ],
      type: "json",
    },
  };
}

function find(repository: InMemoryWorkflowLlmTestAttemptRepository, attemptId: string) {
  return repository.findLlmTestAttempt({ attemptId, uid: 9, workflowId: "31" });
}

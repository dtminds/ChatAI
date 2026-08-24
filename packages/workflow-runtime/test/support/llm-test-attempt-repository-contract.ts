import type { WorkflowExecutionNode } from "@chatai/contracts";
import { expect, it } from "vitest";
import {
  createWorkflowAiIntentInferenceRequest,
  type WorkflowLlmTestAttemptRepository,
} from "../../src/index.js";

const createdAt = new Date("2099-01-01T00:00:00.000Z");

export function runWorkflowLlmTestAttemptRepositoryContract(
  createRepository: () => WorkflowLlmTestAttemptRepository,
) {
  it("creates a fresh LLM test Attempt identity for every execution", async () => {
    const repository = createRepository();

    const first = await repository.createLlmTestAttempt(createInput("execution-1"));
    const second = await repository.createLlmTestAttempt(createInput("execution-2"));

    expect(first.id).not.toBe(second.id);
  });

  it("creates and reads an AI Intent test Attempt", async () => {
    const repository = createRepository();
    const node = aiIntentNode();
    const inputValue = [{
      id: 1,
      parts: [{ text: "退款什么时候到账？", type: "text" }],
      role: "customer",
    }];
    const input = createInput("ai-intent-execution", {
      inputValues: { inputValue },
      node,
      payload: createWorkflowAiIntentInferenceRequest(node, inputValue),
    });

    const created = await repository.createLlmTestAttempt(input);

    expect(created).toMatchObject({
      inputValues: input.inputValues,
      node: { id: "ai-intent-1", kind: "ai-intent" },
      payload: { modelTarget: { kind: "endpoint" } },
      status: "running",
    });
    await expect(repository.findLlmTestAttempt({ attemptId: created.id, uid: 9, workflowId: "31" }))
      .resolves.toMatchObject({ node: { kind: "ai-intent" } });
  });

  it("reclaims an expired LLM test Attempt lease without replacing the first start time", async () => {
    const repository = createRepository();
    const created = await repository.createLlmTestAttempt(createInput());
    const firstClaimAt = new Date("2099-01-01T00:00:01.000Z");
    await repository.claimLlmTestAttemptBatch({
      leaseExpiresAt: new Date("2099-01-01T00:00:02.000Z"),
      leaseOwner: "worker-1",
      limit: 1,
      now: firstClaimAt,
    });

    const reclaimed = await repository.claimLlmTestAttemptBatch({
      leaseExpiresAt: new Date("2099-01-01T00:00:04.000Z"),
      leaseOwner: "worker-2",
      limit: 1,
      now: new Date("2099-01-01T00:00:03.000Z"),
    });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({ attempt: 2, id: created.id, leaseOwner: "worker-2" });
    expect(reclaimed[0]?.startedAt).toEqual(firstClaimAt);
  });

  it("does not let a cancelled LLM test Attempt be completed by its old lease owner", async () => {
    const repository = createRepository();
    const created = await repository.createLlmTestAttempt(createInput());
    await repository.claimLlmTestAttemptBatch({
      leaseExpiresAt: new Date("2099-01-01T00:01:00.000Z"),
      leaseOwner: "worker-1",
      limit: 1,
      now: createdAt,
    });

    await expect(repository.cancelLlmTestAttempt({
      attemptId: created.id,
      cancelledAt: new Date("2099-01-01T00:00:01.000Z"),
      uid: 9,
      workflowId: "31",
    })).resolves.toBe(true);
    await expect(repository.completeLlmTestAttempt({
      attemptId: created.id,
      completedAt: new Date("2099-01-01T00:00:02.000Z"),
      leaseOwner: "worker-1",
      output: { "output-1": "late" },
      result: { content: "late", type: "text" },
    })).resolves.toBe(false);
    await expect(repository.findLlmTestAttempt({ attemptId: created.id, uid: 9, workflowId: "31" }))
      .resolves.toMatchObject({ output: null, status: "cancelled" });
  });

  it("marks expired LLM test executions timed out and removes TTL-expired data", async () => {
    const repository = createRepository();
    const created = await repository.createLlmTestAttempt(createInput());

    await expect(repository.expireTimedOutLlmTestAttempts({
      limit: 10,
      now: new Date("2099-01-01T00:10:00.000Z"),
    })).resolves.toBe(1);
    await expect(repository.findLlmTestAttempt({ attemptId: created.id, uid: 9, workflowId: "31" }))
      .resolves.toMatchObject({ status: "timed_out" });
    await expect(repository.cleanupExpiredLlmTestAttempts({
      limit: 10,
      now: new Date("2099-01-02T00:00:00.000Z"),
    })).resolves.toBe(1);
    await expect(repository.findLlmTestAttempt({ attemptId: created.id, uid: 9, workflowId: "31" }))
      .resolves.toBeNull();
  });

  it("expires one identified LLM test Attempt without touching another running Attempt", async () => {
    const repository = createRepository();
    const first = await repository.createLlmTestAttempt(createInput("execution-1"));
    const second = await repository.createLlmTestAttempt(createInput("execution-2"));
    const expiredAt = new Date("2099-01-01T00:10:00.000Z");

    await expect(repository.expireLlmTestAttempt({
      attemptId: first.id,
      now: expiredAt,
      uid: 9,
      workflowId: "31",
    })).resolves.toBe(true);
    await expect(repository.findLlmTestAttempt({ attemptId: first.id, uid: 9, workflowId: "31" }))
      .resolves.toMatchObject({ status: "timed_out" });
    await expect(repository.findLlmTestAttempt({ attemptId: second.id, uid: 9, workflowId: "31" }))
      .resolves.toMatchObject({ status: "running" });
  });
}

function createInput(
  executionKey = "execution-1",
  overrides: Partial<Parameters<WorkflowLlmTestAttemptRepository["createLlmTestAttempt"]>[0]> = {},
): Parameters<WorkflowLlmTestAttemptRepository["createLlmTestAttempt"]>[0] {
  return {
    contractVersion: 1,
    createdAt,
    deadlineAt: new Date("2099-01-01T00:05:00.000Z"),
    executionKey,
    expiresAt: new Date("2099-01-01T23:59:59.000Z"),
    inputValues: { "input-1": "退款什么时候到账" },
    node: llmNode(),
    opSubUserId: "17",
    payload: {
      kind: "message-list",
      messageList: [{
        content: [{ text: "Summarize", type: "text" }],
        role: "system",
      }],
      modelTarget: { kind: "catalog-model", modelId: "model-1" },
      reasoningEffort: "medium",
      responseFormat: { type: "text" },
    },
    uid: 9,
    workflowId: "31",
    ...overrides,
  };
}

function llmNode(): WorkflowExecutionNode {
  return {
    config: {
      inputs: [],
      modelId: "model-1",
      output: {
        field: { description: "", id: "output-1", name: "output", type: "string" },
        format: "text",
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
      inputSelector: ["trigger", "text"],
      intents: [{ description: "咨询退款", id: "intent-refund", modelCode: "I1" }],
    },
    id: "ai-intent-1",
    kind: "ai-intent",
    nodeSchemaVersion: 1,
  };
}

import type { WorkflowExecutionSpec } from "@chatai/contracts";
import {
  createWorkflowDeploymentCapabilities,
  WorkflowCapabilityExecutionError,
} from "@chatai/workflow-engine";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { processWorkflowInferenceBatch } from "../src/inference-worker.js";
import { FakeJavaInferenceAdapter } from "./support/fake-java-inference-adapter.js";

const now = new Date("2099-01-01T00:00:00.000Z");

describe("workflow inference worker", () => {
  it("completes a claimed job and wakes the waiting Workflow Task", async () => {
    const { job, repository, taskId } = await createWaitingJob();
    const result = await processWorkflowInferenceBatch({
      adapter: { execute: async request => {
        expect(request.contractVersion).toBe(1);
        expect(request.executionKey).toBe(job.executionKey);
        return { content: "summary", type: "text" };
      } },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository,
      retryDelayMs: 5_000,
    });

    expect(result).toEqual({ claimed: 1, failed: 0, retried: 0, succeeded: 1 });
    await expect(repository.findInferenceByExecutionKey(9, job.executionKey))
      .resolves.toMatchObject({ result: { content: "summary", type: "text" }, status: "succeeded" });
    await expect(repository.findTask(9, taskId)).resolves.toMatchObject({
      status: "dispatched",
      taskType: "execute",
    });
  });

  it("starts every claimed Java call before waiting for another one to finish", async () => {
    const first = await createWaitingJob("event-concurrent-1");
    const second = await createWaitingJob("event-concurrent-2", first.repository);
    const releases: Array<() => void> = [];
    let started = 0;
    const processing = processWorkflowInferenceBatch({
      adapter: { execute: async () => {
        started += 1;
        await new Promise<void>(resolve => releases.push(resolve));
        return { content: "summary", type: "text" };
      } },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 2,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository: first.repository,
      retryDelayMs: 5_000,
    });

    await vi.waitFor(() => expect(started).toBe(2));
    releases.forEach(release => release());
    await expect(processing).resolves.toEqual({
      claimed: 2,
      failed: 0,
      retried: 0,
      succeeded: 2,
    });
    await expect(first.repository.findTask(9, second.taskId))
      .resolves.toMatchObject({ status: "dispatched" });
  });

  it("schedules retryable failures and terminally fails malformed output", async () => {
    const retry = await createWaitingJob();
    await processWorkflowInferenceBatch({
      adapter: { execute: async () => {
        throw new WorkflowCapabilityExecutionError("retryable", "JAVA_BUSY", "推理服务繁忙");
      } },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository: retry.repository,
      retryDelayMs: 5_000,
    });
    await expect(retry.repository.findInferenceByExecutionKey(9, retry.job.executionKey))
      .resolves.toMatchObject({ errorCode: "JAVA_BUSY", status: "retry_wait" });

    const malformed = await createWaitingJob();
    const result = await processWorkflowInferenceBatch({
      adapter: { execute: async () => ({ bad: true }) as never },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository: malformed.repository,
      retryDelayMs: 5_000,
    });
    expect(result.failed).toBe(1);
    await expect(malformed.repository.findInferenceByExecutionKey(9, malformed.job.executionKey))
      .resolves.toMatchObject({ errorCode: "WORKFLOW_INFERENCE_OUTPUT_INVALID", status: "failed" });
  });

  it("rejects a valid result shape that belongs to the other inference request kind", async () => {
    const wrongKind = await createWaitingJob();
    await processWorkflowInferenceBatch({
      adapter: { execute: async () => ({ matchedCode: "fallback", reason: "wrong result kind" }) },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository: wrongKind.repository,
      retryDelayMs: 5_000,
    });

    await expect(wrongKind.repository.findInferenceByExecutionKey(9, wrongKind.job.executionKey))
      .resolves.toMatchObject({ errorCode: "WORKFLOW_INFERENCE_OUTPUT_INVALID", status: "failed" });
  });

  it("terminally fails a Java result above the 8 KiB node-output limit", async () => {
    const oversized = await createWaitingJob();
    const result = await processWorkflowInferenceBatch({
      adapter: { execute: async () => ({ content: "x".repeat(8 * 1024), type: "text" }) },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository: oversized.repository,
      retryDelayMs: 5_000,
    });

    expect(result).toMatchObject({ failed: 1, retried: 0, succeeded: 0 });
    await expect(oversized.repository.findInferenceByExecutionKey(9, oversized.job.executionKey))
      .resolves.toMatchObject({
        errorCode: "WORKFLOW_INFERENCE_OUTPUT_TOO_LARGE",
        failureKind: "terminal",
        status: "failed",
      });
  });

  it.each([
    {
      expectedNodeId: "end",
      expectedOutput: { "output-id": "客户询问退款进度" },
      javaResult: { content: "客户询问退款进度", type: "text" } as const,
      nodeKind: "llm" as const,
    },
    {
      expectedNodeId: "refund",
      expectedOutput: { matchedIntentDescription: "咨询退款", reason: "用户询问退款" },
      javaResult: { matchedCode: "I1", reason: "用户询问退款" } as const,
      nodeKind: "ai-intent" as const,
    },
  ])("resumes one $nodeKind Task after its durable Java job succeeds", async ({
    expectedNodeId,
    expectedOutput,
    javaResult,
    nodeKind,
  }) => {
    const spec = inferenceSpec(nodeKind);
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = new WorkflowRuntimeService(control(spec), repository, undefined, {
      clock: () => now,
      deploymentCapabilities: createWorkflowDeploymentCapabilities(spec.requiredCapabilities),
      entitlementPort: { check: async () => ({ entitled: true, unentitledSince: null }) },
    });
    const started = await service.startRun({
      entryEventId: `event-${nodeKind}`,
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { text: "退款什么时候到账" },
      uid: 9,
      workflowId: "31",
    });
    const startResult = await service.executeTask(taskInput(started.task, "start-message"));
    if (!("nextTask" in startResult) || !startResult.nextTask) {
      throw new Error("Inference Task was not created");
    }

    await expect(service.executeTask(taskInput(startResult.nextTask, "inference-message")))
      .resolves.toEqual({ kind: "inference-waiting", type: "inference-wait" });
    expect(repository.inferenceJobs).toHaveLength(1);
    const adapter = new FakeJavaInferenceAdapter(vi.fn(async () => javaResult));
    await processWorkflowInferenceBatch({
      adapter,
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 5,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository,
      retryDelayMs: 5_000,
    });
    const resumedTask = await repository.findTask(9, startResult.nextTask.id);
    if (!resumedTask) throw new Error("Inference Task was not resumed");

    const resumed = await service.executeTask(taskInput(resumedTask, "resume-message"));
    expect(resumed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: expectedNodeId },
    });
    await expect(repository.findRun(9, started.run.id)).resolves.toMatchObject({
      context: { outputs: { inference: expectedOutput } },
    });
    expect(repository.inferenceJobs).toHaveLength(1);
    expect(adapter.calls).toHaveLength(1);
  });

  it("stops waiting at the Job deadline even when the Java adapter ignores abort", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const deadline = new Date(now.getTime() + 600_000);
      const waiting = await createWaitingJob();
      const processing = processWorkflowInferenceBatch({
        adapter: { execute: async () => new Promise<never>(() => {}) },
        heartbeatIntervalMs: 15_000,
        leaseDurationMs: 60_000,
        leaseOwner: "inference-worker-1",
        limit: 1,
        maxAttempts: 5,
        maxRetryDelayMs: 60_000,
        now: () => new Date(),
        repository: waiting.repository,
        retryDelayMs: 5_000,
      });

      await vi.advanceTimersByTimeAsync(deadline.getTime() - now.getTime());
      await expect(processing).resolves.toMatchObject({ failed: 1, succeeded: 0 });
      await expect(waiting.repository.findInferenceByExecutionKey(9, waiting.job.executionKey))
        .resolves.toMatchObject({
          errorCode: "WORKFLOW_INFERENCE_DEADLINE_EXCEEDED",
          status: "failed",
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails a resumed Task once after the Java job reaches a terminal state", async () => {
    const spec = inferenceSpec("llm");
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = new WorkflowRuntimeService(control(spec), repository, undefined, {
      clock: () => now,
      deploymentCapabilities: createWorkflowDeploymentCapabilities(spec.requiredCapabilities),
      entitlementPort: { check: async () => ({ entitled: true, unentitledSince: null }) },
      maxTaskAttempts: 5,
    });
    const started = await service.startRun({
      entryEventId: "event-failed-inference",
      expectedRevision: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      trigger: { text: "退款什么时候到账" },
      uid: 9,
      workflowId: "31",
    });
    const startResult = await service.executeTask(taskInput(started.task, "start-message"));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Inference Task missing");
    await service.executeTask(taskInput(startResult.nextTask, "inference-message"));
    await processWorkflowInferenceBatch({
      adapter: { execute: async () => {
        throw new WorkflowCapabilityExecutionError("unknown", "JAVA_FAILED", "推理服务失败");
      } },
      heartbeatIntervalMs: 10_000,
      leaseDurationMs: 60_000,
      leaseOwner: "inference-worker-1",
      limit: 10,
      maxAttempts: 1,
      maxRetryDelayMs: 60_000,
      now: () => now,
      repository,
      retryDelayMs: 5_000,
    });
    const resumedTask = await repository.findTask(9, startResult.nextTask.id);
    if (!resumedTask) throw new Error("Failed Inference Task was not resumed");
    expect(resumedTask).toMatchObject({ status: "dispatched", taskType: "execute" });
    expect(repository.inferenceJobs).toEqual([
      expect.objectContaining({ errorCode: "JAVA_FAILED", status: "failed" }),
    ]);

    await expect(service.executeTask(taskInput(resumedTask, "failed-resume-message")))
      .resolves.toMatchObject({ errorCode: "JAVA_FAILED", failureKind: "terminal", kind: "failed" });
    await expect(repository.findRun(9, started.run.id)).resolves.toMatchObject({ status: "failed" });
  });
});

async function createWaitingJob(
  entryEventId = "event-1",
  repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now),
) {
  const created = await repository.createRunWithInitialTask({
    context: { trigger: { text: "hello" } },
    entryEventId,
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
    initialNodeId: "llm-1",
    initialNodeKind: "llm",
    occurredAt: now,
    revision: 1,
    shardId: 1,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    uid: 9,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
  if (created.kind !== "success") throw new Error("Expected Run creation");
  const claimed = await repository.claimTask({
    expectedTaskVersion: created.task.taskVersion,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    leaseOwner: "task-worker-1",
    taskId: created.task.id,
    uid: 9,
  });
  if (claimed.kind !== "success") throw new Error("Expected Task claim");
  const waiting = await repository.beginInference({
    contractVersion: 1,
    deadlineAt: new Date(now.getTime() + 600_000),
    executionKey: `9:${created.run.id}:llm-1:1`,
    expectedRunLockVersion: created.run.lockVersion,
    expectedTaskVersion: claimed.task.taskVersion,
    inbox: {
      consumer: "workflow-task",
      expiresAt: new Date(now.getTime() + 86_400_000),
      messageId: `inference:${created.task.id}`,
    },
    now,
    payload: {
      kind: "message-list",
      messageList: [{ content: "Summarize", role: "system" }],
      modelId: "model-1",
      responseFormat: { type: "text" },
    },
    runId: created.run.id,
    taskId: created.task.id,
    uid: 9,
  });
  if (waiting.kind !== "success") throw new Error("Expected Inference wait");
  return { job: waiting.job, repository, taskId: created.task.id };
}

function inferenceSpec(nodeKind: "ai-intent" | "llm"): WorkflowExecutionSpec {
  const inferenceCapability = nodeKind === "llm"
    ? { capabilityKey: "operation.llm.generate", contractVersion: 1 as const }
    : { capabilityKey: "operation.intent.classify", contractVersion: 1 as const };
  const inferenceNode = nodeKind === "llm"
    ? {
        config: {
          inputs: [{
            id: "input-message",
            name: "message",
            value: {
              kind: "variable" as const,
              selector: ["trigger", "text"],
              valueType: { kind: "string" as const },
            },
          }],
          modelId: "model-1",
          output: {
            field: { description: "", id: "output-id", name: "output", type: "string" as const },
            format: "text" as const,
          },
          systemPrompt: [{ type: "text" as const, value: "总结用户问题" }],
          userPrompt: [{ selector: ["input", "input-message"], type: "variable" as const }],
        },
        id: "inference",
        kind: nodeKind,
        nodeSchemaVersion: 1,
        requiredCapabilities: [inferenceCapability],
      }
    : {
        config: {
          fallback: { id: "fallback" as const },
          inputSelector: ["trigger", "text"],
          intents: [
            { description: "咨询退款", id: "refund-id", modelCode: "I1" },
            { description: "咨询物流", id: "logistics-id", modelCode: "I2" },
          ],
        },
        id: "inference",
        kind: nodeKind,
        nodeSchemaVersion: 1,
        requiredCapabilities: [inferenceCapability],
      };
  return {
    edges: [
      { id: "start-inference", source: "start", sourceOutletId: "default", target: "inference" },
      ...(nodeKind === "llm"
        ? [{ id: "inference-end", source: "inference", sourceOutletId: "default", target: "end" }]
        : [
            { id: "inference-refund", source: "inference", sourceOutletId: "intent:refund-id", target: "refund" },
            { id: "inference-fallback", source: "inference", sourceOutletId: "fallback", target: "end" },
          ]),
    ],
    entryNodeId: "start",
    nodes: [
      {
        config: {
          entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
          seatIds: [101],
          triggers: [{ sourceIds: [], type: "contact.friend_added" }],
        },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [{ capabilityKey: "event.contact.friend_added", contractVersion: 1 }],
      },
      inferenceNode,
      { config: {}, id: "refund", kind: "end", nodeSchemaVersion: 1, requiredCapabilities: [] },
      { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1, requiredCapabilities: [] },
    ],
    requiredCapabilities: [
      { capabilityKey: "event.contact.friend_added", contractVersion: 1 },
      inferenceCapability,
    ],
    revision: 1,
    schemaVersion: 2,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

function control(spec: WorkflowExecutionSpec) {
  return {
    applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
    findDefinition: vi.fn(async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: "chatai_sop" as const,
    })),
    findRevision: vi.fn(async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    })),
  };
}

function taskInput(
  task: { id: string; taskVersion: number },
  messageId: string,
) {
  return {
    messageId,
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "task-worker-1",
  };
}

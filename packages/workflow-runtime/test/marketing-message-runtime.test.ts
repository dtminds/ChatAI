import type { WorkflowExecutionNode, WorkflowExecutionSpec } from "@chatai/contracts";
import { WorkflowCapabilityExecutionError } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowContactIdentityPort,
  type WorkflowMarketingMessagePort,
} from "../src/index.js";

const ENTERED_AT = new Date("2026-09-13T01:00:00.000Z");

class MarketingMessageTestRuntimeService extends WorkflowRuntimeService {
  protected override assertNodeExecutable(node: WorkflowExecutionNode) {
    if (node.kind === "marketing-message") return;
    super.assertNodeExecutable(node);
  }
}

describe("Marketing Message runtime", () => {
  it("pushes once and advances immediately without querying in no-wait mode", async () => {
    const harness = await createHarness({ wait: { mode: "none" } });

    const completed = await harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT));

    expect(completed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
      run: { context: { outputs: { marketing: { pushSuccess: true } } } },
    });
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.queryPushResult).not.toHaveBeenCalled();
    expect(harness.runtime.nodeExecutions[0]).toMatchObject({
      input: { marketingMessage: { bizId: Number(harness.created.task.id) } },
      output: { pushSuccess: true },
      status: "completed",
    });
  });

  it.each([true, false])("pushes once, waits, queries once, and advances with pushSuccess=%s", async (pushSuccess) => {
    const harness = await createHarness({ pushSuccess });

    const waiting = await harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT));

    expect(waiting).toMatchObject({
      kind: "waiting",
      task: {
        dueAt: new Date("2026-09-13T01:30:00.000Z"),
        status: "pending",
        taskType: "marketing-message",
      },
    });
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.pushUser).toHaveBeenCalledWith({
      bizId: Number(harness.created.task.id),
      externalUserId: 3166,
      idempotencyKey: `9:${harness.created.run.id}:marketing:1`,
      planId: 701,
      signal: expect.any(AbortSignal),
      uid: 9,
    });
    expect(harness.queryPushResult).not.toHaveBeenCalled();

    const completed = await dispatchAndExecute(harness, new Date("2026-09-13T01:30:00.000Z"));

    expect(completed).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "end" },
      run: { context: { outputs: { marketing: { pushSuccess } } } },
    });
    expect(harness.getContactIdentity).toHaveBeenCalledOnce();
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.queryPushResult).toHaveBeenCalledOnce();
    expect(harness.queryPushResult).toHaveBeenCalledWith({
      bizId: Number(harness.created.task.id),
      signal: expect.any(AbortSignal),
      uid: 9,
    });
    expect(harness.runtime.nodeExecutions[0]).toMatchObject({
      input: {
        marketingMessage: {
          bizId: Number(harness.created.task.id),
          dueAt: "2026-09-13T01:30:00.000Z",
        },
      },
      output: { pushSuccess },
      status: "completed",
    });
  });

  it("uses the WeCom subject ID directly without an identity lookup", async () => {
    const harness = await createHarness({
      subjectId: "3166",
      subjectType: "wecom_contact",
      workflowType: "wecom_sop",
    });

    await expect(harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT)))
      .resolves.toMatchObject({ kind: "waiting" });
    expect(harness.getContactIdentity).not.toHaveBeenCalled();
    expect(harness.pushUser).toHaveBeenCalledWith(expect.objectContaining({ externalUserId: 3166 }));
  });

  it("terminates before push when externalUserId cannot be resolved", async () => {
    const harness = await createHarness({ identity: {} });

    await expect(harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT)))
      .resolves.toMatchObject({
        errorCode: "WORKFLOW_MARKETING_MESSAGE_IDENTITY_INVALID",
        failureKind: "terminal",
        kind: "failed",
      });
    expect(harness.pushUser).not.toHaveBeenCalled();
    expect(harness.queryPushResult).not.toHaveBeenCalled();
  });

  it("terminates when push fails", async () => {
    const harness = await createHarness({
      pushError: new WorkflowCapabilityExecutionError(
        "terminal",
        "WORKFLOW_MARKETING_MESSAGE_REJECTED",
        "群发触达失败，流程已停止",
      ),
    });

    await expect(harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT)))
      .resolves.toMatchObject({
        errorCode: "WORKFLOW_MARKETING_MESSAGE_REJECTED",
        failureKind: "terminal",
        kind: "failed",
      });
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.queryPushResult).not.toHaveBeenCalled();
  });

  it("does not push again after the durable marker was saved before a worker crash", async () => {
    const harness = await createHarness({ wait: { mode: "fixed", duration: 1, unit: "hour" } });
    vi.spyOn(harness.runtime, "beginFixedWait").mockRejectedValueOnce(new Error("worker crashed"));

    await expect(harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT)))
      .rejects.toThrow("worker crashed");
    expect(harness.pushUser).toHaveBeenCalledOnce();

    const recoveredAt = new Date("2026-09-13T01:03:00.000Z");
    await harness.runtime.recoverExpiredLeases({ limit: 10, maxAttempts: 3, now: recoveredAt });
    const recovered = await harness.runtime.findTask(9, harness.created.task.id);
    if (!recovered) throw new Error("Marketing Message task is missing");

    await expect(harness.service.executeTask(taskInput(recovered, recoveredAt)))
      .resolves.toMatchObject({ kind: "waiting", task: { taskType: "marketing-message" } });
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.getContactIdentity).toHaveBeenCalledOnce();
  });

  it("fails closed for a corrupt durable marker instead of pushing again", async () => {
    const harness = await createHarness();
    const prepare = harness.runtime.prepareCapabilityExecution.bind(harness.runtime);
    vi.spyOn(harness.runtime, "prepareCapabilityExecution").mockImplementation(async (input) => {
      const result = await prepare(input);
      return result.kind === "success"
        ? {
            ...result,
            execution: {
              ...result.execution,
              input: { ...result.execution.input, marketingMessage: { bizId: "invalid" } },
            },
          }
        : result;
    });

    await expect(harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT)))
      .resolves.toMatchObject({
        errorCode: "WORKFLOW_MARKETING_MESSAGE_STATE_INVALID",
        failureKind: "terminal",
        kind: "failed",
      });
    expect(harness.pushUser).not.toHaveBeenCalled();
  });

  it("fails closed when a waiting task loses its durable marker", async () => {
    const harness = await createHarness();
    await harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT));
    const execution = harness.runtime.nodeExecutions[0];
    if (!execution) throw new Error("Marketing Message execution is missing");
    execution.input = {};

    const dueAt = new Date("2026-09-13T01:30:00.000Z");
    harness.setNow(dueAt);
    await harness.runtime.dispatchDueTasks({ limit: 10, now: dueAt });
    const task = await harness.runtime.findTask(9, harness.created.task.id);
    if (!task) throw new Error("Marketing Message task is missing");

    await expect(harness.service.executeTask(taskInput(task, dueAt))).resolves.toMatchObject({
      errorCode: "WORKFLOW_MARKETING_MESSAGE_STATE_MISSING",
      failureKind: "terminal",
      kind: "failed",
    });
    expect(harness.pushUser).toHaveBeenCalledOnce();
    expect(harness.queryPushResult).not.toHaveBeenCalled();
  });

  it("treats a timed-out push as terminal and does not schedule a retry", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const harness = await createHarness({
        capabilityTimeoutMs: 100,
        pushUser: async (input) => {
          signal = input.signal;
          return new Promise<void>(() => {});
        },
      });
      const execution = harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT));

      await vi.advanceTimersByTimeAsync(100);

      await expect(execution).resolves.toMatchObject({
        errorCode: "WORKFLOW_MARKETING_MESSAGE_OPERATION_TIMEOUT",
        failureKind: "terminal",
        kind: "failed",
      });
      expect(signal?.aborted).toBe(true);
      await expect(harness.runtime.findTask(9, harness.created.task.id)).resolves.toMatchObject({
        attempt: 1,
        status: "dead",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("queries once after the wait and terminates when that query times out", async () => {
    vi.useFakeTimers();
    try {
      const harness = await createHarness({
        capabilityTimeoutMs: 100,
        queryPushResult: async () => new Promise(() => {}),
      });
      await harness.service.executeTask(taskInput(harness.created.task, ENTERED_AT));

      const dueAt = new Date("2026-09-13T01:30:00.000Z");
      harness.setNow(dueAt);
      await harness.runtime.dispatchDueTasks({ limit: 10, now: dueAt });
      const task = await harness.runtime.findTask(9, harness.created.task.id);
      if (!task) throw new Error("Marketing Message task is missing");

      const execution = harness.service.executeTask(taskInput(task, dueAt));
      await vi.advanceTimersByTimeAsync(100);

      await expect(execution).resolves.toMatchObject({
        errorCode: "WORKFLOW_MARKETING_MESSAGE_OPERATION_TIMEOUT",
        failureKind: "terminal",
        kind: "failed",
      });
      expect(harness.queryPushResult).toHaveBeenCalledOnce();
      await expect(harness.runtime.findTask(9, task.id)).resolves.toMatchObject({ status: "dead" });
    } finally {
      vi.useRealTimers();
    }
  });
});

async function createHarness(options: {
  capabilityTimeoutMs?: number;
  identity?: { externalUserId?: number };
  pushError?: Error;
  pushSuccess?: boolean;
  pushUser?: WorkflowMarketingMessagePort["pushUser"];
  queryPushResult?: WorkflowMarketingMessagePort["queryPushResult"];
  subjectId?: string;
  subjectType?: "chatai_contact" | "wecom_contact";
  wait?: { mode: "fixed"; duration: number; unit: "hour" | "minute" } | { mode: "none" };
  workflowType?: "chatai_sop" | "wecom_sop";
} = {}) {
  let now = ENTERED_AT;
  const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
  const getContactIdentity = vi.fn<WorkflowContactIdentityPort["getContactIdentity"]>(
    async () => options.identity ?? { externalUserId: 3166 },
  );
  const pushUser = vi.fn<WorkflowMarketingMessagePort["pushUser"]>(
    options.pushUser ?? (async () => {
      if (options.pushError) throw options.pushError;
    }),
  );
  const queryPushResult = vi.fn<WorkflowMarketingMessagePort["queryPushResult"]>(
    options.queryPushResult ?? (async () => ({ pushSuccess: options.pushSuccess ?? true })),
  );
  const spec = executionSpec(options.wait);
  const subjectType = options.subjectType ?? "chatai_contact";
  const workflowType = options.workflowType ?? "chatai_sop";
  const service = new MarketingMessageTestRuntimeService(control(spec, subjectType, workflowType), runtime, undefined, {
    capabilityTimeoutMs: options.capabilityTimeoutMs,
    clock: () => now,
    contactIdentityPort: { getContactIdentity },
    entitlementPort: { check: async () => ({ activeRunLimit: 10_000, entitled: true }) },
    marketingMessagePort: { pushUser, queryPushResult },
  });
  const created = await runtime.createRunWithInitialTask({
    activeRunLimit: 10_000,
    context: { outputs: {}, trigger: {} },
    entryEventId: "entry-event-1",
    entryPolicy: { maxEntries: 10, mode: "lifetime_limit" },
    initialNodeId: "marketing",
    initialNodeKind: "marketing-message",
    occurredAt: ENTERED_AT,
    revision: 1,
    shardId: 7,
    subjectId: options.subjectId ?? "chatai-customer-1",
    subjectType,
    uid: 9,
    workflowId: "31",
    workflowType,
  });
  if (created.kind !== "success") throw new Error(`Expected run, received ${created.kind}`);
  return {
    created,
    getContactIdentity,
    pushUser,
    queryPushResult,
    runtime,
    service,
    setNow(value: Date) { now = value; },
  };
}

async function dispatchAndExecute(
  harness: Awaited<ReturnType<typeof createHarness>>,
  now: Date,
) {
  harness.setNow(now);
  await expect(harness.runtime.dispatchDueTasks({ limit: 10, now })).resolves.toMatchObject({
    dispatched: 1,
  });
  const task = await harness.runtime.findTask(9, harness.created.task.id);
  if (!task) throw new Error("Marketing Message task is missing");
  return harness.service.executeTask(taskInput(task, now));
}

function taskInput(task: { id: string; taskVersion: number }, now: Date) {
  return {
    messageId: `marketing-message:${task.taskVersion}`,
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  };
}

function control(
  spec: WorkflowExecutionSpec,
  subjectType: "chatai_contact" | "wecom_contact",
  workflowType: "chatai_sop" | "wecom_sop",
) {
  return {
    deactivateWorkflowForEntitlementLoss: async () => ({ affectedDefinitions: 0 }),
    findDefinition: async () => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType,
    }),
    findRevision: async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType,
      workflowType,
    }),
    findRuntimeSnapshots: async () => ({ invalidKeys: [], snapshots: [] }),
  };
}

function executionSpec(wait = { mode: "fixed" as const, duration: 30, unit: "minute" as const }): WorkflowExecutionSpec {
  return {
    edges: [{ id: "marketing-end", source: "marketing", sourceOutletId: "default", target: "end" }],
    entryNodeId: "marketing",
    nodes: [
      {
        config: {
          plan: { planId: 701, planName: "双十一触达" },
          wait,
        },
        id: "marketing",
        kind: "marketing-message",
        nodeSchemaVersion: 1,
      },
      { config: {}, id: "end", kind: "end", nodeSchemaVersion: 1 },
    ],
    revision: 1,
    schemaVersion: 3,
    terminalNodeId: "end",
    workflowId: "31",
  };
}

import type { WorkflowDraft, WorkflowExecutionSpec } from "@chatai/contracts";
import { compileWorkflowDraft } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowAiCollectConversationPort,
  type WorkflowConversationDirectivePort,
  type WorkflowRuntimeDefinitionRecord,
} from "../src/index.js";

const enteredAt = new Date("2026-08-30T01:00:00.000Z");

describe("AI Collect runtime", () => {
  it("completes from the initial input without activating Agent guidance or sending an opening message", async () => {
    const order: string[] = [];
    const harness = createHarness({
      inputSelector: ["trigger", "input"],
      onActivate: () => order.push("activate"),
      onBeginInference: () => order.push("inference"),
      onOpeningMessage: () => order.push("opening"),
      openingMessage: "请提供订单号",
    });
    const collectTask = await enterCollect(harness, { input: "订单号是 A100" });

    const initialResult = await harness.service.executeTask(taskInput(collectTask, enteredAt));
    expect(initialResult).toMatchObject({ kind: "inference-waiting" });
    expect(order).toEqual(["inference"]);
    expect(harness.runtime.inferenceJobs).toHaveLength(1);

    const job = await claimOnlyInference(harness.runtime, enteredAt);
    await harness.runtime.completeInference({
      completedAt: new Date(enteredAt.getTime() + 1_000),
      id: job.id,
      leaseOwner: "inference-worker",
      result: {
        type: "json",
        value: { F1_present: true, F1_value: "A100" },
      },
    });
    harness.setNow(new Date(enteredAt.getTime() + 1_000));
    const resumedTask = requireTask(harness.runtime, collectTask.id);
    const result = await harness.service.executeTask(taskInput(
      resumedTask,
      new Date(enteredAt.getTime() + 1_000),
    ));

    expect(result).toMatchObject({ kind: "success", nextTask: { nodeId: "end" } });
    expect(harness.directivePort.addOrUpdate).not.toHaveBeenCalled();
    expect(harness.directivePort.disable).not.toHaveBeenCalled();
    expect(harness.conversationPort.resolveConversation).not.toHaveBeenCalled();
    expect(harness.conversationPort.sendOpeningMessage).not.toHaveBeenCalled();
    const run = harness.runtime.runs[0];
    expect(run?.context.outputs).toMatchObject({ collect: { "field-order": "A100" } });
  });

  it("activates Agent guidance only after the initial input remains incomplete", async () => {
    const order: string[] = [];
    const harness = createHarness({
      fields: [
        {
          id: "field-order",
          instruction: "提取完整订单号",
          name: "订单号",
          type: "text",
        },
        {
          id: "field-address",
          instruction: "提取完整收货地址",
          name: "收货地址",
          type: "text",
        },
      ],
      inputSelector: ["trigger", "input"],
      onActivate: () => order.push("activate"),
      onBeginInference: () => order.push("inference"),
      onOpeningMessage: () => order.push("opening"),
      openingMessage: "请提供订单号",
    });
    const collectTask = await enterCollect(harness, { input: "我想查一下订单" });

    await expect(harness.service.executeTask(taskInput(collectTask, enteredAt)))
      .resolves.toMatchObject({ kind: "inference-waiting" });
    expect(order).toEqual(["inference"]);

    const job = await claimOnlyInference(harness.runtime, enteredAt);
    await harness.runtime.completeInference({
      completedAt: new Date(enteredAt.getTime() + 1_000),
      id: job.id,
      leaseOwner: "inference-worker",
      result: {
        type: "json",
        value: {
          F1_present: false,
          F1_value: "",
          F2_present: true,
          F2_value: "上海市浦东新区",
        },
      },
    });
    harness.setNow(new Date(enteredAt.getTime() + 1_000));
    const resumedTask = requireTask(harness.runtime, collectTask.id);

    await expect(harness.service.executeTask(taskInput(
      resumedTask,
      new Date(enteredAt.getTime() + 1_000),
    ))).resolves.toMatchObject({ kind: "inference-waiting" });

    expect(order).toEqual(["inference", "activate", "opening"]);
    expect(harness.directivePort.addOrUpdate).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.stringContaining("订单号"),
    }));
    expect(harness.directivePort.addOrUpdate).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.not.stringContaining("收货地址"),
    }));
    expect(requireTask(harness.runtime, collectTask.id)).toMatchObject({
      status: "pending",
      taskType: "ai-collect",
    });
  });

  it("updates Agent guidance after extraction reduces the remaining fields", async () => {
    const fields = [
      { id: "field-order", instruction: "提取完整订单号", name: "订单号", type: "text" as const },
      { id: "field-phone", instruction: "提取完整手机号", name: "手机号", type: "text" as const },
      { id: "field-address", instruction: "提取完整收货地址", name: "收货地址", type: "text" as const },
    ];
    const harness = createHarness({
      fields,
      readCustomerMessages: vi.fn(async () => ({
        cursor: { id: 101, timestamp: enteredAt.getTime() + 1_000 },
        hasMore: false,
        messages: [{
          id: 101,
          parts: [{ text: "订单号 A100，手机号 13800138000", type: "text" }],
          role: "customer",
        }],
      })),
    });
    const collectTask = await enterCollect(harness, {});

    await harness.service.executeTask(taskInput(collectTask, enteredAt));
    expect(harness.directivePort.addOrUpdate).toHaveBeenCalledTimes(1);
    const initialRequest = harness.directivePort.addOrUpdate.mock.calls[0]?.[0];
    expect(initialRequest?.payload).toEqual(expect.stringContaining("订单号"));
    expect(initialRequest?.payload).toEqual(expect.stringContaining("手机号"));
    expect(initialRequest?.payload).toEqual(expect.stringContaining("收货地址"));

    await harness.service.recordAiCollectDirectiveEvent(directiveEvent(collectTask.id, 1_000, 1));
    const extractionAt = new Date(enteredAt.getTime() + 31_000);
    harness.setNow(extractionAt);
    await harness.service.executeTask(taskInput(
      requireTask(harness.runtime, collectTask.id),
      extractionAt,
    ));
    const job = await claimOnlyInference(harness.runtime, extractionAt);
    await harness.runtime.completeInference({
      completedAt: new Date(extractionAt.getTime() + 1_000),
      id: job.id,
      leaseOwner: "inference-worker",
      result: {
        type: "json",
        value: {
          F1_present: true,
          F1_value: "A100",
          F2_present: true,
          F2_value: "13800138000",
          F3_present: false,
          F3_value: "",
        },
      },
    });

    const resumedAt = new Date(extractionAt.getTime() + 1_000);
    harness.setNow(resumedAt);
    await harness.service.executeTask(taskInput(
      requireTask(harness.runtime, collectTask.id),
      resumedAt,
    ));

    expect(harness.directivePort.addOrUpdate).toHaveBeenCalledTimes(2);
    const updatedRequest = harness.directivePort.addOrUpdate.mock.calls[1]?.[0];
    expect(updatedRequest).toMatchObject({
      bizId: initialRequest?.bizId,
      limitRound: 3,
    });
    expect(updatedRequest?.payload).not.toContain("订单号");
    expect(updatedRequest?.payload).not.toContain("手机号");
    expect(updatedRequest?.payload).toContain("收货地址");
    expect(harness.runtime.aiCollectStates[0]?.directivePayload).toBe(updatedRequest?.payload);
  });

  it("resets the quiet window and keeps callbacks queued behind one in-flight inference", async () => {
    const firstMessage = {
      id: 101,
      parts: [{ text: "订单号 A100", type: "text" as const }],
      role: "customer" as const,
    };
    const secondMessage = {
      id: 102,
      parts: [{ text: "地址是上海市", type: "text" as const }],
      role: "customer" as const,
    };
    const readCustomerMessages = vi.fn()
      .mockResolvedValueOnce({
        cursor: { id: 101, timestamp: enteredAt.getTime() + 9_000 },
        hasMore: false,
        messages: [firstMessage],
      })
      .mockResolvedValueOnce({
        cursor: { id: 102, timestamp: enteredAt.getTime() + 44_000 },
        hasMore: false,
        messages: [secondMessage],
      });
    const harness = createHarness({ readCustomerMessages });
    const collectTask = await enterCollect(harness, {});
    const waitResult = await harness.service.executeTask(taskInput(collectTask, enteredAt));
    expect(waitResult).toMatchObject({ kind: "inference-waiting" });
    expect(harness.runtime.aiCollectStates[0]?.directiveStatus).toBe("active");
    expect(requireTask(harness.runtime, collectTask.id).status).toBe("pending");

    await harness.service.recordAiCollectDirectiveEvent(directiveEvent(collectTask.id, 5_000, 1));
    await harness.service.recordAiCollectDirectiveEvent(directiveEvent(collectTask.id, 10_000, 2));
    let pendingTask = requireTask(harness.runtime, collectTask.id);
    expect(pendingTask.dueAt).toEqual(new Date(enteredAt.getTime() + 40_000));

    harness.setNow(new Date(enteredAt.getTime() + 40_000));
    await harness.service.executeTask(taskInput(
      pendingTask,
      new Date(enteredAt.getTime() + 40_000),
    ));
    expect(harness.runtime.inferenceJobs).toHaveLength(1);
    expect(readCustomerMessages).toHaveBeenNthCalledWith(1, expect.objectContaining({
      after: { id: 1, timestamp: enteredAt.getTime() - 1 },
      until: new Date(enteredAt.getTime() + 10_000),
    }));

    await harness.service.recordAiCollectDirectiveEvent(directiveEvent(collectTask.id, 45_000, 2));
    expect(harness.runtime.inferenceJobs).toHaveLength(1);
    const firstJob = await claimOnlyInference(
      harness.runtime,
      new Date(enteredAt.getTime() + 40_000),
    );
    await harness.runtime.completeInference({
      completedAt: new Date(enteredAt.getTime() + 46_000),
      id: firstJob.id,
      leaseOwner: "inference-worker",
      result: {
        type: "json",
        value: { F1_present: false, F1_value: "" },
      },
    });
    harness.setNow(new Date(enteredAt.getTime() + 46_000));
    pendingTask = requireTask(harness.runtime, collectTask.id);
    await harness.service.executeTask(taskInput(
      pendingTask,
      new Date(enteredAt.getTime() + 46_000),
    ));
    expect(harness.directivePort.addOrUpdate).toHaveBeenCalledTimes(1);
    expect(harness.runtime.inferenceJobs).toHaveLength(1);
    pendingTask = requireTask(harness.runtime, collectTask.id);
    expect(pendingTask.dueAt).toEqual(new Date(enteredAt.getTime() + 75_000));

    harness.setNow(new Date(enteredAt.getTime() + 75_000));
    await harness.service.executeTask(taskInput(
      pendingTask,
      new Date(enteredAt.getTime() + 75_000),
    ));
    expect(harness.runtime.inferenceJobs).toHaveLength(2);
    expect(readCustomerMessages).toHaveBeenNthCalledWith(2, expect.objectContaining({
      after: { id: 101, timestamp: enteredAt.getTime() + 9_000 },
      until: new Date(enteredAt.getTime() + 45_000),
    }));
  });

  it("queries customer messages at the absolute timeout even without a directive callback", async () => {
    const timeoutAt = new Date(enteredAt.getTime() + 3_600_000);
    const readCustomerMessages = vi.fn(async () => ({
      cursor: { id: 101, timestamp: timeoutAt.getTime() - 1_000 },
      hasMore: false,
      messages: [{
        id: 101,
        parts: [{ text: "订单号 A100", type: "text" as const }],
        role: "customer" as const,
      }],
    }));
    const harness = createHarness({ readCustomerMessages });
    const collectTask = await enterCollect(harness, {});

    await harness.service.executeTask(taskInput(collectTask, enteredAt));
    const waitingTask = requireTask(harness.runtime, collectTask.id);
    expect(waitingTask.dueAt).toEqual(timeoutAt);

    harness.setNow(timeoutAt);
    const result = await harness.service.executeTask(taskInput(waitingTask, timeoutAt));

    expect(result).toMatchObject({ kind: "inference-waiting" });
    expect(readCustomerMessages).toHaveBeenCalledWith(expect.objectContaining({
      after: { id: 1, timestamp: enteredAt.getTime() - 1 },
      until: timeoutAt,
    }));
    expect(harness.runtime.inferenceJobs).toHaveLength(1);

    const job = await claimOnlyInference(harness.runtime, timeoutAt);
    await harness.runtime.completeInference({
      completedAt: new Date(timeoutAt.getTime() + 1_000),
      id: job.id,
      leaseOwner: "inference-worker",
      result: {
        type: "json",
        value: { F1_present: false, F1_value: "" },
      },
    });
    harness.setNow(new Date(timeoutAt.getTime() + 1_000));
    const resumedTask = requireTask(harness.runtime, collectTask.id);

    await expect(harness.service.executeTask(taskInput(
      resumedTask,
      new Date(timeoutAt.getTime() + 1_000),
    ))).resolves.toMatchObject({ kind: "success", nextTask: { nodeId: "end" } });
    expect(harness.directivePort.disable).toHaveBeenCalledWith(expect.objectContaining({
      reason: "expired",
    }));
  });
});

function createHarness(options: {
  fields?: Array<{
    id: string;
    instruction: string;
    name: string;
    type: "text";
  }>;
  inputSelector?: string[];
  onActivate?: () => void;
  onBeginInference?: () => void;
  onOpeningMessage?: () => void;
  openingMessage?: string;
  readCustomerMessages?: WorkflowAiCollectConversationPort["readCustomerMessages"];
} = {}) {
  const spec = compileWorkflowDraft({
    draft: collectDraft(options.openingMessage, options.fields),
    revision: 1,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
  if (options.inputSelector) {
    const collect = spec.nodes.find(node => node.id === "collect");
    if (!collect || collect.kind !== "ai-collect") throw new Error("AI Collect node missing");
    collect.config = { ...collect.config, inputSelector: options.inputSelector } as typeof collect.config;
  }
  let now = enteredAt;
  const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
  if (options.onBeginInference) {
    const beginInference = runtime.beginInference.bind(runtime);
    vi.spyOn(runtime, "beginInference").mockImplementation(async (input) => {
      options.onBeginInference?.();
      return beginInference(input);
    });
  }
  const conversationPort: WorkflowAiCollectConversationPort = {
    readCustomerMessages: options.readCustomerMessages ?? (async () => ({
      cursor: null,
      hasMore: false,
      messages: [],
    })),
    resolveConversation: vi.fn(async () => ({ conversationId: 301 })),
    sendOpeningMessage: vi.fn(async () => options.onOpeningMessage?.()),
  };
  const directivePort: WorkflowConversationDirectivePort = {
    addOrUpdate: vi.fn(async () => options.onActivate?.()),
    disable: vi.fn(async () => {}),
  };
  const service = new WorkflowRuntimeService(control(spec), runtime, undefined, {
    aiCollectConversationPort: conversationPort,
    clock: () => now,
    conversationDirectivePort: directivePort,
    entitlementPort: { check: async () => ({ activeRunLimit: 10_000, entitled: true }) },
    inferenceTotalTimeoutMs: 600_000,
  });
  return {
    conversationPort,
    directivePort: directivePort as {
      addOrUpdate: ReturnType<typeof vi.fn>;
      disable: ReturnType<typeof vi.fn>;
    },
    runtime,
    service,
    setNow(value: Date) { now = value; },
  };
}

async function enterCollect(
  harness: ReturnType<typeof createHarness>,
  trigger: Record<string, unknown>,
) {
  const started = await harness.service.startRun({
    entryEventId: "event-1",
    expectedRevision: 1,
    subjectId: "customer-1",
    subjectType: "chatai_contact",
    trigger: { ...trigger, projection: { seatId: 101 } },
    uid: 9,
    workflowId: "31",
  });
  const startResult = await harness.service.executeTask(taskInput(started.task, enteredAt));
  if (!("nextTask" in startResult) || !startResult.nextTask) {
    throw new Error("AI Collect Task was not created");
  }
  return startResult.nextTask;
}

function directiveEvent(taskId: string, offsetMs: number, totalRound: number) {
  const now = new Date(enteredAt.getTime() + offsetMs);
  return {
    bizId: `workflow-task:${taskId}`,
    eventId: `directive-${offsetMs}`,
    eventOccurredAt: now,
    now,
    seatId: 101,
    thirdExternalUserId: "customer-1",
    totalRound,
    uid: 9,
  };
}

async function claimOnlyInference(
  runtime: InMemoryWorkflowRuntimeRepository,
  now: Date,
) {
  const jobs = await runtime.claimInferenceBatch({
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    leaseOwner: "inference-worker",
    limit: 10,
    now,
  });
  if (jobs.length !== 1) throw new Error(`Expected one inference job, received ${jobs.length}`);
  return jobs[0]!;
}

function requireTask(runtime: InMemoryWorkflowRuntimeRepository, taskId: string) {
  const task = runtime.tasks.find(candidate => candidate.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return structuredClone(task);
}

function taskInput(task: { id: string; taskVersion: number }, now: Date) {
  return { now, taskId: task.id, taskVersion: task.taskVersion, uid: 9, workerId: "worker-1" };
}

function control(spec: WorkflowExecutionSpec) {
  return {
    deactivateWorkflowForEntitlementLoss: async () => ({ affectedDefinitions: 0 }),
    findDefinition: async (): Promise<WorkflowRuntimeDefinitionRecord> => ({
      bizStatus: 1,
      publishedRevision: 1,
      runtimeStatus: "active",
      statusReason: null,
      workflowType: "chatai_sop",
    }),
    findRevision: async () => ({
      executionSpec: spec,
      revision: 1,
      subjectType: "chatai_contact" as const,
      workflowType: "chatai_sop" as const,
    }),
    findRuntimeSnapshots: async () => ({ invalidKeys: [], snapshots: [] }),
  };
}

function collectDraft(
  openingMessage = "",
  fields = [{
    id: "field-order",
    instruction: "提取完整订单号",
    name: "订单号",
    type: "text" as const,
  }],
): WorkflowDraft {
  return {
    edges: [
      { id: "start-collect", source: "start", target: "collect" },
      { id: "collect-completed", source: "collect", sourceHandle: "completed", target: "end" },
      { id: "collect-incomplete", source: "collect", sourceHandle: "incomplete", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("collect", "ai-collect", {
        fields,
        maxFollowUpCount: 3,
        openingMessage,
        timeout: { duration: 1, unit: "hour" },
      }),
      node("end", "end"),
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function node(id: string, kind: string, config: Record<string, unknown> = {}) {
  return {
    data: {
      ...config,
      kind,
      label: kind,
      metric: "",
      schemaVersion: 1,
      status: "ready" as const,
      title: kind,
    },
    id,
    position: { x: 0, y: 0 },
    type: "workflowNode",
  };
}

import type {
  WorkflowBranchCondition,
  WorkflowBranchConditionValue,
  WorkflowBranchLogic,
  WorkflowBranchPath,
  WorkflowBranchValueType,
  WorkflowDraft,
} from "@chatai/contracts";
import { compileWorkflowDraft } from "@chatai/workflow-engine";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
} from "../src/index.js";

const enteredAt = new Date("2026-08-10T00:00:00.000Z");
const branchOperatorCases: Array<{
  condition: WorkflowBranchCondition;
  label: string;
  triggerValue: unknown;
}> = [
  branchCase("equals-string", "equals", "string", "vip", "vip"),
  branchCase("not-equals", "not-equals", "string", "vip", "other"),
  branchCase("contains", "contains", "string", "tag", "contact.tag_added"),
  branchCase("not-contains", "not-contains", "string", "tag", "contact.friend_added"),
  branchCase("starts-with", "starts-with", "string", "contact", "contact.tag_added"),
  branchCase("ends-with", "ends-with", "string", "added", "contact.tag_added"),
  branchCase("greater-than", "greater-than", "number", 8, 9),
  branchCase("greater-than-or-equal", "greater-than-or-equal", "number", 8, 8),
  branchCase("less-than", "less-than", "number", 8, 7),
  branchCase("less-than-or-equal", "less-than-or-equal", "number", 8, 8),
  branchCase("is-true", "is-true", "boolean", undefined, true),
  branchCase("is-false", "is-false", "boolean", undefined, false),
  branchCase("is-empty-string", "is-empty", "string", undefined, ""),
  branchCase("is-not-empty-string", "is-not-empty", "string", undefined, "configured"),
  branchCase("is-empty-message-list", "is-empty", "message-id-list", undefined, []),
  branchCase("is-not-empty-message-list", "is-not-empty", "message-id-list", undefined, [101]),
  branchCase(
    "datetime-before",
    "datetime-before",
    "datetime",
    "2026-08-10T10:00",
    "2026-08-10T09:00:00+08:00",
  ),
  branchCase(
    "datetime-before-or-equal",
    "datetime-before-or-equal",
    "datetime",
    "2026-08-10T10:00",
    "2026-08-10T02:00:00.000Z",
  ),
  branchCase(
    "datetime-after",
    "datetime-after",
    "datetime",
    "2026-08-10T10:00",
    "2026-08-10T11:00:00+08:00",
  ),
  branchCase(
    "datetime-after-or-equal",
    "datetime-after-or-equal",
    "datetime",
    "2026-08-10T10:00",
    "2026-08-10T10:00:00+08:00",
  ),
  branchCase(
    "datetime-equals",
    "equals",
    "datetime",
    "2026-08-10T10:00",
    "2026-08-10T02:00:00.000Z",
  ),
  branchCase(
    "datetime-between",
    "datetime-between",
    "datetime",
    ["2026-08-10T10:00", "2026-08-10T11:00"],
    "2026-08-10T10:30:00+08:00",
  ),
];

describe("Branch runtime", () => {
  it("routes from compiled selectors after lease recovery and keeps Branch routing-only", async () => {
    const spec = compileWorkflowDraft({
      draft: branchDraft(),
      revision: 1,
      workflowId: "31",
      workflowType: "chatai_sop",
    });
    const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => enteredAt);
    let runtimeNow = enteredAt;
    const service = new WorkflowRuntimeService(control(spec), runtime, undefined, {
      clock: () => runtimeNow,
      entitlementPort: { check: async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null }) },
    });
    const started = await service.startRun({
      entryEventId: "event-1",
      expectedRevision: 1,
      subjectId: "contact-1",
      subjectType: "chatai_contact",
      trigger: { eventType: "contact.friend_added", occurredAt: enteredAt.toISOString() },
      uid: 9,
      workflowId: "31",
    });

    const startResult = await service.executeTask(taskInput(started.task));
    if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Wait task missing");
    const waitResult = await completeFixedWait(
      service,
      startResult.nextTask,
      (value) => {
        runtimeNow = value;
      },
    );
    if (!("nextTask" in waitResult) || !waitResult.nextTask) throw new Error("Branch task missing");

    const branchTask = waitResult.nextTask;
    const claimed = await runtime.claimTask({
      expectedTaskVersion: branchTask.taskVersion,
      leaseExpiresAt: new Date("2026-08-10T00:01:01.000Z"),
      leaseOwner: "crashed-worker",
      taskId: branchTask.id,
      uid: 9,
    });
    expect(claimed.kind).toBe("success");
    await runtime.recoverExpiredLeases({
      limit: 10,
      maxAttempts: 3,
      now: new Date("2026-08-10T00:02:00.000Z"),
    });
    const recovered = await runtime.findTask(9, branchTask.id);
    if (!recovered) throw new Error("Recovered Branch task missing");

    runtimeNow = new Date("2026-08-10T00:02:00.000Z");
    const branchResult = await service.executeTask(taskInput(recovered, runtimeNow));
    expect(branchResult).toMatchObject({
      kind: "success",
      nextTask: { nodeId: "matched" },
    });
    const run = await runtime.findRun(9, started.run.id);
    expect(run?.context).toMatchObject({
      outputs: { branch: {}, start: {}, wait: { dueAt: "2026-08-10T00:01:00.000Z" } },
    });
    expect(run?.context).not.toHaveProperty("branchMatches");
  });

  it.each(branchOperatorCases)(
    "routes a real compiled Draft through Runtime for $label",
    async ({ condition, triggerValue }) => {
      await expect(executeBranch(branchDraft([branchPath(condition)]), { value: triggerValue }))
        .resolves.toBe("matched");
    },
  );

  it.each(["all", "any"] as const)(
    "evaluates the %s relation in Runtime",
    async (logic) => {
      const conditions: WorkflowBranchCondition[] = [
        conditionFor("first", "equals", "string", "yes"),
        conditionFor("second", "equals", "string", "yes"),
      ];
      const trigger = logic === "all"
        ? { first: "yes", second: "yes" }
        : { first: "yes", second: "no" };

      await expect(executeBranch(branchDraft([branchPath(conditions, logic)]), trigger))
        .resolves.toBe("matched");
    },
  );

  it("routes an unavailable selector to the compiled default path", async () => {
    await expect(executeBranch(branchDraft([branchPath({
      id: "missing-selector",
      operator: "equals",
      selector: ["node", "missing", "value"],
      value: "present",
      valueType: "string",
    })]), {})).resolves.toBe("fallback");
  });
});

function branchCase(
  label: string,
  operator: WorkflowBranchCondition["operator"],
  valueType: WorkflowBranchValueType,
  value: WorkflowBranchConditionValue | undefined,
  triggerValue: unknown,
) {
  return {
    condition: {
      id: `condition-${label}`,
      operator,
      selector: ["trigger", "value"],
      ...(value === undefined ? {} : { value }),
      valueType,
    },
    label,
    triggerValue,
  };
}

function branchPath(
  conditions: WorkflowBranchCondition | WorkflowBranchCondition[],
  logic: WorkflowBranchLogic = "all",
): WorkflowBranchPath {
  return {
    conditions: Array.isArray(conditions) ? conditions : [conditions],
    id: "matched",
    label: "如果",
    logic,
  };
}

function conditionFor(
  key: string,
  operator: WorkflowBranchCondition["operator"],
  valueType: WorkflowBranchValueType,
  value: WorkflowBranchConditionValue,
): WorkflowBranchCondition {
  return {
    id: `condition-${key}`,
    operator,
    selector: ["trigger", key],
    value,
    valueType,
  };
}

async function executeBranch(
  draft: WorkflowDraft,
  trigger: Record<string, unknown>,
) {
  const spec = compileWorkflowDraft({
    draft,
    revision: 1,
    workflowId: "31",
    workflowType: "chatai_sop",
  });
  const runtime = new InMemoryWorkflowRuntimeRepository(undefined, () => enteredAt);
  let runtimeNow = enteredAt;
  const service = new WorkflowRuntimeService(control(spec), runtime, undefined, {
    clock: () => runtimeNow,
    entitlementPort: { check: async () => ({ activeRunLimit: 10_000, entitled: true, unentitledSince: null }) },
  });
  const started = await service.startRun({
    entryEventId: "event-1",
    expectedRevision: 1,
    subjectId: "contact-1",
    subjectType: "chatai_contact",
    trigger: {
      eventType: "contact.friend_added",
      occurredAt: enteredAt.toISOString(),
      ...trigger,
    },
    uid: 9,
    workflowId: "31",
  });

  const startResult = await service.executeTask(taskInput(started.task));
  if (!("nextTask" in startResult) || !startResult.nextTask) throw new Error("Wait task missing");
  const waitResult = await completeFixedWait(
    service,
    startResult.nextTask,
    (value) => {
      runtimeNow = value;
    },
  );
  if (!("nextTask" in waitResult) || !waitResult.nextTask) throw new Error("Branch task missing");
  const branchResult = await service.executeTask(taskInput(waitResult.nextTask));
  if (!("nextTask" in branchResult)) throw new Error("Branch result missing");
  return branchResult.nextTask?.nodeId ?? null;
}

function control(spec: ReturnType<typeof compileWorkflowDraft>) {
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
    findRuntimeSnapshots: vi.fn(async () => ({ invalidKeys: [], snapshots: [] })),
  };
}

function taskInput(task: { id: string; taskVersion: number }, now = enteredAt) {
  return {
    now,
    taskId: task.id,
    taskVersion: task.taskVersion,
    uid: 9,
    workerId: "worker-1",
  };
}

async function completeFixedWait(
  service: WorkflowRuntimeService,
  task: { id: string; taskVersion: number },
  setClock: (now: Date) => void = () => undefined,
) {
  const waiting = await service.executeTask(taskInput(task));
  if (!("kind" in waiting) || waiting.kind !== "waiting") throw new Error("Wait did not start");
  const completedAt = new Date(enteredAt.getTime() + 60_000);
  setClock(completedAt);
  return service.executeTask(taskInput(
    waiting.task,
    completedAt,
  ));
}

function branchDraft(
  conditionalPaths: WorkflowBranchPath[] = [branchPath({
    id: "condition-1",
    operator: "equals",
    selector: ["node-lifecycle", "wait", "exitedAt"],
    value: "2026-08-10T08:01",
    valueType: "datetime",
  })],
): WorkflowDraft {
  return {
    edges: [
      { id: "start-wait", source: "start", target: "wait" },
      { id: "wait-branch", source: "wait", target: "branch" },
      { id: "branch-matched", source: "branch", sourceHandle: "matched", target: "matched" },
      { id: "branch-default", source: "branch", sourceHandle: "default", target: "fallback" },
      { id: "matched-end", source: "matched", target: "end" },
      { id: "fallback-end", source: "fallback", target: "end" },
    ],
    nodes: [
      node("start", "start", {
        entryPolicy: { mode: "never" },
        seatIds: [101],
        triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
      }),
      node("wait", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("branch", "branch", {
        branchPaths: [
          ...conditionalPaths,
          { conditions: [], id: "default", isDefault: true, label: "否则", logic: "all" },
        ],
      }),
      node("matched", "wait", { duration: 1, mode: "duration", unit: "minute" }),
      node("fallback", "wait", { duration: 1, mode: "duration", unit: "minute" }),
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

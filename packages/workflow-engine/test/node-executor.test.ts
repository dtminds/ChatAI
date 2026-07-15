import { describe, expect, it, vi } from "vitest";
import {
  createCoreNodeExecutorRegistry,
  type WorkflowNodeExecutionContext,
} from "../src/index.js";

describe("core node executors", () => {
  const registry = createCoreNodeExecutorRegistry();

  it("advances start and completes end", async () => {
    await expect(registry.execute(node("start"), context())).resolves.toEqual({
      output: {},
      sourceOutletId: "default",
      type: "advance",
    });
    await expect(registry.execute(node("end"), context())).resolves.toEqual({
      output: {},
      type: "complete",
    });
  });

  it("persists wait as an absolute due time", async () => {
    await expect(registry.execute(node("wait", {
      duration: 2,
      mode: "duration",
      unit: "day",
    }), context()))
      .resolves.toEqual({
        dueAt: "2026-07-12T00:00:00.000Z",
        output: { dueAt: "2026-07-12T00:00:00.000Z" },
        type: "wait",
      });

    await expect(registry.execute(node("wait", {
      duration: 90,
      mode: "duration",
      unit: "minute",
    }), context()))
      .resolves.toMatchObject({ dueAt: "2026-07-10T01:30:00.000Z" });
  });

  it("rejects regular waits above the selected unit limit", async () => {
    await expect(registry.execute(node("wait", {
      duration: 361,
      mode: "duration",
      unit: "minute",
    }), context())).rejects.toThrow("duration exceeds the supported unit limit");
    await expect(registry.execute(node("wait", {
      duration: 97,
      mode: "duration",
      unit: "hour",
    }), context())).rejects.toThrow("duration exceeds the supported unit limit");
    await expect(registry.execute(node("wait", {
      duration: 46,
      mode: "duration",
      unit: "day",
    }), context())).rejects.toThrow("duration exceeds the supported unit limit");
  });

  it("resumes fixed-time waits on the configured local day and time", async () => {
    const expectedDueAt = new Date(2025, 2, 26, 9, 0, 0).toISOString();
    const fixedTimeNode = node("wait", {
      dayOffset: 1,
      mode: "fixed-time",
      time: "09:00",
    });

    await expect(registry.execute(fixedTimeNode, context({
      now: new Date(2025, 2, 25, 9, 30, 0),
    }))).resolves.toEqual({
      dueAt: expectedDueAt,
      output: { dueAt: expectedDueAt },
      type: "wait",
    });
    await expect(registry.execute(fixedTimeNode, context({
      now: new Date(2025, 2, 25, 23, 59, 0),
    }))).resolves.toEqual({
      dueAt: expectedDueAt,
      output: { dueAt: expectedDueAt },
      type: "wait",
    });
  });

  it("selects the first matching branch and falls back to default", async () => {
    const branch = node("branch", {
      branchPaths: [
        { id: "vip", isDefault: false },
        { id: "returning", isDefault: false },
        { id: "else", isDefault: true },
      ],
    });

    await expect(registry.execute(branch, context({ matchingPathIds: new Set(["returning"]) })))
      .resolves.toEqual({ output: {}, sourceOutletId: "returning", type: "advance" });
    await expect(registry.execute(branch, context()))
      .resolves.toEqual({ output: {}, sourceOutletId: "else", type: "advance" });
  });

  it("requires deadline metadata before executing an action", async () => {
    const executeAction = vi.fn(async () => ({}));

    await expect(registry.execute(node("message"), context({
      actionIdempotencyKey: "8:1:message:1",
      executeAction,
    }))).rejects.toThrow("Action deadline is not configured: message");
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("forwards action execution metadata to the adapter", async () => {
    const controller = new AbortController();
    const deadlineAt = new Date("2026-07-10T00:00:15.000Z");
    const executeAction = vi.fn(async () => ({ messageId: "downstream-1" }));
    const actionNode = node("message");
    const executionContext = context({
      actionDeadlineAt: deadlineAt,
      actionIdempotencyKey: "8:1:message:1",
      actionSignal: controller.signal,
      executeAction,
    });

    await expect(registry.execute(actionNode, executionContext)).resolves.toMatchObject({
      output: { messageId: "downstream-1" },
      type: "advance",
    });
    expect(executeAction).toHaveBeenCalledWith({
      context: executionContext,
      deadlineAt,
      idempotencyKey: "8:1:message:1",
      node: actionNode,
      signal: controller.signal,
    });
  });
});

function node(kind: "branch" | "end" | "message" | "start" | "wait", config: Record<string, unknown> = {}) {
  return { config, id: kind, kind, nodeSchemaVersion: 1 };
}

function context(
  overrides: Partial<WorkflowNodeExecutionContext> = {},
): WorkflowNodeExecutionContext {
  return {
    evaluateBranchPath: ({ id }) => overrides.matchingPathIds?.has(id) ?? false,
    matchingPathIds: new Set<string>(),
    now: new Date("2026-07-10T00:00:00.000Z"),
    outputs: {},
    run: { id: "1", revision: 1, sequence: 1, subjectId: "customer-1", uid: "8" },
    trigger: {},
    ...overrides,
  };
}

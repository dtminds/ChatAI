import { describe, expect, it } from "vitest";
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
    await expect(registry.execute(node("wait", { delayDays: 2 }), context()))
      .resolves.toEqual({
        dueAt: "2026-07-12T00:00:00.000Z",
        output: { dueAt: "2026-07-12T00:00:00.000Z" },
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
      .resolves.toMatchObject({ sourceOutletId: "returning", type: "advance" });
    await expect(registry.execute(branch, context()))
      .resolves.toMatchObject({ sourceOutletId: "else", type: "advance" });
  });
});

function node(kind: "branch" | "end" | "start" | "wait", config: Record<string, unknown> = {}) {
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

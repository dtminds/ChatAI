import { describe, expect, it } from "vitest";
import { createWorkflowMessageQueryCommand } from "../src/index.js";

describe("Workflow Message Query binding", () => {
  it("resolves the default dynamic range and seat identity", () => {
    expect(createWorkflowMessageQueryCommand({
      config: {
        limit: 10,
        take: "latest",
        timeRange: {
          end: { field: "enteredAt", kind: "current-node-lifecycle" },
          mode: "dynamic",
          start: { field: "occurredAt", kind: "workflow-trigger" },
        },
      },
      context: context(),
    })).toEqual({
      limit: 10,
      rangeEnd: Date.parse("2026-08-15T02:00:00.000Z"),
      rangeStart: Date.parse("2026-08-15T01:00:00.000Z"),
      seatId: 101,
      take: "latest",
    });
  });

  it("allows one fixed UTC+8 minute and includes the complete end minute", () => {
    expect(createWorkflowMessageQueryCommand({
      config: {
        limit: 5,
        take: "earliest",
        timeRange: {
          endAt: "2026-08-15T10:00",
          mode: "fixed",
          startAt: "2026-08-15T10:00",
        },
      },
      context: context(),
    })).toEqual({
      limit: 5,
      rangeEnd: Date.parse("2026-08-15T02:00:59.999Z"),
      rangeStart: Date.parse("2026-08-15T02:00:00.000Z"),
      seatId: 101,
      take: "earliest",
    });
  });

  it("resolves node lifecycle and node output time references", () => {
    const commandContext = context();
    commandContext.nodeLifecycle.wait = {
      enteredAt: "2026-08-15T01:15:00.000Z",
      exitedAt: "2026-08-15T01:45:00.000Z",
    };
    commandContext.outputs.querySource = { rangeEnd: "2026-08-15T01:50:00.000Z" };

    expect(createWorkflowMessageQueryCommand({
      config: {
        limit: 5,
        take: "latest",
        timeRange: {
          end: {
            kind: "node-output",
            selector: ["node", "querySource", "rangeEnd"],
          },
          mode: "dynamic",
          start: { field: "exitedAt", kind: "node-lifecycle", nodeId: "wait" },
        },
      },
      context: commandContext,
    })).toEqual(expect.objectContaining({
      rangeEnd: Date.parse("2026-08-15T01:50:00.000Z"),
      rangeStart: Date.parse("2026-08-15T01:45:00.000Z"),
    }));
  });

  it("rejects missing seat identity instead of querying across accounts", () => {
    const commandContext = context();
    commandContext.trigger = { occurredAt: "2026-08-15T01:00:00.000Z" };

    expect(() => createWorkflowMessageQueryCommand({
      config: {
        limit: 10,
        take: "latest",
        timeRange: {
          end: { field: "enteredAt", kind: "current-node-lifecycle" },
          mode: "dynamic",
          start: { field: "occurredAt", kind: "workflow-trigger" },
        },
      },
      context: commandContext,
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
  });
});

function context() {
  return {
    currentNodeLifecycle: { enteredAt: "2026-08-15T02:00:00.000Z" },
    nodeLifecycle: {} as Record<string, { enteredAt?: string; exitedAt?: string }>,
    outputs: {} as Record<string, Record<string, unknown>>,
    subjectId: "third-external-1",
    trigger: {
      occurredAt: "2026-08-15T01:00:00.000Z",
      projection: { seatId: 101 },
    },
  };
}

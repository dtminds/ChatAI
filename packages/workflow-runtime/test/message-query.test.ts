import { describe, expect, it } from "vitest";
import { createWorkflowMessageQueryCommand } from "../src/index.js";

describe("Workflow Message Query binding", () => {
  it("rejects expired fixed time before invoking the query", () => {
    expect(() => createWorkflowMessageQueryCommand({
      config: { limit: 10, take: "latest", timeRange: {
        mode: "fixed", startAt: "2026-01-01T10:00", endAt: "2026-01-02T10:00",
      } }, context: context(),
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
  });
  it("allows the complete 90th day and rejects offsets beyond 90 days", () => {
    const commandContext = context();
    const config = {
      limit: 10, take: "latest",
      timeRange: {
        mode: "relative",
        start: { amount: 90, unit: "day", time: "00:00" },
        end: { amount: 0, unit: "day", time: "23:59" },
      },
    };
    expect(() => createWorkflowMessageQueryCommand({ config, context: commandContext })).not.toThrow();
    config.timeRange.start.amount = 91;
    expect(() => createWorkflowMessageQueryCommand({ config, context: commandContext }))
      .toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
  });
  it("anchors relative dates to node entry in UTC+8 and includes the last minute", () => {
    const input = {
      config: {
        limit: 10, take: "latest",
        timeRange: {
          mode: "relative",
          start: { amount: 30, unit: "day", time: "00:00" },
          end: { amount: 0, unit: "day", time: "23:59" },
        },
      },
      context: context(),
    };
    const command = createWorkflowMessageQueryCommand(input);
    expect(command).toMatchObject({
      rangeStart: Date.parse("2026-07-15T16:00:00.000Z"),
      rangeEnd: Date.parse("2026-08-15T15:59:59.999Z"),
    });
    expect(createWorkflowMessageQueryCommand(input)).toEqual(command);
  });

  it.each(["hour", "minute"])("handles relative %s offsets across local midnight", unit => {
    const commandContext = context();
    commandContext.currentNodeLifecycle.enteredAt = "2026-08-14T16:30:00.000Z";
    expect(createWorkflowMessageQueryCommand({
      config: {
        limit: 1, take: "earliest",
        timeRange: {
          mode: "relative",
          start: { amount: unit === "hour" ? 1 : 60, unit, time: "23:00" },
          end: { amount: 0, unit: "day", time: "00:30" },
        },
      },
      context: commandContext,
    })).toMatchObject({
      rangeStart: Date.parse("2026-08-14T15:00:00.000Z"),
      rangeEnd: Date.parse("2026-08-14T16:30:59.999Z"),
    });
  });

  it("rejects relative ranges without an anchor or with reversed resolved dates", () => {
    const config = {
      limit: 10, take: "latest",
      timeRange: {
        mode: "relative",
        start: { amount: 1, unit: "hour", time: "23:00" },
        end: { amount: 0, unit: "day", time: "00:00" },
      },
    };
    expect(() => createWorkflowMessageQueryCommand({ config, context: context() }))
      .toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
    expect(() => createWorkflowMessageQueryCommand({
      config, context: { ...context(), currentNodeLifecycle: {} },
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
  });

  it("resolves the default dynamic range and seat identity", () => {
    expect(createWorkflowMessageQueryCommand({
      config: {
        limit: 10,
        take: "latest",
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
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
          end: ["node", "querySource", "rangeEnd"],
          mode: "dynamic",
          start: ["node-lifecycle", "wait", "exitedAt"],
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
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
      },
      context: commandContext,
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_MESSAGE_QUERY_COMMAND_INVALID" }));
  });
});

function context() {
  return {
    currentNodeLifecycle: { enteredAt: "2026-08-15T02:00:00.000Z" },
    identities: { thirdExternalUserId: "third-external-1" },
    nodeLifecycle: {} as Record<string, { enteredAt?: string; exitedAt?: string }>,
    outputs: {} as Record<string, Record<string, unknown>>,
    subjectId: "third-external-1",
    trigger: {
      occurredAt: "2026-08-15T01:00:00.000Z",
      projection: { seatId: 101 },
    },
  };
}

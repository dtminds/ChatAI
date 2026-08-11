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

  it("continues executing legacy duration waits without mode", async () => {
    await expect(registry.execute(node("wait", {
      duration: 46,
      unit: "day",
    }), context()))
      .resolves.toEqual({
        dueAt: "2026-08-25T00:00:00.000Z",
        output: { dueAt: "2026-08-25T00:00:00.000Z" },
        type: "wait",
      });

    await expect(registry.execute(node("wait", {
      duration: 525_601,
      unit: "minute",
    }), context())).rejects.toThrow("duration exceeds the supported unit limit");
  });

  it("starts a Wait Event with an absolute timeout", async () => {
    await expect(registry.execute(node("wait-event", {
      event: {
        capabilityKey: "event.message.received",
        collectWindowSeconds: 10,
        contractVersion: 1,
        type: "message.received",
      },
      timeout: { duration: 2, unit: "hour" },
    }), context())).resolves.toEqual({
      eventType: "message.received",
      expiresAt: "2026-07-10T02:00:00.000Z",
      type: "event-wait",
    });
  });

  it("rejects Wait Event specs that exceed the frozen timeout or collection contract", async () => {
    await expect(registry.execute(node("wait-event", {
      event: {
        capabilityKey: "event.message.received",
        collectWindowSeconds: 10,
        contractVersion: 1,
        type: "message.received",
      },
      timeout: { duration: 16, unit: "day" },
    }), context())).rejects.toThrow("Wait Event node requires a supported event and timeout");
    await expect(registry.execute(node("wait-event", {
      event: {
        capabilityKey: "event.message.received",
        collectWindowSeconds: 30,
        contractVersion: 1,
        type: "message.received",
      },
      timeout: { duration: 15, unit: "day" },
    }), context())).rejects.toThrow("Wait Event node requires a supported event and timeout");
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
    const expectedDueAt = "2025-03-26T01:00:00.000Z";
    const fixedTimeNode = node("wait", {
      dayOffset: 1,
      mode: "fixed-time",
      time: "09:00",
    });

    await expect(registry.execute(fixedTimeNode, context({
      now: new Date("2025-03-25T01:30:00.000Z"),
    }))).resolves.toEqual({
      dueAt: expectedDueAt,
      output: { dueAt: expectedDueAt },
      type: "wait",
    });
    await expect(registry.execute(fixedTimeNode, context({
      now: new Date("2025-03-25T15:59:00.000Z"),
    }))).resolves.toEqual({
      dueAt: expectedDueAt,
      output: { dueAt: expectedDueAt },
      type: "wait",
    });
    await expect(registry.execute(fixedTimeNode, context({
      now: new Date("2025-03-24T16:30:00.000Z"),
    }))).resolves.toEqual({
      dueAt: expectedDueAt,
      output: { dueAt: expectedDueAt },
      type: "wait",
    });
  });

  it("selects the first matching branch and falls back to default", async () => {
    const branch = node("branch", {
      branchPaths: [
        {
          conditions: [{
            id: "vip-condition",
            operator: "equals",
            selector: ["subject", "id"],
            value: "vip-1",
            valueType: "string",
          }],
          id: "vip",
          label: "如果",
          logic: "all",
        },
        {
          conditions: [{
            id: "returning-condition",
            operator: "contains",
            selector: ["trigger", "eventType"],
            value: "tag",
            valueType: "string",
          }],
          id: "returning",
          label: "否则如果",
          logic: "all",
        },
        { conditions: [], id: "else", isDefault: true, label: "否则", logic: "all" },
      ],
    });

    await expect(registry.execute(branch, context({
      trigger: { eventType: "contact.tag_added" },
    })))
      .resolves.toEqual({ output: {}, sourceOutletId: "returning", type: "advance" });
    await expect(registry.execute(branch, context()))
      .resolves.toEqual({ output: {}, sourceOutletId: "else", type: "advance" });
  });

  it("resolves Subject, Trigger, node output, and lifecycle selectors", async () => {
    const branch = node("branch", {
      branchPaths: [
        {
          conditions: [
            condition("subject", ["subject", "id"], "equals", "customer-1", "string"),
            condition("trigger", ["trigger", "eventType"], "contains", "tag", "string"),
            condition("output", ["node", "score", "value"], "greater-than", 8, "number"),
            condition(
              "lifecycle",
              ["node-lifecycle", "wait", "exitedAt"],
              "equals",
              "2026-07-10T08:00",
              "datetime",
            ),
            condition(
              "current-lifecycle",
              ["current-node-lifecycle", "enteredAt"],
              "equals",
              "2026-07-10T08:00",
              "datetime",
            ),
          ],
          id: "matched",
          label: "如果",
          logic: "all",
        },
        { conditions: [], id: "else", isDefault: true, label: "否则", logic: "all" },
      ],
    });

    await expect(registry.execute(branch, context({
      currentNodeLifecycle: { enteredAt: "2026-07-10T00:00:00.000Z" },
      nodeLifecycle: { wait: { exitedAt: "2026-07-10T00:00:00.000Z" } },
      outputs: { score: { value: 9 } },
      trigger: { eventType: "contact.tag_added" },
    }))).resolves.toEqual({ output: {}, sourceOutletId: "matched", type: "advance" });
  });

  it("does not register generic business action executors", async () => {
    await expect(registry.execute(node("message"), context()))
      .rejects.toThrow("Executor is not registered: message");
  });
});

function node(
  kind: "branch" | "end" | "message" | "start" | "wait" | "wait-event",
  config: Record<string, unknown> = {},
) {
  return { config, id: kind, kind, nodeSchemaVersion: 1, requiredCapabilities: [] };
}

function context(
  overrides: Partial<WorkflowNodeExecutionContext> = {},
): WorkflowNodeExecutionContext {
  return {
    now: new Date("2026-07-10T00:00:00.000Z"),
    outputs: {},
    run: {
      id: "1",
      revision: 1,
      sequence: 1,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: "8",
      workflowType: "chatai_sop",
    },
    trigger: {},
    ...overrides,
  };
}

function condition(
  id: string,
  selector: string[],
  operator: "contains" | "equals" | "greater-than",
  value: number | string,
  valueType: "datetime" | "number" | "string",
) {
  return { id, operator, selector, value, valueType };
}

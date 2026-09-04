import { describe, expect, it } from "vitest";
import {
  createWorkflowOrderQueryCommand,
  executeWorkflowCapability,
  mapWorkflowOrderQueryResult,
  resolveWorkflowForwardRoute,
  WORKFLOW_ORDER_QUERY_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  customFields: {},
  currentNodeLifecycle: { enteredAt: "2026-09-04T04:30:00.000Z" },
  identities: { xyId: 303 },
  nodeLifecycle: {},
  outputs: { collect: { orderNo: "SO-1001" } },
  subjectId: "101",
  trigger: { occurredAt: "2026-09-01T01:02:03.456Z" },
  workflow: {},
};

describe("Workflow Order Query capability", () => {
  it("resolves an upstream order number without requiring customer identity", () => {
    expect(createWorkflowOrderQueryCommand({
      config: { mode: "order-number", orderNumberSelector: ["node", "collect", "orderNo"] },
      context: { ...context, identities: {} },
    })).toEqual({ mode: "order-number", orderNumber: "SO-1001" });
  });

  it("freezes relative customer conditions into UTC+8 orderTimes", () => {
    expect(createWorkflowOrderQueryCommand({
      config: {
        conditions: {
          amount: { max: 200, min: 100 },
          goodsName: "T恤",
          platformId: 2,
          timeRange: {
            end: { amount: 0, time: "23:59", unit: "day" },
            mode: "relative",
            start: { amount: 7, time: "00:00", unit: "day" },
          },
          shopIds: [11],
          timeField: "order-time",
        },
        mode: "conditions",
      },
      context,
    })).toEqual({
      amount: { max: 200, min: 100 },
      goodsName: "T恤",
      mode: "conditions",
      platformId: 2,
      shopIds: [11],
      timeField: "order-time",
      timeRange: ["2026-08-28 00:00:00", "2026-09-04 23:59:00"],
    });
  });

  it("creates customer conditions without a platform filter", () => {
    expect(createWorkflowOrderQueryCommand({
      config: {
        conditions: {
          amount: {},
          timeRange: {
            endAt: "2026-09-04T23:59",
            mode: "absolute",
            startAt: "2026-09-01T00:00",
          },
          shopIds: [],
          timeField: "order-time",
        },
        mode: "conditions",
      },
      context,
    })).toEqual({
      amount: {},
      mode: "conditions",
      shopIds: [],
      timeField: "order-time",
      timeRange: ["2026-09-01 00:00:00", "2026-09-04 23:59:59"],
    });
  });

  it("resolves the default dynamic customer time range into UTC+8 seconds", () => {
    expect(createWorkflowOrderQueryCommand({
      config: {
        conditions: {
          amount: {},
          shopIds: [],
          timeField: "order-time",
          timeRange: {
            end: ["current-node-lifecycle", "enteredAt"],
            mode: "dynamic",
            start: ["trigger", "occurredAt"],
          },
        },
        mode: "conditions",
      },
      context,
    })).toEqual({
      amount: {},
      mode: "conditions",
      shopIds: [],
      timeField: "order-time",
      timeRange: ["2026-09-01 09:02:03", "2026-09-04 12:30:00"],
    });
  });

  it("allows the complete 360th relative day despite the current time of day", () => {
    expect(createWorkflowOrderQueryCommand({
      config: {
        conditions: {
          amount: {},
          shopIds: [],
          timeField: "order-time",
          timeRange: {
            end: { amount: 0, time: "23:59", unit: "day" },
            mode: "relative",
            start: { amount: 360, time: "00:00", unit: "day" },
          },
        },
        mode: "conditions",
      },
      context,
    })).toMatchObject({
      timeRange: ["2025-09-09 00:00:00", "2026-09-04 23:59:00"],
    });
  });

  it("rejects a range reaching the 361st day before calling the capability", () => {
    expectOrderQueryCommandError(() => createWorkflowOrderQueryCommand({
      config: {
        conditions: {
          amount: {},
          shopIds: [],
          timeField: "order-time",
          timeRange: {
            endAt: "2025-09-09T12:30",
            mode: "absolute",
            startAt: "2025-09-08T12:30",
          },
        },
        mode: "conditions",
      },
      context,
    }), "360-day lookback");
  });

  it("rejects unavailable, invalid, or reversed dynamic time values", () => {
    const config = {
      conditions: {
        amount: {},
        shopIds: [],
        timeField: "order-time",
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
      },
      mode: "conditions",
    };

    expectOrderQueryCommandError(() => createWorkflowOrderQueryCommand({
      config,
      context: { ...context, trigger: {} },
    }), "trigger.occurredAt");
    expectOrderQueryCommandError(() => createWorkflowOrderQueryCommand({
      config,
      context: { ...context, trigger: { occurredAt: "not-a-time" } },
    }), "trigger.occurredAt");
    expectOrderQueryCommandError(() => createWorkflowOrderQueryCommand({
      config,
      context: {
        ...context,
        currentNodeLifecycle: { enteredAt: "2026-09-01T00:00:00.000Z" },
      },
    }), "start before end");
  });

  it("maps stable aggregate outputs and sends no idempotency key", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      netAmount: 80,
      orderCount: 1,
      totalAmount: 100,
    }));
    const result = await executeWorkflowCapability({
      binding: WORKFLOW_ORDER_QUERY_CAPABILITY_BINDING,
      commandContext: context,
      config: { mode: "order-number", orderNumberSelector: ["node", "collect", "orderNo"] },
      deadlineAt: new Date("2026-09-04T04:30:15.000Z"),
      execution: { nodeId: "order-query", revision: 1, runId: "run-1", sequence: 1, workflowId: "1" },
      executionKey: "9:run-1:order-query:1",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "101",
      subjectType: "wecom_contact",
      uid: 9,
    });
    expect(result).toEqual({ netAmount: 80, orderCount: 1, totalAmount: 100 });
    expect(adapter.calls[0]?.request).not.toHaveProperty("idempotencyKey");
    expect(mapWorkflowOrderQueryResult({ netAmount: 0, orderCount: 0, totalAmount: 0 })).toEqual({ netAmount: 0, orderCount: 0, totalAmount: 0 });
  });

  it("checks Order Query selectors before routing a live revision", () => {
    const orderNumberSpec = liveRevisionSpec({
      mode: "order-number",
      orderNumberSelector: ["node", "collect", "orderNo"],
    });
    expect(resolveWorkflowForwardRoute({
      context: { outputs: {}, trigger: {} },
      currentNodeId: "start",
      currentNodeKind: "start",
      latestSpec: orderNumberSpec,
      sourceOutletId: "default",
    })).toEqual({ kind: "flow-changed", reason: "flow_changed_context_incompatible" });

    const dynamicSpec = liveRevisionSpec({
      conditions: {
        amount: {},
        shopIds: [],
        timeField: "order-time",
        timeRange: {
          end: ["current-node-lifecycle", "enteredAt"],
          mode: "dynamic",
          start: ["trigger", "occurredAt"],
        },
      },
      mode: "conditions",
    });
    expect(resolveWorkflowForwardRoute({
      context: { outputs: {}, trigger: {} },
      currentNodeId: "start",
      currentNodeKind: "start",
      latestSpec: dynamicSpec,
      sourceOutletId: "default",
    })).toEqual({ kind: "flow-changed", reason: "flow_changed_context_incompatible" });
    expect(resolveWorkflowForwardRoute({
      context: { outputs: {}, trigger: { occurredAt: "2026-09-01T00:00:00.000Z" } },
      currentNodeId: "start",
      currentNodeKind: "start",
      latestSpec: dynamicSpec,
      sourceOutletId: "default",
    })).toMatchObject({ kind: "success", target: { id: "order-query" } });
  });
});

function liveRevisionSpec(config: Record<string, unknown>) {
  return {
    edges: [
      { id: "start-query", source: "start", sourceOutletId: "default", target: "order-query" },
      { id: "query-end", source: "order-query", sourceOutletId: "default", target: "end" },
    ],
    entryNodeId: "start",
    nodes: [
      { config: {}, id: "start", kind: "start" as const, nodeSchemaVersion: 1 },
      { config, id: "order-query", kind: "order-query" as const, nodeSchemaVersion: 1 },
      { config: {}, id: "end", kind: "end" as const, nodeSchemaVersion: 1 },
    ],
    revision: 2,
    workflowId: "1",
  };
}

function expectOrderQueryCommandError(run: () => unknown, diagnosticText: string) {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({
    code: "WORKFLOW_ORDER_QUERY_COMMAND_INVALID",
    diagnosticMessage: expect.stringContaining(diagnosticText),
    failureKind: "terminal",
  });
}

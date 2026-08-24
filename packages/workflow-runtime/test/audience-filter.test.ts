import { describe, expect, it } from "vitest";
import {
  createWorkflowAudienceFilterCommand,
  executeWorkflowCapability,
  executeWorkflowCapabilityStep,
  mapWorkflowAudienceFilterResult,
  WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-24T09:30:00.000Z" },
  identities: { externalUserId: 101 },
  nodeLifecycle: {},
  outputs: {},
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-24T08:00:00.000Z" },
  workflow: {},
};

const groups = [
  { id: 301, name: "高价值客户" },
  { id: 302, name: "沉默客户" },
];

describe("Workflow Audience Filter capability", () => {
  it("queries without an idempotency key and maps membership to outputs", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      exist: true,
      groupIds: [301],
    }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
      commandContext: context,
      config: { groups, matchMode: "any" },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "audience-filter",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:audience-filter:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({
      matched: true,
      matchedGroupCount: 1,
      matchedGroupNames: "高价值客户",
    });
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "cdp.group.check-contact",
        contractVersion: 1,
        kind: "query",
      },
      request: {
        command: { groupIds: [301, 302] },
        subjectId: "customer-1",
      },
    });
    expect(adapter.calls[0]?.request).not.toHaveProperty("idempotencyKey");
  });

  it("maps any, all, and none matching onto node outputs", async () => {
    expect(mapWorkflowAudienceFilterResult({
      config: { groups, matchMode: "all" },
      result: { exist: true, groupIds: [301] },
    })).toEqual({
      matched: false,
      matchedGroupCount: 1,
      matchedGroupNames: "高价值客户",
    });
    expect(mapWorkflowAudienceFilterResult({
      config: { groups, matchMode: "none" },
      result: { exist: false, groupIds: [] },
    })).toEqual({
      matched: true,
      matchedGroupCount: 0,
      matchedGroupNames: "",
    });
    expect(mapWorkflowAudienceFilterResult({
      config: { groups, matchMode: "all" },
      result: { exist: true, groupIds: [] },
    })).toEqual({
      matched: true,
      matchedGroupCount: 2,
      matchedGroupNames: "高价值客户、沉默客户",
    });

    const step = await executeWorkflowCapabilityStep({
      binding: WORKFLOW_AUDIENCE_FILTER_CAPABILITY_BINDING,
      commandContext: context,
      config: { groups, matchMode: "all" },
      deadlineAt: new Date("2026-08-24T09:30:15.000Z"),
      execution: {
        nodeId: "audience-filter",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:audience-filter:3",
      port: new FakeWorkflowCapabilityAdapter(async () => ({
        exist: true,
        groupIds: [301],
      })),
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(step).toEqual({
      output: {
        matched: false,
        matchedGroupCount: 1,
        matchedGroupNames: "高价值客户",
      },
      sourceOutletId: "default",
    });
  });

  it("rejects missing identity or incomplete group config before calling Java", () => {
    expect(() => createWorkflowAudienceFilterCommand({
      config: { groups, matchMode: "any" },
      context: { ...context, identities: {} },
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_COMMAND_INVALID",
      diagnosticMessage: "Audience Filter subject is unavailable in the Run context",
      failureKind: "terminal",
    }));

    expect(() => createWorkflowAudienceFilterCommand({
      config: { groups: [], matchMode: "any" },
      context,
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_AUDIENCE_FILTER_COMMAND_INVALID",
      diagnosticMessage: "Audience Filter execution config failed schema validation",
      failureKind: "terminal",
    }));
  });
});

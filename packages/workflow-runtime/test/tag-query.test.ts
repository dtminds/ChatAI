import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowTagQueryCommand,
  executeWorkflowCapability,
  mapWorkflowTagQueryResult,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-18T09:30:00.000Z" },
  nodeLifecycle: {},
  outputs: {},
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-18T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Tag Query capability", () => {
  it("queries without an idempotency key and maps matched tags in configured order", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      matchedTags: [
        { id: 202, name: "已成交" },
        { id: 101, name: "重点客户" },
      ],
    }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
      commandContext: context,
      config: { matchMode: "all", tagIds: [101, 202] },
      deadlineAt: new Date("2026-08-18T09:30:15.000Z"),
      execution: {
        nodeId: "tag-query",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:tag-query:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({
      matched: true,
      matchedTagCount: 2,
      matchedTagNames: "重点客户、已成交",
    });
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "customer.tag.query",
        contractVersion: 1,
        kind: "query",
      },
      request: {
        command: { tagIds: [101, 202] },
        subjectId: "customer-1",
      },
    });
    expect(adapter.calls[0]?.request).not.toHaveProperty("idempotencyKey");
  });

  it("distinguishes any, all, and none matching, including an empty result", () => {
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "any", tagIds: [101, 202] },
      result: { matchedTags: [{ id: 202, name: "已成交" }] },
    })).toEqual({
      matched: true,
      matchedTagCount: 1,
      matchedTagNames: "已成交",
    });
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "all", tagIds: [101, 202] },
      result: { matchedTags: [{ id: 101, name: "重点客户" }] },
    })).toEqual({
      matched: false,
      matchedTagCount: 1,
      matchedTagNames: "重点客户",
    });
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "all", tagIds: [101, 202] },
      result: { matchedTags: [] },
    })).toEqual({
      matched: false,
      matchedTagCount: 0,
      matchedTagNames: "",
    });
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "any", tagIds: [101, 202] },
      result: { matchedTags: [] },
    })).toEqual({
      matched: false,
      matchedTagCount: 0,
      matchedTagNames: "",
    });
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "none", tagIds: [101, 202] },
      result: { matchedTags: [] },
    })).toEqual({
      matched: true,
      matchedTagCount: 0,
      matchedTagNames: "",
    });
    expect(mapWorkflowTagQueryResult({
      config: { matchMode: "none", tagIds: [101, 202] },
      result: { matchedTags: [{ id: 101, name: "重点客户" }] },
    })).toEqual({
      matched: false,
      matchedTagCount: 1,
      matchedTagNames: "重点客户",
    });
  });

  it("rejects invalid commands and unknown or duplicate matched tags", () => {
    expect(() => createWorkflowTagQueryCommand({
      config: { matchMode: "any", tagIds: [] },
      context,
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_TAG_QUERY_COMMAND_INVALID",
      failureKind: "terminal",
    }));
    expect(() => createWorkflowTagQueryCommand({
      config: { matchMode: "any", tagIds: [101] },
      context: { ...context, subjectId: "" },
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_TAG_QUERY_COMMAND_INVALID" }));
    expect(() => mapWorkflowTagQueryResult({
      config: { matchMode: "any", tagIds: [101] },
      result: { matchedTags: [{ id: 202, name: "未知标签" }] },
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID" }));
    expect(() => mapWorkflowTagQueryResult({
      config: { matchMode: "any", tagIds: [101] },
      result: {
        matchedTags: [
          { id: 101, name: "重点客户" },
          { id: 101, name: "重点客户" },
        ],
      },
    })).toThrow(expect.objectContaining({ code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID" }));
  });

  it("rejects malformed Java results before mapping them", async () => {
    const execute = vi.fn(async () => ({ matchedTags: [{ id: 101 }] }));
    await expect(executeWorkflowCapability({
      binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
      commandContext: context,
      config: { matchMode: "any", tagIds: [101] },
      deadlineAt: new Date("2026-08-18T09:30:15.000Z"),
      execution: {
        nodeId: "tag-query",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:tag-query:3",
      port: new FakeWorkflowCapabilityAdapter(execute),
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "wecom_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
      failureKind: "terminal",
    });
  });
});

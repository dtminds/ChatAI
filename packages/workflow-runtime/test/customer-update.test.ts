import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowCustomerUpdateCommand,
  executeWorkflowCapability,
  normalizeWorkflowCustomerDate,
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-17T16:30:00.000Z" },
  nodeLifecycle: {},
  outputs: {
    llm: {
      birthday: "1995-04-18",
      invalidDate: "not-a-date",
      score: 12.5,
    },
  },
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-17T08:00:00.000Z" },
  workflow: {},
};

describe("Workflow Customer Update capability", () => {
  it("creates one typed batch action and filters invalid DATE or AGE strings", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({}));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        fields: [
          { fieldId: 1, fieldType: 1, value: { kind: "literal", value: "重点客户" } },
          {
            fieldId: 2,
            fieldType: 12,
            value: {
              kind: "variable",
              selector: ["node", "llm", "birthday"],
              valueType: { kind: "string" },
            },
          },
          {
            fieldId: 3,
            fieldType: 4,
            value: {
              kind: "variable",
              selector: ["node", "llm", "invalidDate"],
              valueType: { kind: "string" },
            },
          },
          {
            fieldId: 4,
            fieldType: 11,
            value: {
              kind: "variable",
              selector: ["node", "llm", "score"],
              valueType: { kind: "number" },
            },
          },
        ],
      },
      deadlineAt: new Date("2026-08-17T16:30:15.000Z"),
      execution: {
        nodeId: "customer-update",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:customer-update:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({});
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "customer.update",
        contractVersion: 1,
        kind: "action",
      },
      request: {
        command: {
          source: "workflow",
          updates: [
            { fieldId: 1, fieldType: 1, value: "重点客户" },
            { fieldId: 2, fieldType: 12, value: "1995-04-18" },
            { fieldId: 4, fieldType: 11, value: 12.5 },
          ],
        },
        idempotencyKey: "9:run-1:customer-update:3",
        subjectId: "customer-1",
        subjectType: "chatai_contact",
      },
    });
  });

  it("normalizes DATE and AGE values using the UTC+8 workflow contract", () => {
    expect(normalizeWorkflowCustomerDate("2026-08-17")).toBe("2026-08-17");
    expect(normalizeWorkflowCustomerDate("1995年4月18日")).toBe("1995-04-18");
    expect(normalizeWorkflowCustomerDate("2026-08-17T00:30:00")).toBe("2026-08-17");
    expect(normalizeWorkflowCustomerDate("2026-08-16T16:30:00.000Z")).toBe("2026-08-17");
    expect(normalizeWorkflowCustomerDate("2026-02-30")).toBeNull();
    expect(normalizeWorkflowCustomerDate("2026-02-30T00:00:00Z")).toBeNull();
    expect(normalizeWorkflowCustomerDate("1995")).toBeNull();
    expect(normalizeWorkflowCustomerDate("not-a-date")).toBeNull();
  });

  it("completes successfully with one empty batch when every date value is invalid", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({}));

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        fields: [{
          fieldId: 3,
          fieldType: 12,
          value: {
            kind: "variable",
            selector: ["node", "llm", "invalidDate"],
            valueType: { kind: "string" },
          },
        }],
      },
      deadlineAt: new Date("2026-08-17T16:30:15.000Z"),
      execution: {
        nodeId: "customer-update",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:customer-update:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).resolves.toEqual({});

    expect(adapter.calls[0]?.request.command).toEqual({ source: "workflow", updates: [] });
  });

  it("rejects unavailable or incompatible values before invoking Java", async () => {
    expect(() => createWorkflowCustomerUpdateCommand({
      config: {
        fields: [{
          fieldId: 1,
          fieldType: 1,
          value: {
            kind: "variable",
            selector: ["node", "missing", "text"],
            valueType: { kind: "string" },
          },
        }],
      },
      context,
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_CUSTOMER_UPDATE_COMMAND_INVALID",
      failureKind: "terminal",
    }));

    const execute = vi.fn(async () => ({}));
    await expect(executeWorkflowCapability({
      binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      commandContext: { ...context, subjectId: "" },
      config: {
        fields: [{ fieldId: 1, fieldType: 1, value: { kind: "literal", value: "重点客户" } }],
      },
      deadlineAt: new Date("2026-08-17T16:30:15.000Z"),
      execution: {
        nodeId: "customer-update",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:customer-update:3",
      port: new FakeWorkflowCapabilityAdapter(execute),
      signal: new AbortController().signal,
      subjectId: "",
      subjectType: "wecom_contact",
      uid: 9,
    })).rejects.toMatchObject({ code: "WORKFLOW_CUSTOMER_UPDATE_COMMAND_INVALID" });
    expect(execute).not.toHaveBeenCalled();
  });
});

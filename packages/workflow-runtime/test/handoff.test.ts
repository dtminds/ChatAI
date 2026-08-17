import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowHandoffCommand,
  executeWorkflowCapability,
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-17T09:30:00.000Z" },
  nodeLifecycle: {
    query: {
      enteredAt: "2026-08-17T09:00:00.000Z",
      exitedAt: "2026-08-17T09:00:01.000Z",
    },
  },
  outputs: {
    query: { messageCount: 2, textContent: "退款问题" },
  },
  subjectId: "customer-1",
  trigger: { occurredAt: "2026-08-17T08:00:00.000Z" },
  workflow: {
    message: {
      accountSelection: {
        seatIds: [101, 102],
        strategy: "earliest-added" as const,
      },
    },
  },
};

describe("Workflow Handoff capability", () => {
  it("renders both messages into one typed idempotent action command", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      handoffAt: "2026-08-17T09:31:00Z",
    }));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        customerMessage: [
          { type: "text", value: "请稍等，" },
          { selector: ["subject", "id"], type: "variable" },
        ],
        operatorMessage: [
          { selector: ["node", "query", "textContent"], type: "variable" },
          { type: "text", value: "，请及时接待" },
        ],
      },
      deadlineAt: new Date("2026-08-17T09:30:15.000Z"),
      execution: {
        nodeId: "handoff",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:handoff:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({ handoffAt: "2026-08-17T09:31:00.000Z" });
    expect(adapter.calls[0]).toMatchObject({
      definition: {
        capabilityKey: "chatai.conversation.handoff",
        contractVersion: 1,
        kind: "action",
      },
      request: {
        command: {
          accountSelection: { seatIds: [101, 102], strategy: "earliest-added" },
          customerMessage: "请稍等，customer-1",
          operatorMessage: "退款问题，请及时接待",
          recipient: { thirdExternalUserId: "customer-1" },
          source: "workflow",
        },
        idempotencyKey: "9:run-1:handoff:3",
      },
    });
  });

  it("keeps the customer message optional", () => {
    expect(createWorkflowHandoffCommand({
      config: {
        customerMessage: [],
        operatorMessage: [{ type: "text", value: "需要人工处理" }],
      },
      context,
    })).toMatchObject({
      customerMessage: "",
      operatorMessage: "需要人工处理",
    });
  });

  it("rejects an unavailable variable before invoking the adapter", async () => {
    const execute = vi.fn(async () => ({ handoffAt: "2026-08-17T09:31:00.000Z" }));
    const adapter = new FakeWorkflowCapabilityAdapter(execute);

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        customerMessage: [],
        operatorMessage: [{ selector: ["node", "missing", "text"], type: "variable" }],
      },
      deadlineAt: new Date("2026-08-17T09:30:15.000Z"),
      execution: {
        nodeId: "handoff",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:handoff:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_HANDOFF_COMMAND_INVALID",
      failureKind: "terminal",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["too long", "x".repeat(101)],
  ])("rejects an operator message that renders %s", (_scenario, textContent) => {
    expect(() => createWorkflowHandoffCommand({
      config: {
        customerMessage: [],
        operatorMessage: [{ selector: ["node", "query", "textContent"], type: "variable" }],
      },
      context: {
        ...context,
        outputs: { query: { textContent } },
      },
    })).toThrow(expect.objectContaining({
      code: "WORKFLOW_HANDOFF_COMMAND_INVALID",
      failureKind: "terminal",
    }));
  });

  it("diagnoses a missing account snapshot separately from a missing recipient", () => {
    let error: unknown;
    try {
      createWorkflowHandoffCommand({
        config: {
          customerMessage: [],
          operatorMessage: [{ type: "text", value: "需要人工处理" }],
        },
        context: { ...context, workflow: {} },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "WORKFLOW_HANDOFF_COMMAND_INVALID",
      diagnosticMessage: "Handoff account selection is unavailable in the Run context",
      failureKind: "terminal",
    });
  });
});

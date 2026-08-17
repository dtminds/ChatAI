import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowMessageCommand,
  createWorkflowMessageRunContext,
  executeWorkflowCapability,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
} from "../src/index.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-16T09:30:00.000Z" },
  nodeLifecycle: {
    query: {
      enteredAt: "2026-08-16T09:00:00.000Z",
      exitedAt: "2026-08-16T09:00:01.000Z",
    },
  },
  outputs: {
    query: { messageCount: 2, textContent: "first\nsecond" },
  },
  subjectId: "customer-1",
  trigger: {
    occurredAt: "2026-08-16T08:00:00.000Z",
    projection: { seatId: 101 },
  },
  workflow: {
    message: {
      accountSelection: {
        seatIds: [101, 102],
        strategy: "earliest-added",
      },
    },
  },
};

describe("Workflow Message capability", () => {
  it("freezes the Start account selection for the lifetime of a Run", () => {
    const startConfig = {
      entryPolicy: { mode: "never" as const },
      pushAccountStrategy: "latest-added" as const,
      seatIds: [101, 102],
      triggers: [{ sourceIds: [], type: "contact.friend_added" as const }],
    };

    const runContext = createWorkflowMessageRunContext(startConfig);
    startConfig.seatIds.push(103);

    expect(runContext).toEqual({
      message: {
        accountSelection: {
          seatIds: [101, 102],
          strategy: "latest-added",
        },
      },
    });
  });

  it("renders custom variables and attachment references into a typed command", () => {
    expect(createWorkflowMessageCommand({
      config: {
        attachments: [{
          content: { fileUrl: "https://cdn.example.com/image.png" },
          materialCollectionId: "201",
          msgInfoId: "301",
          type: "image",
        }],
        content: [
          { type: "text", value: "客户 " },
          { selector: ["subject", "id"], type: "variable" },
          { type: "text", value: " 有 " },
          { selector: ["node", "query", "messageCount"], type: "variable" },
          { type: "text", value: " 条消息" },
        ],
        contentMode: "custom",
      },
      context,
    })).toEqual({
      accountSelection: { seatIds: [101, 102], strategy: "earliest-added" },
      attachments: [{
        content: { fileUrl: "https://cdn.example.com/image.png" },
        materialCollectionId: "201",
        msgInfoId: "301",
        type: "image",
      }],
      content: "客户 customer-1 有 2 条消息",
      recipient: { thirdExternalUserId: "customer-1" },
      source: "workflow",
    });
  });

  it("renders a selected text output without leaking its selector to the adapter", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      sentAt: "2026-08-16T09:31:00.000Z",
    }));

    await executeWorkflowCapability({
      binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        attachments: [],
        contentMode: "node-output",
        outputSelector: ["node", "query", "textContent"],
      },
      deadlineAt: new Date("2026-08-16T09:30:15.000Z"),
      execution: {
        nodeId: "message",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:message:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(adapter.calls[0]).toMatchObject({
      request: {
        command: {
          accountSelection: { seatIds: [101, 102], strategy: "earliest-added" },
          attachments: [],
          content: "first\nsecond",
          recipient: { thirdExternalUserId: "customer-1" },
          source: "workflow",
        },
        idempotencyKey: "9:run-1:message:3",
      },
    });
    expect(adapter.calls[0]!.request.command).not.toHaveProperty("outputSelector");
  });

  it("rejects unavailable variables before invoking the adapter", async () => {
    const execute = vi.fn(async () => ({ sentAt: "2026-08-16T09:31:00.000Z" }));
    const adapter = new FakeWorkflowCapabilityAdapter(execute);

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        attachments: [],
        content: [{ selector: ["node", "missing", "text"], type: "variable" }],
        contentMode: "custom",
      },
      deadlineAt: new Date("2026-08-16T09:30:15.000Z"),
      execution: {
        nodeId: "message",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:message:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_MESSAGE_COMMAND_INVALID",
      failureKind: "terminal",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("diagnoses a missing account snapshot separately from a missing recipient", () => {
    let error: unknown;
    try {
      createWorkflowMessageCommand({
        config: {
          attachments: [],
          content: [{ type: "text", value: "hello" }],
          contentMode: "custom",
        },
        context: { ...context, workflow: {} },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "WORKFLOW_MESSAGE_COMMAND_INVALID",
      diagnosticMessage: "Message account selection is unavailable in the Run context",
      failureKind: "terminal",
    });
  });

  it("rejects an invalid Java result as a terminal output failure", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({
      sentAt: "2026-08-16 09:31:00",
    }));

    await expect(executeWorkflowCapability({
      binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        attachments: [],
        content: [{ type: "text", value: "hello" }],
        contentMode: "custom",
      },
      deadlineAt: new Date("2026-08-16T09:30:15.000Z"),
      execution: {
        nodeId: "message",
        revision: 2,
        runId: "run-1",
        sequence: 3,
        workflowId: "workflow-1",
      },
      executionKey: "9:run-1:message:3",
      port: adapter,
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    })).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_OUTPUT_INVALID",
      failureKind: "terminal",
    });
  });
});

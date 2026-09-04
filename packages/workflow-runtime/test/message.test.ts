import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowChatAiRunContext,
  createWorkflowMessageCommand,
  executeWorkflowCapability,
  getNextWorkflowMessageExecutionAt,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
} from "../src/index.js";
import { getWorkflowDatetimeVariableSelectors } from "../src/variable-content.js";
import { FakeWorkflowCapabilityAdapter } from "./support/fake-capability-adapter.js";

const context = {
  currentNodeLifecycle: { enteredAt: "2026-08-16T09:30:00.000Z" },
  identities: { thirdExternalUserId: "customer-1" },
  nodeLifecycle: {
    query: {
      enteredAt: "2026-08-16T09:00:00.000Z",
      exitedAt: "2026-08-16T09:00:01.000Z",
    },
  },
  outputs: {
    query: {
      messageCount: 2,
      messages: [
        {
          id: 101,
          parts: [{ text: "first", type: "text" }],
          role: "customer",
        },
        {
          id: 102,
          parts: [
            { type: "image", url: "/media/order.png" },
            { text: "second", type: "text" },
          ],
          role: "agent",
        },
      ],
    },
  },
  subjectId: "customer-1",
  trigger: {
    occurredAt: "2026-08-16T08:00:00.000Z",
    projection: { seatId: 101 },
  },
  workflow: {
    message: {
      sendingWindow: { endTime: "20:00", startTime: "09:00" },
    },
  },
};

describe("Workflow Message capability", () => {
  it("freezes the Start message context for the lifetime of a Run", () => {
    const startConfig = {
      entryPolicy: { mode: "never" as const },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      seatIds: [101, 102],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" as const }],
    };

    const runContext = createWorkflowChatAiRunContext(startConfig);
    startConfig.messageSendingWindow.startTime = "10:00";

    expect(runContext).toEqual({
      message: {
        sendingWindow: { endTime: "20:00", startTime: "09:00" },
      },
    });
  });

  it("defers Message execution to the next UTC+8 sending window", () => {
    const workflow = createWorkflowChatAiRunContext({
      entryPolicy: { mode: "never" },
      messageSendingWindow: { endTime: "20:00", startTime: "09:00" },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });

    expect(getNextWorkflowMessageExecutionAt(
      workflow,
      new Date("2026-08-18T00:30:00.000Z"),
    )).toEqual(new Date("2026-08-18T01:00:00.000Z"));
    expect(getNextWorkflowMessageExecutionAt(
      workflow,
      new Date("2026-08-18T02:00:00.000Z"),
    )).toBeNull();
    expect(getNextWorkflowMessageExecutionAt(
      workflow,
      new Date("2026-08-18T12:00:00.000Z"),
    )).toEqual(new Date("2026-08-19T01:00:00.000Z"));
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
      attachments: [{
        content: { fileUrl: "https://cdn.example.com/image.png" },
        materialCollectionId: "201",
        msgInfoId: "301",
        type: "image",
      }],
      content: "客户 customer-1 有 2 条消息",
      recipient: { thirdExternalUserId: "customer-1" },
      seatId: 101,
      source: "workflow",
    });
  });

  it("formats datetime variables as UTC+8 message text", () => {
    expect(createWorkflowMessageCommand({
      config: {
        attachments: [],
        content: [
          { selector: ["trigger", "occurredAt"], type: "variable" },
          { type: "text", value: " / " },
          { selector: ["current-node-lifecycle", "enteredAt"], type: "variable" },
          { type: "text", value: " / " },
          { selector: ["node-lifecycle", "query", "exitedAt"], type: "variable" },
          { type: "text", value: " / " },
          { selector: ["node", "query", "displayText"], type: "variable" },
        ],
        contentMode: "custom",
      },
      context: {
        ...context,
        outputs: {
          ...context.outputs,
          query: {
            ...context.outputs.query,
            displayText: "2026-08-16T09:00:00.000Z",
          },
        },
      },
    }).content).toBe(
      "2026-08-16 16:00:00 / 2026-08-16 17:30:00 / 2026-08-16 17:00:01 / 2026-08-16T09:00:00.000Z",
    );
  });

  it("formats datetime node outputs registered by the execution contract", () => {
    const datetimeVariableSelectors = getWorkflowDatetimeVariableSelectors({
      edges: [],
      entryNodeId: "wait-event",
      nodes: [{
        config: {},
        id: "wait-event",
        kind: "wait-event",
        nodeSchemaVersion: 1,
      }],
      revision: 1,
      schemaVersion: 3,
      terminalNodeId: "wait-event",
      workflowId: "workflow-1",
    });

    expect(createWorkflowMessageCommand({
      config: {
        attachments: [],
        content: [{ selector: ["node", "wait-event", "triggeredAt"], type: "variable" }],
        contentMode: "custom",
      },
      context: {
        ...context,
        outputs: {
          ...context.outputs,
          "wait-event": {
            triggeredAt: "2026-08-16T09:00:00.000Z",
          },
        },
        datetimeVariableSelectors,
      },
    }).content).toBe("2026-08-16 17:00:00");
  });

  it("derives text from structured messages without leaking its selector to the adapter", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({}));

    const result = await executeWorkflowCapability({
      binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        attachments: [],
        content: [{ selector: ["node", "query", "messages"], type: "variable" }],
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
    });

    expect(result).toEqual({});
    expect(adapter.calls[0]).toMatchObject({
      request: {
        command: {
          attachments: [],
          content: "用户: first\n客服: [图片]second",
          recipient: { thirdExternalUserId: "customer-1" },
          seatId: 101,
          source: "workflow",
        },
        idempotencyKey: "9:run-1:message:3",
      },
    });
    expect(adapter.calls[0]!.request.command).not.toHaveProperty("contentMode");
  });

  it("rejects unavailable variables before invoking the adapter", async () => {
    const execute = vi.fn(async () => ({}));
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

  it("diagnoses a missing frozen seat separately from a missing recipient", () => {
    let error: unknown;
    try {
      createWorkflowMessageCommand({
        config: {
          attachments: [],
          content: [{ type: "text", value: "hello" }],
          contentMode: "custom",
        },
        context: {
          ...context,
          trigger: { ...context.trigger, projection: {} },
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "WORKFLOW_MESSAGE_COMMAND_INVALID",
      diagnosticMessage: "Message seat is unavailable in the Run context",
      failureKind: "terminal",
    });
  });

  it("rejects unexpected Java result fields as a terminal output failure", async () => {
    const adapter = new FakeWorkflowCapabilityAdapter(async () => ({ unexpected: true }));

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

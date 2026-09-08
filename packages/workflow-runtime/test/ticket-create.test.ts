import { describe, expect, it } from "vitest";
import {
  createWorkflowTicketCreateCommand,
  executeWorkflowCapability,
  resolveWorkflowForwardRoute,
  WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING,
} from "../src/index.js";

const context = {
  customFields: {},
  currentNodeLifecycle: {},
  identities: { thirdExternalUserId: "customer-1" },
  nodeLifecycle: {},
  outputs: { llm: { summary: "需要补发礼品" } },
  subjectId: "customer-1",
  trigger: { projection: { messageId: 321, seatId: 101 } },
  workflow: {},
};

describe("Workflow Ticket Create capability", () => {
  it("renders fixed content and variables into an idempotent command", async () => {
    const calls: unknown[] = [];
    const result = await executeWorkflowCapability({
      binding: WORKFLOW_TICKET_CREATE_CAPABILITY_BINDING,
      commandContext: context,
      config: {
        description: [
          { type: "text", value: "处理原因：" },
          { type: "variable", selector: ["node", "llm", "summary"] },
        ],
        priority: "high",
        ticketTitle: [{ type: "text", value: "补发礼品" }],
      },
      deadlineAt: new Date("2026-09-08T01:00:00.000Z"),
      execution: { nodeId: "ticket", revision: 1, runId: "run", sequence: 2, workflowId: "workflow" },
      executionKey: "9:run:ticket:2",
      port: { execute: async (_definition, request) => { calls.push(request); return { ticketId: "42" }; } },
      signal: new AbortController().signal,
      subjectId: "customer-1",
      subjectType: "chatai_contact",
      uid: 9,
    });

    expect(result).toEqual({ ticketId: "42" });
    expect(calls[0]).toMatchObject({
      command: {
        anchorMessageId: 321,
        description: "处理原因：需要补发礼品",
        priority: "high",
        recipient: { thirdExternalUserId: "customer-1" },
        seatId: 101,
        title: "补发礼品",
      },
      idempotencyKey: "9:run:ticket:2",
    });
  });

  it("rejects an empty rendered title before invoking the capability port", () => {
    expect(() => createWorkflowTicketCreateCommand({
      config: { description: [], priority: "medium", ticketTitle: [{ type: "text", value: "   " }] },
      context,
    })).toThrow("执行所需数据不可用，流程已停止");
  });

  it("ends a live revision when the old run has no frozen seat", () => {
    expect(resolveWorkflowForwardRoute({
      context: { outputs: {}, trigger: {} },
      currentNodeId: "start",
      currentNodeKind: "start",
      latestSpec: {
        edges: [{ id: "start-ticket", source: "start", sourceOutletId: "default", target: "ticket-create" }],
        entryNodeId: "start",
        nodes: [
          { config: {}, id: "start", kind: "start", nodeSchemaVersion: 1 },
          {
            config: { description: [], priority: "medium", ticketTitle: [{ type: "text", value: "处理客户需求" }] },
            id: "ticket-create",
            kind: "ticket-create",
            nodeSchemaVersion: 1,
          },
        ],
        revision: 2,
        schemaVersion: 3,
        terminalNodeId: "ticket-create",
        workflowId: "workflow",
      },
      sourceOutletId: "default",
    })).toEqual({ kind: "flow-changed", reason: "flow_changed_context_incompatible" });
  });
});

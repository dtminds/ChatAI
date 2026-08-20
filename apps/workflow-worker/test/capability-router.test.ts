import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
  type WorkflowCapabilityPort,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityRouter } from "../src/capability-router.js";

describe("Workflow capability router", () => {
  it("dispatches an exact capability route and exposes the same production binding", async () => {
    const execute = vi.fn(async () => ({ matchedTags: [] }));
    const port = { execute } as unknown as WorkflowCapabilityPort;
    const router = new WorkflowCapabilityRouter([
      { binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING, port },
    ]);
    const request = tagQueryRequest();

    await expect(router.execute(
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
      request,
    )).resolves.toEqual({ matchedTags: [] });
    expect(execute).toHaveBeenCalledWith(
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING.definition,
      request,
    );
    expect(router.bindings).toEqual([WORKFLOW_TAG_QUERY_CAPABILITY_BINDING]);
  });

  it("keeps Handoff, Message, and Tag Query routes isolated", async () => {
    const handoffExecute = vi.fn(async () => ({}));
    const messageExecute = vi.fn(async () => ({}));
    const tagQueryExecute = vi.fn(async () => ({ matchedTags: [] }));
    const router = new WorkflowCapabilityRouter([
      {
        binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
        port: { execute: handoffExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
        port: { execute: messageExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
        port: { execute: tagQueryExecute } as unknown as WorkflowCapabilityPort,
      },
    ]);
    const request = messageRequest();

    await expect(router.execute(
      WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition,
      request,
    )).resolves.toEqual({});
    expect(messageExecute).toHaveBeenCalledWith(
      WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition,
      request,
    );
    expect(handoffExecute).not.toHaveBeenCalled();
    expect(tagQueryExecute).not.toHaveBeenCalled();
    expect(router.bindings).toEqual([
      WORKFLOW_HANDOFF_CAPABILITY_BINDING,
      WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
    ]);
  });

  it("dispatches Handoff only to its exact action route", async () => {
    const handoffExecute = vi.fn(async () => ({}));
    const messageExecute = vi.fn(async () => ({}));
    const router = new WorkflowCapabilityRouter([
      {
        binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
        port: { execute: handoffExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
        port: { execute: messageExecute } as unknown as WorkflowCapabilityPort,
      },
    ]);
    const request = {
      ...messageRequest(),
      command: {
        customerMessage: "",
        operatorMessage: "需要人工处理",
        recipient: { thirdExternalUserId: "contact-1" },
        seatId: 101,
        source: "workflow" as const,
      },
      idempotencyKey: "9:run-1:handoff:1",
    };

    await expect(router.execute(
      WORKFLOW_HANDOFF_CAPABILITY_BINDING.definition,
      request,
    )).resolves.toEqual({});
    expect(handoffExecute).toHaveBeenCalledWith(
      WORKFLOW_HANDOFF_CAPABILITY_BINDING.definition,
      request,
    );
    expect(messageExecute).not.toHaveBeenCalled();
  });

  it("rejects missing routes and duplicate production registrations", async () => {
    const port = { execute: vi.fn() } as unknown as WorkflowCapabilityPort;
    const router = new WorkflowCapabilityRouter([
      { binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING, port },
    ]);

    await expect(router.execute(
      WORKFLOW_MESSAGE_CAPABILITY_BINDING.definition,
      {
        ...tagQueryRequest(),
        command: {
          attachments: [],
          content: "测试消息",
          recipient: { thirdExternalUserId: "contact-1" },
          seatId: 101,
          source: "workflow",
        },
        idempotencyKey: "9:run-1:message:1",
      },
    )).rejects.toMatchObject({
      code: "WORKFLOW_CAPABILITY_UNSUPPORTED",
      failureKind: "terminal",
    });

    expect(() => new WorkflowCapabilityRouter([
      { binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING, port },
      { binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING, port },
    ])).toThrow("Duplicate Workflow capability route");
  });
});

function tagQueryRequest() {
  return {
    command: { tagIds: [301] },
    deadlineAt: new Date("2026-08-20T10:00:15.000Z"),
    execution: {
      nodeId: "tag-query",
      revision: 1,
      runId: "run-1",
      sequence: 1,
      workflowId: "workflow-1",
    },
    identities: { externalUserId: 101 },
    signal: new AbortController().signal,
    subjectId: "contact-1",
    subjectType: "chatai_contact" as const,
    uid: 9,
  };
}

function messageRequest() {
  return {
    ...tagQueryRequest(),
    command: {
      attachments: [],
      content: "测试消息",
      recipient: { thirdExternalUserId: "contact-1" },
      seatId: 101,
      source: "workflow" as const,
    },
    idempotencyKey: "9:run-1:message:1",
  };
}

import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
  WORKFLOW_HANDOFF_CAPABILITY_BINDING,
  WORKFLOW_MESSAGE_CAPABILITY_BINDING,
  WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
  WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
  WORKFLOW_TAG_CAPABILITY_BINDING,
  WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
  type WorkflowCapabilityPort,
} from "@chatai/workflow-runtime";
import { WorkflowCapabilityRouter } from "../src/capability-router.js";

describe("Workflow capability router", () => {
  it.each([
    {
      binding: WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
      distractor: WORKFLOW_TAG_CAPABILITY_BINDING,
      name: "Tag Query",
      request: () => tagQueryRequest(),
      result: { matchedTags: [] },
    },
    {
      binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      distractor: WORKFLOW_TAG_CAPABILITY_BINDING,
      name: "Customer Update",
      request: () => ({
        ...tagQueryRequest(),
        command: {
          source: "workflow" as const,
          updates: [{ fieldId: 301, fieldType: 1 as const, value: "重点客户" }],
        },
        idempotencyKey: "9:run-1:customer-update:1",
      }),
      result: {},
    },
    {
      binding: WORKFLOW_TAG_CAPABILITY_BINDING,
      distractor: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      name: "Tag",
      request: () => ({
        ...tagQueryRequest(),
        command: { operation: "add" as const, source: "workflow" as const, tagIds: [301] },
        idempotencyKey: "9:run-1:tag:1",
      }),
      result: {},
    },
    {
      binding: WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
      distractor: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      name: "Order Conversion",
      request: () => ({
        ...tagQueryRequest(),
        command: { orderNumber: "SO20260824001", source: "workflow" as const },
        identities: { mallUserId: 202 },
        idempotencyKey: "9:run-1:order-conversion:1",
      }),
      result: { result: true },
    },
    {
      binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      distractor: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      name: "Order Bind",
      request: () => ({
        ...tagQueryRequest(),
        command: { orderNumber: "SO20260821001", source: "workflow" as const },
        identities: { externalUserId: 101 },
        idempotencyKey: "9:run-1:order-bind:1",
      }),
      result: { result: true },
    },
    {
      binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
      distractor: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      name: "Handoff",
      request: () => ({
        ...messageRequest(),
        command: {
          customerMessage: "",
          operatorMessage: "需要人工处理",
          recipient: { thirdExternalUserId: "contact-1" },
          seatId: 101,
          source: "workflow" as const,
        },
        idempotencyKey: "9:run-1:handoff:1",
      }),
      result: {},
    },
  ])("dispatches $name only to its exact capability route", async ({
    binding,
    distractor,
    request,
    result,
  }) => {
    const execute = vi.fn(async () => result);
    const distractorExecute = vi.fn(async () => ({}));
    const router = new WorkflowCapabilityRouter([
      { binding, port: { execute } as unknown as WorkflowCapabilityPort },
      { binding: distractor, port: { execute: distractorExecute } as unknown as WorkflowCapabilityPort },
    ]);
    const capabilityRequest = request();

    await expect(router.execute(binding.definition, capabilityRequest)).resolves.toEqual(result);
    expect(execute).toHaveBeenCalledWith(binding.definition, capabilityRequest);
    expect(distractorExecute).not.toHaveBeenCalled();
    expect(router.bindings).toEqual([binding, distractor]);
  });

  it("keeps Customer Update, Handoff, Message, Order Bind, Order Conversion, Tag, and Tag Query routes isolated", async () => {
    const customerUpdateExecute = vi.fn(async () => ({}));
    const handoffExecute = vi.fn(async () => ({}));
    const messageExecute = vi.fn(async () => ({}));
    const orderConversionExecute = vi.fn(async () => ({ result: true }));
    const orderBindExecute = vi.fn(async () => ({ result: true }));
    const tagExecute = vi.fn(async () => ({}));
    const tagQueryExecute = vi.fn(async () => ({ matchedTags: [] }));
    const router = new WorkflowCapabilityRouter([
      {
        binding: WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
        port: { execute: customerUpdateExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_HANDOFF_CAPABILITY_BINDING,
        port: { execute: handoffExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_MESSAGE_CAPABILITY_BINDING,
        port: { execute: messageExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
        port: { execute: orderConversionExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
        port: { execute: orderBindExecute } as unknown as WorkflowCapabilityPort,
      },
      {
        binding: WORKFLOW_TAG_CAPABILITY_BINDING,
        port: { execute: tagExecute } as unknown as WorkflowCapabilityPort,
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
    expect(customerUpdateExecute).not.toHaveBeenCalled();
    expect(handoffExecute).not.toHaveBeenCalled();
    expect(orderConversionExecute).not.toHaveBeenCalled();
    expect(orderBindExecute).not.toHaveBeenCalled();
    expect(tagExecute).not.toHaveBeenCalled();
    expect(tagQueryExecute).not.toHaveBeenCalled();
    expect(router.bindings).toEqual([
      WORKFLOW_CUSTOMER_UPDATE_CAPABILITY_BINDING,
      WORKFLOW_HANDOFF_CAPABILITY_BINDING,
      WORKFLOW_MESSAGE_CAPABILITY_BINDING,
      WORKFLOW_ORDER_CONVERSION_CAPABILITY_BINDING,
      WORKFLOW_ORDER_BIND_CAPABILITY_BINDING,
      WORKFLOW_TAG_CAPABILITY_BINDING,
      WORKFLOW_TAG_QUERY_CAPABILITY_BINDING,
    ]);
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

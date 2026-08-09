import type { WorkflowEntryCommand } from "@chatai/contracts";
import { WorkflowRuntimeError, type WorkflowTriggerBindingRecord } from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { FakeWorkflowBroker } from "../src/broker/fake.js";
import { createEntryConsumerHandler, startEntryConsumer } from "../src/entry-consumer.js";
import { createBrokerMessage } from "./helpers/broker-message.js";

describe("workflow entry consumer", () => {
  it("fans one event out to every matching active workflow and ACKs after admission", async () => {
    const bindings = [binding("31"), binding("32")];
    const startRun = vi.fn(async () => ({ kind: "success" }));
    const message = createBrokerMessage(command());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => bindings) },
      runtimeService: { startRun },
    });

    await handler(message);

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entryEventId: "event-1",
      expectedRevision: 2,
      subjectId: "external-user-1",
      workflowId: "31",
    }));
    expect(message.ack).toHaveBeenCalledTimes(1);
    expect(message.negativeAck).not.toHaveBeenCalled();
  });

  it("ACKs nonmatching bindings and entry-policy rejection", async () => {
    const startRun = vi.fn(async () => ({ kind: "entry-policy-rejected" as const }));
    const message = createBrokerMessage(command({ accountId: "account-b" }));
    const handler = createEntryConsumerHandler({
      bindingReader: {
        listActiveTriggerBindings: vi.fn(async () => [
          binding("31"),
          binding("32", { accountIds: ["account-b"] }),
        ]),
      },
      runtimeService: { startRun },
    });

    await handler(message);

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("continues fan-out after one matched workflow becomes paused", async () => {
    const startRun = vi.fn()
      .mockRejectedValueOnce(new WorkflowRuntimeError("WORKFLOW_RUNTIME_PAUSED", "paused"))
      .mockResolvedValueOnce({ kind: "success" });
    const message = createBrokerMessage(command());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31"), binding("32")]) },
      runtimeService: { startRun },
    });

    await handler(message);

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(message.ack).toHaveBeenCalledTimes(1);
  });

  it("NACKs malformed messages and transient admission failures", async () => {
    const malformed = createBrokerMessage({ eventType: "unknown" });
    const transient = createBrokerMessage(command());
    const handler = createEntryConsumerHandler({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => [binding("31")]) },
      runtimeService: { startRun: vi.fn(async () => { throw new Error("database unavailable"); }) },
    });

    await handler(malformed);
    await handler(transient);

    expect(malformed.negativeAck).toHaveBeenCalledTimes(1);
    expect(transient.negativeAck).toHaveBeenCalledTimes(1);
    expect(malformed.ack).not.toHaveBeenCalled();
  });

  it("routes malformed entry messages to the DLQ after broker redelivery", async () => {
    const broker = new FakeWorkflowBroker();
    await startEntryConsumer({
      bindingReader: { listActiveTriggerBindings: vi.fn(async () => []) },
      broker,
      deadLetterTopic: "entry-dlq",
      maxRedeliverCount: 2,
      runtimeService: { startRun: vi.fn() },
      subscription: "entry-sub",
      topic: "entry",
    });

    await broker.publish({ data: Buffer.from("not-json"), topic: "entry" });
    await broker.drain();

    expect(broker.getPublished("entry-dlq")).toHaveLength(1);
    await broker.close();
  });
});

function command(overrides: Partial<WorkflowEntryCommand> = {}): WorkflowEntryCommand {
  return {
    accountId: "account-a",
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-07-11T00:00:00.000Z",
    subjectId: "external-user-1",
    thirdUserId: "external-user-1",
    triggerPayload: {},
    uid: "9",
    ...overrides,
  } as WorkflowEntryCommand;
}

function binding(
  workflowId: string,
  overrides: Partial<WorkflowTriggerBindingRecord["filter"]> = {},
): WorkflowTriggerBindingRecord {
  const now = new Date("2026-07-11T00:00:00.000Z");
  return {
    createdAt: now,
    eventType: "contact.friend_added",
    filter: {
      accountIds: ["account-a"],
      entryPolicy: { mode: "never" },
      triggers: [{ type: "contact.friend_added" }],
      ...overrides,
    },
    id: workflowId,
    revision: 2,
    status: 1,
    uid: 9,
    updatedAt: now,
    workflowId,
  };
}

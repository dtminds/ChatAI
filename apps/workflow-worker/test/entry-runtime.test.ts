import {
  createWorkflowEntryPartitionKey,
  type WorkflowEntryEvent,
  type WorkflowExecutionSpec,
} from "@chatai/contracts";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { startEntryConsumer } from "../src/entry-consumer.js";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";
import { createFakeWorkflowEventCatalog } from "./support/fake-workflow-event-catalog.js";

describe("Workflow Entry runtime composition", () => {
  it("fans one event out to matching Workflows and absorbs a repeated event through the Inbox", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const broker = new FakeWorkflowBroker();
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const findDefinition = vi.fn(async (_uid: number, workflowId: string) => ({
      bizStatus: 1 as const,
      publishedRevision: 1,
      runtimeStatus: "active" as const,
      statusReason: null,
      workflowType: workflowId === "32" ? "wecom_sop" as const : "chatai_sop" as const,
    }));
    const findRevision = vi.fn(async (_uid: number, workflowId: string) => ({
      executionSpec: executionSpec(workflowId),
      revision: 1,
      subjectType: workflowId === "32" ? "wecom_contact" as const : "chatai_contact" as const,
      workflowType: workflowId === "32" ? "wecom_sop" as const : "chatai_sop" as const,
    }));
    const service = new WorkflowRuntimeService({
      deactivateWorkflowForEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
      findDefinition,
      findRevision,
      findRuntimeSnapshots: vi.fn(async (uid, keys) => ({
        invalidKeys: [],
        snapshots: keys.map(({ revision, workflowId }) => ({
          definition: {
            bizStatus: 1 as const,
            publishedRevision: 1,
            runtimeStatus: "active" as const,
            statusReason: null,
            workflowType: workflowId === "32" ? "wecom_sop" as const : "chatai_sop" as const,
          },
          revision: {
            executionSpec: executionSpec(workflowId),
            revision,
            subjectType: workflowId === "32" ? "wecom_contact" as const : "chatai_contact" as const,
            workflowType: workflowId === "32" ? "wecom_sop" as const : "chatai_sop" as const,
          },
          uid,
          workflowId,
        })),
      })),
    }, repository, undefined, {
      clock: () => now,
      entitlementPort: {
        check: vi.fn(async () => ({ activeRunLimit: 10_000, entitled: true })),
      },
    });
    const bindings = [binding("31", "chatai_contact"), binding("32", "wecom_contact")];
    const bindingReader = {
      listActiveTriggerBindings: vi.fn(async () => bindings),
    };
    await startEntryConsumer({
      bindingReader,
      broker,
      deadLetterTopic: "entry-dlq",
      eventCatalog: createFakeWorkflowEventCatalog(),
      inboxRepository: repository,
      maxInFlight: 10,
      messageReader: { findById: vi.fn(async () => null) },
      now: () => now,
      runtimeService: service,
      subscriptionReader: repository,
      subscription: "entry-sub",
      topic: "entry",
    });

    const entryEvent = event();
    const message = {
      data: Buffer.from(JSON.stringify(entryEvent)),
      key: createWorkflowEntryPartitionKey(entryEvent),
      topic: "entry",
    };
    await broker.publish(message);
    await broker.drain();
    await broker.publish(message);
    await broker.drain();

    expect(repository.snapshot()).toMatchObject({
      inbox: [{ consumer: "workflow-entry", messageId: "9:event-1", uid: 9 }],
      outbox: [expect.any(Object), expect.any(Object)],
      runs: [
        { subjectId: "chatai_external_456", subjectType: "chatai_contact", workflowId: "31" },
        { subjectId: "3267", subjectType: "wecom_contact", workflowId: "32" },
      ],
      tasks: [expect.any(Object), expect.any(Object)],
    });
    expect(bindingReader.listActiveTriggerBindings).toHaveBeenCalledTimes(1);
    expect(findDefinition).not.toHaveBeenCalled();
    expect(findRevision).not.toHaveBeenCalled();
    await broker.close();
  });
});

function executionSpec(workflowId: string): WorkflowExecutionSpec {
  return {
    edges: [{ id: `${workflowId}-start-end`, source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: workflowId === "32"
          ? {
              entryPolicy: { mode: "never" },
              triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
              workUserIds: [201],
            }
          : {
              entryPolicy: { mode: "never" },
              seatIds: [101],
              triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
            },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
      },
    ],
    schemaVersion: 1,
  };
}

function event(): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-08-10T00:00:00.000Z",
    payload: {
      externalUserId: 3267,
      seatId: 101,
      sourceIds: ["1", "1_1", "1_1_10132"],
      thirdExternalUserId: "chatai_external_456",
      workUserId: 201,
    },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "wecom",
    uid: 9,
  };
}

function binding(
  workflowId: string,
  subjectType: WorkflowTriggerBindingRecord["subjectType"],
): WorkflowTriggerBindingRecord {
  return {
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    eventType: "contact.friend_added",
    filter: {
      entryPolicy: { mode: "never" },
      eventType: "contact.friend_added",
      sourceIds: ["1_1_10132"],
      workUserIds: [201],
    },
    id: workflowId,
    revision: 1,
    status: 1,
    subjectType,
    uid: 9,
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    workflowId,
  };
}

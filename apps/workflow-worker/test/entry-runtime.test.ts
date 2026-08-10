import {
  createWorkflowEntryPartitionKey,
  type WorkflowEntryEvent,
  type WorkflowExecutionSpec,
} from "@chatai/contracts";
import {
  createWorkflowDeploymentCapabilities,
} from "@chatai/workflow-engine";
import {
  InMemoryWorkflowRuntimeRepository,
  WorkflowRuntimeService,
  type WorkflowTriggerBindingRecord,
} from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { startEntryConsumer } from "../src/entry-consumer.js";
import { FakeWorkflowBroker } from "./support/fake-workflow-broker.js";
import { createFakeWorkflowEventCatalog } from "./support/fake-workflow-event-catalog.js";

const ENTRY_CAPABILITY = {
  capabilityKey: "event.contact.friend_added",
  contractVersion: 1,
} as const;

describe("Workflow Entry runtime composition", () => {
  it("fans one event out to matching Workflows and absorbs a repeated event through the Inbox", async () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const broker = new FakeWorkflowBroker();
    const repository = new InMemoryWorkflowRuntimeRepository(undefined, () => now);
    const service = new WorkflowRuntimeService({
      applyEntitlementLoss: vi.fn(async () => ({ affectedDefinitions: 0 })),
      findDefinition: vi.fn(async () => ({
        bizStatus: 1 as const,
        publishedRevision: 1,
        runtimeStatus: "active" as const,
        statusReason: null,
        workflowType: "chatai_sop" as const,
      })),
      findRevision: vi.fn(async (_uid, workflowId) => ({
        executionSpec: executionSpec(workflowId),
        revision: 1,
        subjectType: "chatai_contact" as const,
        workflowType: "chatai_sop" as const,
      })),
    }, repository, undefined, {
      clock: () => now,
      deploymentCapabilities: createWorkflowDeploymentCapabilities([ENTRY_CAPABILITY]),
      entitlementPort: {
        check: vi.fn(async () => ({ entitled: true, unentitledSince: null })),
      },
    });
    const bindings = [binding("31"), binding("32")];
    const bindingReader = {
      listActiveTriggerBindings: vi.fn(async () => bindings),
    };
    await startEntryConsumer({
      bindingReader,
      broker,
      deadLetterTopic: "entry-dlq",
      eventCatalog: createFakeWorkflowEventCatalog(),
      inboxRepository: repository,
      now: () => now,
      runtimeService: service,
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
        { subjectId: "external-user-1", subjectType: "chatai_contact", workflowId: "31" },
        { subjectId: "external-user-1", subjectType: "chatai_contact", workflowId: "32" },
      ],
      tasks: [expect.any(Object), expect.any(Object)],
    });
    expect(bindingReader.listActiveTriggerBindings).toHaveBeenCalledTimes(1);
    await broker.close();
  });
});

function executionSpec(workflowId: string): WorkflowExecutionSpec {
  return {
    edges: [{ id: `${workflowId}-start-end`, source: "start", sourceOutletId: "default", target: "end" }],
    entryNodeId: "start",
    nodes: [
      {
        config: {
          accountIds: ["account-a"],
          entryPolicy: { mode: "never" },
          triggers: [{ type: "contact.friend_added" }],
        },
        id: "start",
        kind: "start",
        nodeSchemaVersion: 1,
        requiredCapabilities: [ENTRY_CAPABILITY],
      },
      {
        config: {},
        id: "end",
        kind: "end",
        nodeSchemaVersion: 1,
        requiredCapabilities: [],
      },
    ],
    requiredCapabilities: [ENTRY_CAPABILITY],
    schemaVersion: 1,
  };
}

function event(): WorkflowEntryEvent {
  return {
    eventId: "event-1",
    eventType: "contact.friend_added",
    occurredAt: "2026-08-10T00:00:00.000Z",
    payload: { accountId: "account-a" },
    payloadVersion: 1,
    schemaVersion: 1,
    source: "worker-test",
    subjectId: "external-user-1",
    subjectType: "chatai_contact",
    uid: 9,
  };
}

function binding(workflowId: string): WorkflowTriggerBindingRecord {
  return {
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
    eventType: "contact.friend_added",
    filter: {
      accountIds: ["account-a"],
      entryPolicy: { mode: "never" },
      triggers: [{ type: "contact.friend_added" }],
    },
    id: workflowId,
    revision: 1,
    status: 1,
    subjectType: "chatai_contact",
    uid: 9,
    updatedAt: new Date("2026-08-10T00:00:00.000Z"),
    workflowId,
  };
}

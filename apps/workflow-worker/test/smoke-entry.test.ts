import type { WorkflowTriggerBindingRecord } from "@chatai/workflow-runtime";
import { describe, expect, it, vi } from "vitest";
import { publishWorkflowEntrySmoke } from "../src/smoke-entry.js";

describe("workflow entry smoke producer", () => {
  it.each([
    {
      eventType: "contact.friend_added" as const,
      expectedPayload: { source: "workflow-smoke" },
      trigger: { type: "contact.friend_added" as const },
    },
    {
      eventType: "customer.tag_added" as const,
      expectedPayload: { tagId: "tag-1" },
      trigger: { tagIds: ["tag-1"], type: "customer.tag_added" as const },
    },
    {
      eventType: "message.received" as const,
      expectedPayload: {
        messageId: "smoke-message-smoke-event-1",
        messageType: "text",
        text: "workflow smoke",
      },
      trigger: { match: "any" as const, type: "message.received" as const },
    },
    {
      eventType: "message.received" as const,
      expectedPayload: {
        messageId: "smoke-message-smoke-event-1",
        messageType: "text",
        text: "special offer",
      },
      trigger: {
        keywords: ["special offer"],
        match: "keywords" as const,
        type: "message.received" as const,
      },
    },
  ])("publishes a matching $eventType entry command without workflowId", async ({
    eventType,
    expectedPayload,
    trigger,
  }) => {
    const broker = { publish: vi.fn(async () => ({ messageId: "broker-1" })) };

    const result = await publishWorkflowEntrySmoke({
      binding: binding(eventType, trigger),
      broker,
      eventId: "smoke-event-1",
      now: new Date("2026-07-11T00:00:00.000Z"),
      subjectId: "third-user-1",
      topic: "topic-workflow-entry-dev",
    });

    expect(result).toEqual({ eventId: "smoke-event-1", messageId: "broker-1" });
    const published = broker.publish.mock.calls[0]![0];
    const command = JSON.parse(published.data.toString("utf8"));
    expect(command).toMatchObject({
      accountId: "managed-account-1",
      eventId: "smoke-event-1",
      eventType,
      subjectId: "third-user-1",
      thirdUserId: "third-user-1",
      triggerPayload: expectedPayload,
      uid: "9",
    });
    expect(command).not.toHaveProperty("workflowId");
    expect(published.key).toBe("third-user-1");
  });
});

function binding(
  eventType: WorkflowTriggerBindingRecord["eventType"],
  trigger: WorkflowTriggerBindingRecord["filter"]["triggers"][number],
): WorkflowTriggerBindingRecord {
  const now = new Date("2026-07-11T00:00:00.000Z");
  return {
    createdAt: now,
    eventType,
    filter: {
      accountIds: ["managed-account-1"],
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: [trigger],
    },
    id: "3",
    revision: 1,
    status: 1,
    uid: 9,
    updatedAt: now,
    workflowId: "31",
  };
}

import { describe, expect, it } from "vitest";
import {
  getWorkflowTriggerBindings,
  matchWorkflowTrigger,
  normalizeWorkflowStartConfig,
} from "../src/index.js";

const startConfig = {
  accountIds: ["account-a", "account-b"],
  entryPolicy: {
    maxEntries: 2,
    mode: "rolling_window" as const,
    windowSize: 7,
    windowUnit: "day" as const,
  },
  triggers: [
    { type: "contact.friend_added" as const },
    { tagIds: ["tag-vip", "tag-lead"], type: "customer.tag_added" as const },
    { keywords: [" 优惠 ", "VIP"], match: "keywords" as const, type: "message.received" as const },
  ],
};

describe("workflow trigger matching", () => {
  it("matches account-scoped events with OR semantics", () => {
    expect(matchWorkflowTrigger(startConfig, command({
      eventType: "customer.tag_added",
      triggerPayload: { tagId: "tag-vip" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, command({
      eventType: "message.received",
      triggerPayload: { messageId: "message-1", messageType: "text", text: "A vip OFFER" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, command({
      accountId: "account-c",
      eventType: "message.received",
      thirdUserId: "external-user-2",
      triggerPayload: { messageId: "message-2", messageType: "text", text: "VIP" },
    }))).toBe(false);
  });

  it("uses literal keyword matching and ignores non-text messages", () => {
    expect(matchWorkflowTrigger(startConfig, command({
      eventType: "message.received",
      triggerPayload: { messageId: "message-3", messageType: "text", text: "[VIP] customer" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, command({
      eventType: "message.received",
      triggerPayload: { messageId: "message-4", messageType: "image", text: "VIP" },
    }))).toBe(false);
  });

  it("normalizes keywords and creates one canonical binding per event type", () => {
    const normalized = normalizeWorkflowStartConfig(startConfig);
    expect(normalized.triggers.at(-1)).toMatchObject({ keywords: ["优惠", "VIP"] });
    expect(getWorkflowTriggerBindings(startConfig).map(binding => binding.eventType)).toEqual([
      "contact.friend_added",
      "customer.tag_added",
      "message.received",
    ]);
  });
});

function command(overrides: Record<string, unknown>) {
  return {
    accountId: "account-a",
    eventId: "event-1",
    eventType: "contact.friend_added" as const,
    occurredAt: "2026-07-11T00:00:00.000Z",
    subjectId: "external-user-1",
    thirdUserId: "external-user-1",
    triggerPayload: {},
    uid: "9",
    ...overrides,
  };
}

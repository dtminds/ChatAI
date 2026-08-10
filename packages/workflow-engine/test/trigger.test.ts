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
    { tagIds: ["tag-vip", "tag-lead"], type: "contact.tag_added" as const },
    { keywords: [" 优惠 ", "VIP"], match: "keywords" as const, type: "message.received" as const },
  ],
};

describe("workflow trigger matching", () => {
  it("matches account-scoped events with OR semantics", () => {
    expect(matchWorkflowTrigger(startConfig, projection({
      eventType: "contact.tag_added",
      match: { accountId: "account-a", tagId: "tag-vip" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, projection({
      eventType: "message.received",
      match: { accountId: "account-a", messageType: "text", text: "A vip OFFER" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, projection({
      eventType: "message.received",
      match: { accountId: "account-c", messageType: "text", text: "VIP" },
    }))).toBe(false);
  });

  it("uses literal keyword matching and ignores non-text messages", () => {
    expect(matchWorkflowTrigger(startConfig, projection({
      eventType: "message.received",
      match: { accountId: "account-a", messageType: "text", text: "[VIP] customer" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(startConfig, projection({
      eventType: "message.received",
      match: { accountId: "account-a", messageType: "image", text: "VIP" },
    }))).toBe(false);
  });

  it("normalizes keywords and creates one canonical binding per event type", () => {
    const normalized = normalizeWorkflowStartConfig(startConfig);
    expect(normalized.triggers.at(-1)).toMatchObject({ keywords: ["优惠", "VIP"] });
    const bindings = getWorkflowTriggerBindings(startConfig, "chatai_contact");
    expect(bindings.map(binding => binding.eventType)).toEqual([
      "contact.friend_added",
      "contact.tag_added",
      "message.received",
    ]);
    expect(bindings.every(binding => binding.subjectType === "chatai_contact")).toBe(true);
  });
});

function projection(overrides: Record<string, unknown>) {
  return {
    eventType: "contact.friend_added" as const,
    match: { accountId: "account-a" },
    variables: {},
    ...overrides,
  };
}

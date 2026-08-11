import { describe, expect, it } from "vitest";
import {
  getWorkflowTriggerBindings,
  matchWorkflowTrigger,
  normalizeWorkflowStartConfig,
} from "../src/index.js";

const startConfig = {
  entryPolicy: {
    maxEntries: 2,
    mode: "rolling_window" as const,
    windowSize: 7,
    windowUnit: "day" as const,
  },
  seatIds: [101, 102],
  triggers: [
    { type: "contact.friend_added" as const },
    { tagIds: [301, 302], type: "contact.tag_added" as const },
    { match: "any" as const, type: "message.received" as const },
  ],
};

describe("workflow trigger matching", () => {
  const bindings = getWorkflowTriggerBindings(startConfig, "chatai_contact", {
    resolvedWorkUserIds: [201, 202],
  });

  it("matches contact events by WeCom member and exact tag", () => {
    const tagBinding = requireBinding("contact.tag_added");
    expect(matchWorkflowTrigger(tagBinding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 201 },
    }))).toBe(true);
    expect(matchWorkflowTrigger(tagBinding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 999, workUserId: 201 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(tagBinding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 999 },
    }))).toBe(false);
  });

  it("matches message events by ChatAI seat", () => {
    const messageBinding = requireBinding("message.received");
    expect(matchWorkflowTrigger(messageBinding.filter, projection({
      eventType: "message.received",
      match: { seatId: 101 },
    }))).toBe(true);
    expect(matchWorkflowTrigger(messageBinding.filter, projection({
      eventType: "message.received",
      match: { seatId: 999 },
    }))).toBe(false);
  });

  it("normalizes numeric identities and creates one structured binding per event type", () => {
    const normalized = normalizeWorkflowStartConfig({
      ...startConfig,
      seatIds: [101, 101, 102],
      triggers: [
        { tagIds: [301, 301, 302], type: "contact.tag_added" as const },
      ],
    });
    expect("seatIds" in normalized ? normalized.seatIds : []).toEqual([101, 102]);
    expect(normalized.triggers[0]).toMatchObject({ tagIds: [301, 302] });
    expect(bindings.map(binding => binding.eventType)).toEqual([
      "contact.friend_added",
      "contact.tag_added",
      "message.received",
    ]);
    expect(requireBinding("contact.friend_added").filter).toEqual({
      entryPolicy: startConfig.entryPolicy,
      eventType: "contact.friend_added",
      workUserIds: [201, 202],
    });
  });

  function requireBinding(eventType: typeof bindings[number]["eventType"]) {
    const binding = bindings.find(item => item.eventType === eventType);
    if (!binding) throw new Error(`Missing binding: ${eventType}`);
    return binding;
  }
});

function projection(overrides: Record<string, unknown>) {
  return {
    eventType: "contact.friend_added" as const,
    match: { workUserId: 201 },
    subjects: {},
    variables: {},
    ...overrides,
  };
}

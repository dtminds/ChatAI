import type { WorkflowStartConfig } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  getWorkflowTriggerBinding,
  matchWorkflowTrigger,
  normalizeWorkflowStartConfig,
} from "../src/index.js";

const entryPolicy = {
  maxEntries: 2,
  mode: "rolling_window" as const,
  windowSize: 7,
  windowUnit: "day" as const,
};

describe("workflow trigger matching", () => {
  it("matches friend-added events by member and optional exact source", () => {
    const anySource = friendBinding([]);
    expect(matchWorkflowTrigger(anySource.filter, projection({
      eventType: "contact.friend_added",
      match: { workUserId: 201 },
    }))).toBe(true);

    const selectedSources = friendBinding(["qr-code-1", "store-2"]);
    expect(matchWorkflowTrigger(selectedSources.filter, projection({
      eventType: "contact.friend_added",
      match: { sourceId: "qr-code-1", workUserId: 201 },
    }))).toBe(true);
    expect(matchWorkflowTrigger(selectedSources.filter, projection({
      eventType: "contact.friend_added",
      match: { sourceId: "other", workUserId: 201 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(selectedSources.filter, projection({
      eventType: "contact.friend_added",
      match: { workUserId: 201 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(selectedSources.filter, projection({
      eventType: "contact.friend_added",
      match: { sourceId: "qr-code-1", workUserId: 999 },
    }))).toBe(false);
  });

  it("matches tag events by member and exact tag", () => {
    const binding = getWorkflowTriggerBinding({
      entryPolicy,
      seatIds: [101],
      triggers: [{ tagIds: [301, 302], type: "contact.tag_added" }],
    }, "chatai_contact", { resolvedWorkUserIds: [201, 202] });

    expect(matchWorkflowTrigger(binding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 201 },
    }))).toBe(true);
    expect(matchWorkflowTrigger(binding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 999, workUserId: 201 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(binding.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 999 },
    }))).toBe(false);
  });

  it("matches message events by seat and optional keyword", () => {
    const anyMessage = messageBinding([]);
    expect(matchWorkflowTrigger(anyMessage.filter, projection({
      eventType: "message.received",
      match: { seatId: 101 },
    }))).toBe(true);

    const keywords = messageBinding(["价格", "优惠"]);
    expect(matchWorkflowTrigger(keywords.filter, projection({
      eventType: "message.received",
      match: { seatId: 101, text: "请问现在有什么优惠" },
    }))).toBe(true);
    expect(matchWorkflowTrigger(keywords.filter, projection({
      eventType: "message.received",
      match: { seatId: 101, text: "你好" },
    }))).toBe(false);
    expect(matchWorkflowTrigger(keywords.filter, projection({
      eventType: "message.received",
      match: { seatId: 101 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(keywords.filter, projection({
      eventType: "message.received",
      match: { seatId: 999, text: "价格" },
    }))).toBe(false);
  });

  it("normalizes the single trigger and creates one complete binding", () => {
    const normalized = normalizeWorkflowStartConfig({
      entryPolicy,
      seatIds: [101, 101, 102],
      triggers: [{ keywords: [" 价格 ", "价格", "优惠"], type: "message.received" }],
    });
    expect("seatIds" in normalized ? normalized.seatIds : []).toEqual([101, 102]);
    expect(normalized.triggers).toEqual([{
      keywords: ["价格", "优惠"],
      type: "message.received",
    }]);
    expect(getWorkflowTriggerBinding(normalized, "chatai_contact")).toEqual({
      eventType: "message.received",
      filter: {
        entryPolicy,
        eventType: "message.received",
        keywords: ["价格", "优惠"],
        seatIds: [101, 102],
      },
      subjectType: "chatai_contact",
    });
  });

  it("rejects malformed multi-event data at binding generation", () => {
    const malformed = {
      entryPolicy,
      seatIds: [101],
      triggers: [
        { sourceIds: [], type: "contact.friend_added" },
        { keywords: [], type: "message.received" },
      ],
    } as unknown as WorkflowStartConfig;

    expect(() => getWorkflowTriggerBinding(malformed, "chatai_contact"))
      .toThrow("Start configuration requires exactly one trigger");
  });
});

function friendBinding(sourceIds: string[]) {
  return getWorkflowTriggerBinding({
    entryPolicy,
    seatIds: [101],
    triggers: [{ sourceIds, type: "contact.friend_added" }],
  }, "chatai_contact", { resolvedWorkUserIds: [201, 202] });
}

function messageBinding(keywords: string[]) {
  return getWorkflowTriggerBinding({
    entryPolicy,
    seatIds: [101, 102],
    triggers: [{ keywords, type: "message.received" }],
  }, "chatai_contact");
}

function projection(overrides: Record<string, unknown>) {
  return {
    eventType: "contact.friend_added" as const,
    match: { workUserId: 201 },
    subjects: {},
    variables: {},
    ...overrides,
  };
}

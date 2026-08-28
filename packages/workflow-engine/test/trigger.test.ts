import type { WorkflowStartConfig } from "@chatai/contracts";
import { describe, expect, it } from "vitest";
import {
  getWorkflowTriggerBindings,
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
  it("fails closed when a friend-added binding has no source", () => {
    const anySource = friendBinding([]);
    expect(matchWorkflowTrigger(anySource.filter, projection({
      eventType: "contact.friend_added",
      match: { workUserId: 201 },
    }))).toBe(false);
  });

  it("matches friend-added events by member and exact source", () => {
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
    const [binding] = getWorkflowTriggerBindings({
      entryPolicy,
      seatIds: [101],
      triggers: [{ tagIds: [301, 302], type: "contact.tag_added" }],
    }, "chatai_contact", { resolvedWorkUserIds: [201, 202] });

    expect(matchWorkflowTrigger(binding!.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 201 },
    }))).toBe(true);
    expect(matchWorkflowTrigger(binding!.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 999, workUserId: 201 },
    }))).toBe(false);
    expect(matchWorkflowTrigger(binding!.filter, projection({
      eventType: "contact.tag_added",
      match: { tagId: 301, workUserId: 999 },
    }))).toBe(false);
  });

  it("matches message events by seat and keyword", () => {
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

  it("fails closed when a message binding has no keywords", () => {
    expect(matchWorkflowTrigger(messageBinding([]).filter, projection({
      eventType: "message.received",
      match: { seatId: 101, text: "价格" },
    }))).toBe(false);
  });

  it("normalizes the single trigger and creates one complete binding", () => {
    const normalized = normalizeWorkflowStartConfig({
      entryPolicy,
      seatIds: [101, 101, 102],
      triggers: [{ keywords: [" 价格 ", "价格", "优惠"], type: "message.received" }],
    });
    expect("seatIds" in normalized ? normalized.seatIds : []).toEqual([101, 102]);
    expect(normalized.entryMode).toBe("event");
    expect("messageSendingWindow" in normalized ? normalized.messageSendingWindow : undefined)
      .toEqual({ endTime: "20:00", startTime: "09:00" });
    expect(normalized.triggers).toEqual([{
      keywords: ["价格", "优惠"],
      type: "message.received",
    }]);
    expect(getWorkflowTriggerBindings(normalized, "chatai_contact")).toEqual([{
      eventType: "message.received",
      filter: {
        entryPolicy,
        eventType: "message.received",
        keywords: ["价格", "优惠"],
        seatIds: [101, 102],
      },
      subjectType: "chatai_contact",
    }]);
  });

  it("preserves the configured ChatAI sending window during normalization", () => {
    const normalized = normalizeWorkflowStartConfig({
      entryPolicy,
      messageSendingWindow: { endTime: "22:30", startTime: "10:15" },
      seatIds: [101],
      triggers: [{ sourceIds: ["qr-code-1"], type: "contact.friend_added" }],
    });

    expect(normalized).toEqual(expect.objectContaining({
      messageSendingWindow: { endTime: "22:30", startTime: "10:15" },
    }));
  });

  it("does not create trigger bindings for audience imports", () => {
    const config: WorkflowStartConfig = {
      entryMode: "audience-import",
      entryPolicy,
      seatIds: [101],
      triggers: [],
    };

    expect(normalizeWorkflowStartConfig(config)).toEqual(expect.objectContaining({
      entryMode: "audience-import",
      triggers: [],
    }));
    expect(getWorkflowTriggerBindings(config, "chatai_contact")).toEqual([]);
  });

  it("creates a direct-entry binding from resolved ChatAI work users", () => {
    const config: WorkflowStartConfig = {
      entryMode: "direct-push",
      entryPolicy,
      seatIds: [101],
      triggers: [],
    };

    expect(getWorkflowTriggerBindings(config, "chatai_contact", {
      resolvedWorkUserIds: [201, 202, 201],
    })).toEqual([{
      eventType: "workflow.direct_entry",
      filter: {
        entryPolicy,
        eventType: "workflow.direct_entry",
        workUserIds: [201, 202],
      },
      subjectType: "chatai_contact",
    }]);
  });

  it("creates a direct-entry binding from configured WeCom work users", () => {
    const config: WorkflowStartConfig = {
      entryMode: "direct-push",
      entryPolicy,
      triggers: [],
      workUserIds: [201, 202],
    };

    expect(getWorkflowTriggerBindings(config, "wecom_contact")).toEqual([{
      eventType: "workflow.direct_entry",
      filter: {
        entryPolicy,
        eventType: "workflow.direct_entry",
        workUserIds: [201, 202],
      },
      subjectType: "wecom_contact",
    }]);
  });

  it("projects each trigger independently when future contracts allow multiple events", () => {
    const malformed = {
      entryPolicy,
      seatIds: [101],
      triggers: [
        { sourceIds: ["qr-code-1"], type: "contact.friend_added" },
        { keywords: ["价格"], type: "message.received" },
      ],
    } as unknown as WorkflowStartConfig;

    expect(getWorkflowTriggerBindings(malformed, "chatai_contact", {
      resolvedWorkUserIds: [201],
    }).map(binding => binding.eventType))
      .toEqual(["contact.friend_added", "message.received"]);
  });
});

function friendBinding(sourceIds: string[]) {
  return getWorkflowTriggerBindings({
    entryPolicy,
    seatIds: [101],
    triggers: [{ sourceIds, type: "contact.friend_added" }],
  }, "chatai_contact", { resolvedWorkUserIds: [201, 202] })[0]!;
}

function messageBinding(keywords: string[]) {
  return getWorkflowTriggerBindings({
    entryPolicy,
    seatIds: [101, 102],
    triggers: [{ keywords, type: "message.received" }],
  }, "chatai_contact")[0]!;
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

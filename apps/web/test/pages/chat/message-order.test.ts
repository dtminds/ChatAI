import { describe, expect, it } from "vitest";
import { sortMessagesBySentAt } from "@/pages/chat/lib/message-order";

describe("sortMessagesBySentAt", () => {
  it("sorts valid timestamps first and uses seq as a stable fallback", () => {
    const messages = sortMessagesBySentAt([
      { sentAt: "2026-06-25 12:00:03", seq: 3, id: "late" },
      { sentAt: "2026-06-25 12:00:01", seq: 1, id: "early" },
      { sentAt: "2026-06-25 12:00:02", seq: 2, id: "middle" },
    ]);

    expect(messages.map((message) => message.id)).toEqual(["early", "middle", "late"]);
  });

  it("keeps invalid timestamps after valid timestamps", () => {
    const messages = sortMessagesBySentAt([
      { sentAt: "2026-06-25 12:00:03", seq: 3, id: "valid-late" },
      { sentAt: "not-a-date", seq: 1, id: "invalid" },
      { sentAt: "2026-06-25 12:00:01", seq: 2, id: "valid-early" },
    ]);

    expect(messages.map((message) => message.id)).toEqual([
      "valid-early",
      "valid-late",
      "invalid",
    ]);
  });

  it("handles malformed runtime sentAt values as invalid timestamps", () => {
    const malformedMessages = [
      { sentAt: null, seq: 1, id: "null" },
      { sentAt: undefined, seq: 2, id: "undefined" },
      { sentAt: 1_787_910_000_000, seq: 3, id: "number" },
      { sentAt: "2026-06-25 12:00:01", seq: 4, id: "valid" },
    ] as unknown as Array<{ sentAt: string; seq: number; id: string }>;
    const messages = sortMessagesBySentAt(malformedMessages);

    expect(messages.map((message) => message.id)).toEqual([
      "valid",
      "null",
      "undefined",
      "number",
    ]);
  });
});

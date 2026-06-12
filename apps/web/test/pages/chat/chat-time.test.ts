import { describe, expect, it } from "vitest";
import { formatTextMessageSentAt } from "@/pages/chat/lib/chat-time";

describe("formatTextMessageSentAt", () => {
  const now = new Date("2026-06-08T12:00:00");

  it("formats same-year timestamps without year or seconds, padding hours and minutes", () => {
    expect(formatTextMessageSentAt("2026-06-11 13:22:45", now)).toBe("6/11 13:22");
    expect(formatTextMessageSentAt("2026-05-08 09:54:00", now)).toBe("5/8 09:54");
    expect(formatTextMessageSentAt("2026-06-11 13:05:00", now)).toBe("6/11 13:05");
  });

  it("includes the year for timestamps outside the current year", () => {
    expect(formatTextMessageSentAt("2025-12-31 09:08:07", now)).toBe("2025/12/31 09:08");
  });

  it("falls back to the raw value when parsing fails", () => {
    expect(formatTextMessageSentAt("not-a-date", now)).toBe("not-a-date");
  });
});

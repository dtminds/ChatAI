import { describe, expect, it } from "vitest";

import { shouldPollSmartReplies } from "@/pages/chat/lib/smart-reply-polling";

describe("shouldPollSmartReplies", () => {
  it("polls when conversation has never been polled", () => {
    expect(shouldPollSmartReplies(undefined, 10_000, 5_000)).toBe(true);
  });

  it("skips poll inside the interval window", () => {
    expect(shouldPollSmartReplies(10_000, 14_999, 5_000)).toBe(false);
  });

  it("polls again once the interval has elapsed", () => {
    expect(shouldPollSmartReplies(10_000, 15_000, 5_000)).toBe(true);
  });
});

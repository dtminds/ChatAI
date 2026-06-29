import { describe, expect, it } from "vitest";

import { formatQuotaText, isQuotaReached } from "@/pages/chat/ai-hosting/quota-utils";

describe("AI hosting quota utils", () => {
  it("formats quota usage text with the provided unit", () => {
    expect(formatQuotaText({ limit: 20, used: 3 }, "个知识库")).toBe("已用 3/20 个知识库");
  });

  it("detects whether the quota has been reached", () => {
    expect(isQuotaReached(null)).toBe(false);
    expect(isQuotaReached({ limit: 5, used: 4 })).toBe(false);
    expect(isQuotaReached({ limit: 5, used: 5 })).toBe(true);
    expect(isQuotaReached({ limit: 5, used: 6 })).toBe(true);
  });
});

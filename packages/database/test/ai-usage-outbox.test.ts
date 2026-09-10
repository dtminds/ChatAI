import { describe, expect, it } from "vitest";
import {
  AI_USAGE_OUTBOX_BATCH_LIMIT,
  boundAiUsageOutboxBatchLimit,
} from "../src/index.js";

describe("AI usage outbox limits", () => {
  it("keeps database claim batches bounded", () => {
    expect(boundAiUsageOutboxBatchLimit(-1)).toBe(0);
    expect(boundAiUsageOutboxBatchLimit(0)).toBe(0);
    expect(boundAiUsageOutboxBatchLimit(1.9)).toBe(1);
    expect(boundAiUsageOutboxBatchLimit(AI_USAGE_OUTBOX_BATCH_LIMIT + 1)).toBe(
      AI_USAGE_OUTBOX_BATCH_LIMIT,
    );
  });
});

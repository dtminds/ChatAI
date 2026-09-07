// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  getPollingPausedDialogCopy,
  resolveStickyPollingPauseReason,
} from "@/pages/chat/lib/polling-pause";

describe("polling pause copy", () => {
  it("keeps other-tab copy distinct from cursor invalidation copy", () => {
    expect(getPollingPausedDialogCopy("other-tab").title).toBe(
      "实时同步已被其他页面占用",
    );
    expect(getPollingPausedDialogCopy("sync-gap").title).toBe("消息同步已暂停");
  });

  it("does not replace an existing pause reason with cursor invalidation", () => {
    expect(resolveStickyPollingPauseReason("other-tab", "sync-gap")).toBe(
      "other-tab",
    );
    expect(resolveStickyPollingPauseReason(null, "sync-gap")).toBe("sync-gap");
  });
});

import { describe, expect, it, vi } from "vitest";
import { InMemoryAltchaStore } from "../../../src/modules/auth/altcha.service.js";

describe("InMemoryAltchaStore", () => {
  it("checks expired records without pruning the whole store on every lookup", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-09T00:00:00.000Z"));
    const store = new InMemoryAltchaStore({
      pruneIntervalMs: 60_000,
      pruneSizeThreshold: 1000,
      ttlMs: 1,
    });

    store.markUsed("challenge-001");
    vi.advanceTimersByTime(2);

    expect(store.isUsed("challenge-001")).toBe(false);
    expect(store.size).toBe(1);

    vi.useRealTimers();
  });
});

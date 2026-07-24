import { describe, expect, it } from "vitest";
import { nextShanghaiRunAt, resolveCandidateSessionLimit } from "../../../../src/modules/ai-hosting/user-memory/user-memory-service.js";

describe("user memory service policies", () => {
  it("scales the candidate session limit with the customer quota", () => {
    expect(resolveCandidateSessionLimit(100)).toBe(200);
    expect(resolveCandidateSessionLimit(200)).toBe(400);
    expect(resolveCandidateSessionLimit(500)).toBe(1000);
  });

  it("schedules the next Asia/Shanghai 02:00 boundary", () => {
    expect(nextShanghaiRunAt(Date.parse("2026-07-24T01:00:00+08:00")).toISOString()).toBe("2026-07-23T18:00:00.000Z");
    expect(nextShanghaiRunAt(Date.parse("2026-07-24T03:00:00+08:00")).toISOString()).toBe("2026-07-24T18:00:00.000Z");
  });
});

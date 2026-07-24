import { describe, expect, it } from "vitest";
import { groupCandidateSessions } from "../../../../src/modules/ai-hosting/user-memory/user-memory-worker.js";

describe("user memory candidate grouping", () => {
  it("keeps first customer rank and all candidate-pool sessions in chronological order", () => {
    const groups = groupCandidateSessions([
      { id: 3, ended_at: 30, message_count: 10, platform: 5, third_external_userid: "a" },
      { id: 2, ended_at: 20, message_count: 9, platform: 5, third_external_userid: "b" },
      { id: 1, ended_at: 10, message_count: 8, platform: 5, third_external_userid: "a" },
    ]);
    expect(groups.map((group) => group.thirdExternalUserId)).toEqual(["a", "b"]);
    expect(groups[0]?.sessions.map((session) => session.id)).toEqual([1, 3]);
  });
});

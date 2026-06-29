import { describe, expect, it } from "vitest";
import { toKbListViewItem } from "@/pages/chat/ai-hosting/api/kb-service";

describe("kb-service time formatting", () => {
  it("formats kb list timestamps in Asia/Shanghai wall clock", () => {
    expect(
      toKbListViewItem({
        createdAt: "2026-06-19T14:02:22.000Z",
        description: "",
        kbId: "1",
        name: "测试知识库",
        updatedAt: "2026-06-20T14:02:22.000Z",
      }),
    ).toMatchObject({
      createdAt: "2026-06-19 22:02:22",
      lastUpdatedAt: "2026-06-20 22:02:22",
    });
  });
});

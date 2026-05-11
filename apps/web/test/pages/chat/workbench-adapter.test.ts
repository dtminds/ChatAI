import { describe, expect, it } from "vitest";
import { adaptConversation } from "@/pages/chat/api/workbench-adapter";
import type { WorkbenchConversationSummaryDto } from "@chatai/contracts";

describe("workbench adapter", () => {
  it("does not format zero conversation timestamps as epoch dates", () => {
    expect(
      adaptConversation({
        ...conversationDto,
        lastMessageTime: 0,
      }),
    ).toMatchObject({
      quietFor: "",
      updatedAt: "",
      updatedAtMs: undefined,
    });
  });
});

const conversationDto: WorkbenchConversationSummaryDto = {
  conversationId: "conversation-1",
  customerAvatar: "",
  customerId: "group-1",
  customerName: "测试群002",
  lastMessage: "",
  mode: "group",
  priority: "medium",
  seatId: "seat-1",
  thirdGroupId: "group-1",
  thirdUserId: "third-user-1",
  unreadCount: 0,
};

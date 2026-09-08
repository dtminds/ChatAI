import { describe, expect, it } from "vitest";
import { ticketCreatorText } from "@/pages/chat/tickets/ticket-display";

describe("ticketCreatorText", () => {
  it.each([
    ["manual", "客服甲", "客服甲"],
    ["ai", null, "AI"],
    ["workflow", null, "工作流"],
  ])("maps %s tickets to the visible creator label", (sourceType, displayName, expected) => {
    expect(ticketCreatorText(sourceType, displayName)).toBe(expected);
  });

  it("allows the conversation view to preserve its unknown-user fallback", () => {
    expect(ticketCreatorText("manual", null, "未知用户")).toBe("未知用户");
  });
});

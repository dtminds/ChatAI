// @vitest-environment node

import { describe, expect, it } from "vitest";
import { isConversationTicketSupported } from "@/pages/chat/tickets/conversation-ticket-policy";

describe("isConversationTicketSupported", () => {
  it("supports only normal single-customer conversations", () => {
    expect(isConversationTicketSupported({ customerBindType: 1, mode: "single" })).toBe(true);
    expect(isConversationTicketSupported({ customerBindType: 2, mode: "single" })).toBe(false);
    expect(isConversationTicketSupported({ customerBindType: undefined, mode: "single" })).toBe(false);
    expect(isConversationTicketSupported({ customerBindType: 1, mode: "group" })).toBe(false);
  });
});

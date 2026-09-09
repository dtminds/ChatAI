// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  createOpenConversationTarget,
  getRoutedConversationId,
  isConversationRoutePath,
  isOpenConversationLocationState,
  OPEN_CONVERSATION_LOCATION_STATE,
} from "@/pages/chat/lib/conversation-navigation";

describe("conversation navigation", () => {
  it("builds an intentional open target that the workbench can round-trip", () => {
    const target = createOpenConversationTarget("conv/002");

    expect(target.state).toEqual(OPEN_CONVERSATION_LOCATION_STATE);
    expect(isConversationRoutePath(target.pathname)).toBe(true);
    expect(getRoutedConversationId(target.pathname)).toBe("conv/002");
    expect(isOpenConversationLocationState(target.state)).toBe(true);
  });

  it("ignores chat paths that are not conversation routes", () => {
    expect(getRoutedConversationId("/chat")).toBeUndefined();
    expect(getRoutedConversationId("/chat/conversations/")).toBeUndefined();
    expect(isConversationRoutePath("/chat/tickets")).toBe(false);
  });

  it("does not treat unrelated location state as an open intent", () => {
    expect(isOpenConversationLocationState(null)).toBe(false);
    expect(isOpenConversationLocationState({ openConversation: false })).toBe(
      false,
    );
    expect(isOpenConversationLocationState({ from: "tickets" })).toBe(false);
  });
});

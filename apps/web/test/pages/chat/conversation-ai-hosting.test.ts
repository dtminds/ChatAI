import { describe, expect, it } from "vitest";
import { resolveConversationAIHostingPolicy } from "@/pages/chat/lib/conversation-ai-hosting";

describe("resolveConversationAIHostingPolicy", () => {
  it("allows enabling eligible single and group conversations", () => {
    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: true,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: false,
          customerBindType: 1,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisable: false,
      canEnable: true,
      canToggle: true,
      hasCapability: true,
      isConfiguredOn: false,
      isEffective: false,
      shouldShowControl: true,
    });

    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: false,
          seatGroupAIHostingEnabled: true,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: false,
          mode: "group",
        },
      }).canEnable,
    ).toBe(true);
  });

  it("keeps configured conversations disableable after capability is revoked", () => {
    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: true,
          customerBindType: 2,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisable: true,
      canEnable: false,
      canToggle: true,
      hasCapability: false,
      isConfiguredOn: true,
      isEffective: false,
      shouldShowControl: true,
    });
  });

  it("hides group AI dialog when group master switch is off", () => {
    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: true,
          mode: "group",
        },
      }),
    ).toEqual({
      canDisable: false,
      canEnable: false,
      canToggle: false,
      hasCapability: false,
      isConfiguredOn: true,
      isEffective: false,
      shouldShowControl: false,
    });
  });

  it("shows normal single controls for configuration but hides unavailable group controls", () => {
    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: false,
          customerBindType: 1,
          mode: "single",
        },
      }).shouldShowControl,
    ).toBe(true);

    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          conversationAIHostingSwitch: false,
          mode: "group",
        },
      }).shouldShowControl,
    ).toBe(false);
  });

  it("rejects both target actions when the conversation is not operable", () => {
    expect(
      resolveConversationAIHostingPolicy({
        account: {
          seatAIHostingEnabled: true,
          seatGroupAIHostingEnabled: true,
        },
        canUseConversationActions: false,
        conversation: {
          conversationAIHostingSwitch: true,
          mode: "group",
        },
      }),
    ).toMatchObject({
      canDisable: false,
      canEnable: false,
      canToggle: false,
      isConfiguredOn: true,
      isEffective: true,
    });
  });
});

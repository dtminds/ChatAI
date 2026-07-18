import { describe, expect, it } from "vitest";
import {
  isConversationAIAssistantSupported,
  resolveConversationAIAssistantEligibility,
} from "@/pages/chat/lib/conversation-ai-assistant";

describe("resolveConversationAIAssistantEligibility", () => {
  it("uses the matching single or group assistant capability", () => {
    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: false,
          customerBindType: 1,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisplay: true,
      canUse: true,
      hasCapability: true,
    });

    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: false,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: true,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: false,
          mode: "group",
        },
      }),
    ).toEqual({
      canDisplay: true,
      canUse: true,
      hasCapability: true,
    });
  });

  it("keeps display independent from current operator access", () => {
    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: false,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: false,
          customerBindType: 1,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisplay: true,
      canUse: false,
      hasCapability: true,
    });
  });

  it("blocks single smart replies during effective hosting but not group replies", () => {
    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: true,
          seatGroupAIAssistantEnabled: true,
          seatGroupAIHostingEnabled: true,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: true,
          customerBindType: 1,
          mode: "single",
        },
      }).canDisplay,
    ).toBe(false);

    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: true,
          seatGroupAIAssistantEnabled: true,
          seatGroupAIHostingEnabled: true,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: true,
          mode: "group",
        },
      }).canDisplay,
    ).toBe(true);
  });

  it("does not block single smart replies when hosting is configured but ineffective", () => {
    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: false,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: true,
          customerBindType: 1,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisplay: true,
      canUse: true,
      hasCapability: true,
    });
  });

  it("rejects inactive and unsupported conversations", () => {
    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: true,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 0,
          conversationAIHostingSwitch: false,
          customerBindType: 1,
          mode: "single",
        },
      }).canDisplay,
    ).toBe(false);

    expect(
      resolveConversationAIAssistantEligibility({
        account: {
          seatAIAssistantEnabled: true,
          seatAIHostingEnabled: false,
          seatGroupAIAssistantEnabled: true,
          seatGroupAIHostingEnabled: false,
        },
        canUseConversationActions: true,
        conversation: {
          bizStatus: 1,
          conversationAIHostingSwitch: false,
          customerBindType: 2,
          mode: "single",
        },
      }),
    ).toEqual({
      canDisplay: false,
      canUse: false,
      hasCapability: false,
    });
  });
});

describe("isConversationAIAssistantSupported", () => {
  it("supports groups and normal single conversations", () => {
    expect(isConversationAIAssistantSupported({ mode: "group" })).toBe(true);
    expect(
      isConversationAIAssistantSupported({
        customerBindType: 1,
        mode: "single",
      }),
    ).toBe(true);
    expect(
      isConversationAIAssistantSupported({
        customerBindType: 2,
        mode: "single",
      }),
    ).toBe(false);
  });
});

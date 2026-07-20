import type { Account, Conversation } from "@/pages/chat/chat-types";

export const CUSTOMER_BIND_TYPE_NORMAL = 1;

export function isConversationAIFeatureSupported(
  conversation: Pick<Conversation, "customerBindType" | "mode"> | undefined | null,
): boolean {
  return (
    conversation?.mode === "single" &&
    conversation.customerBindType === CUSTOMER_BIND_TYPE_NORMAL
  );
}

export type ConversationAIHostingPolicy = {
  canDisable: boolean;
  canEnable: boolean;
  canToggle: boolean;
  hasCapability: boolean;
  isConfiguredOn: boolean;
  isEffective: boolean;
  shouldShowControl: boolean;
};

export function resolveConversationAIHostingPolicy({
  account,
  canUseConversationActions,
  conversation,
}: {
  account: Pick<
    Account,
    "seatAIHostingEnabled" | "seatGroupAIHostingEnabled"
  > | undefined;
  canUseConversationActions: boolean;
  conversation: Pick<
    Conversation,
    "conversationAIHostingSwitch" | "customerBindType" | "mode"
  > | undefined;
}): ConversationAIHostingPolicy {
  const isConfiguredOn = conversation?.conversationAIHostingSwitch === true;
  const hasCapability =
    conversation?.mode === "group"
      ? account?.seatGroupAIHostingEnabled === true
      : isConversationAIFeatureSupported(conversation) &&
        account?.seatAIHostingEnabled === true;
  const canEnable = canUseConversationActions && hasCapability;
  // 群聊总开关关闭后，不再保留单群 AI 对话入口（即使会话里曾开启过）。
  const canDisable =
    canUseConversationActions &&
    isConfiguredOn &&
    (conversation?.mode === "group" ? hasCapability : true);
  const shouldShowControl =
    conversation?.mode === "group"
      ? hasCapability
      : isConfiguredOn || isConversationAIFeatureSupported(conversation);

  return {
    canDisable,
    canEnable,
    canToggle: isConfiguredOn ? canDisable : canEnable,
    hasCapability,
    isConfiguredOn,
    isEffective: isConfiguredOn && hasCapability,
    shouldShowControl,
  };
}

export function isConversationAIHostingEnabled(
  conversation: Conversation | undefined,
  seatAIHostingEnabled: boolean,
  seatGroupAIHostingEnabled = false,
): boolean {
  return resolveConversationAIHostingPolicy({
    account: { seatAIHostingEnabled, seatGroupAIHostingEnabled },
    canUseConversationActions: false,
    conversation,
  }).isEffective;
}

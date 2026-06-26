import { CONVERSATION_CUSTODY_MODE } from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";

export type CustodyHostingStatus = "active" | "exited" | "retrying" | "thinking";

const custodyHostingStatusLabels: Record<CustodyHostingStatus, string> = {
  active: "Agent 已就绪，正在等待用户消息",
  exited: "当前已退出全托管模式",
  retrying: "出了点小问题，我正在重试",
  thinking: "Agent 正在思考",
};

export function resolveCustodyHostingStatus(
  conversation?: Conversation,
): CustodyHostingStatus | null {
  if (!conversation) {
    return null;
  }

  if (conversation.custodyHostingStatus === "exited") {
    return "exited";
  }

  if (conversation.custodyMode !== CONVERSATION_CUSTODY_MODE.FULL) {
    return null;
  }

  const status = conversation.custodyHostingStatus;

  if (status === "retrying" || status === "thinking") {
    return status;
  }

  return "active";
}

export function isCustodyHostingExited(status: CustodyHostingStatus) {
  return status === "exited";
}

export function isCustodyHostingFullCustody(status: CustodyHostingStatus) {
  return status !== "exited";
}

export function shouldUseFullCustodyCancelButton(status: CustodyHostingStatus) {
  return status === "active";
}

export function getCustodyHostingActionLabel(status: CustodyHostingStatus) {
  return status === "exited" ? "开启托管" : "取消托管";
}

export function getCustodyHostingStatusLabel(status: CustodyHostingStatus) {
  return custodyHostingStatusLabels[status];
}

export function isConversationInFullCustody(conversation?: Conversation) {
  return conversation?.custodyMode === CONVERSATION_CUSTODY_MODE.FULL;
}

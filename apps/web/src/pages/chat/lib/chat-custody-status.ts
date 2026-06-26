import { CONVERSATION_CUSTODY_MODE } from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";

export type CustodyHostingStatus =
  | "active"
  | "exited"
  | "failed"
  | "generating"
  | "handoff"
  | "retrying"
  | "sendFailed"
  | "sendPartialFailed"
  | "sending"
  | "sent"
  | "thinking"
  | "waiting";

const custodyHostingStatusLabels: Record<CustodyHostingStatus, string> = {
  active: "Agent 已就绪，正在等待用户消息",
  exited: "当前已退出全托管模式",
  failed: "Agent 遇到了一些问题",
  generating: "Agent 正在思考回复话术",
  handoff: "Agent 已转人工处理",
  retrying: "出了点小问题，我正在重试",
  sendFailed: "Agent 回复发送失败",
  sendPartialFailed: "Agent 回复部分发送失败",
  sending: "Agent 回复已生成，正在发送",
  sent: "Agent 已发送回复，正在等待用户消息",
  thinking: "Agent 正在查看消息",
  waiting: "Agent 正在等待客户是否还有新消息",
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

  if (
    status === "failed" ||
    status === "generating" ||
    status === "handoff" ||
    status === "retrying" ||
    status === "sendFailed" ||
    status === "sendPartialFailed" ||
    status === "sending" ||
    status === "sent" ||
    status === "thinking" ||
    status === "waiting"
  ) {
    return status;
  }

  return "active";
}

export function isCustodyHostingExited(status: CustodyHostingStatus) {
  return status === "exited";
}

export function isCustodyHostingBusy(status: CustodyHostingStatus) {
  return (
    status === "thinking" ||
    status === "waiting" ||
    status === "generating" ||
    status === "sending" ||
    status === "retrying"
  );
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

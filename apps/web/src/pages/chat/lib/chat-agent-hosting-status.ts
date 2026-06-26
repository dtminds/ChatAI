import { CONVERSATION_AGENT_MODE } from "@chatai/contracts";
import type { Conversation } from "@/pages/chat/chat-types";

export type AgentHostingStatus =
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

const agentHostingStatusLabels: Record<AgentHostingStatus, string> = {
  active: "Agent 已就绪，正在等待用户消息",
  exited: "当前已退出全托管模式",
  failed: "Agent 遇到了一些问题",
  generating: "Agent 正在思考回复话术",
  handoff: "Agent 已转人工处理",
  retrying: "出了点小问题，我正在重试",
  sendFailed: "Agent 回复发送失败",
  sendPartialFailed: "Agent 回复部分发送失败",
  sending: "Agent 回复已生成，正在发送",
  sent: "Agent 已发送回复，本轮对话结束",
  thinking: "Agent 正在查看消息",
  waiting: "Agent 正在确认客户是否追加新消息",
};

export function resolveAgentHostingStatus(
  conversation?: Conversation,
): AgentHostingStatus | null {
  if (!conversation) {
    return null;
  }

  if (conversation.agentHostingStatus === "exited") {
    return "exited";
  }

  if (conversation.agentMode !== CONVERSATION_AGENT_MODE.FULL) {
    return null;
  }

  const status = conversation.agentHostingStatus;

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

export function isAgentHostingExited(status: AgentHostingStatus) {
  return status === "exited";
}

export function isAgentHostingBusy(status: AgentHostingStatus) {
  return (
    status === "thinking" ||
    status === "waiting" ||
    status === "generating" ||
    status === "sending" ||
    status === "retrying"
  );
}

export function isAgentHostingEnabled(status: AgentHostingStatus) {
  return status !== "exited";
}

export function shouldUsePrimaryAgentHostingAction(status: AgentHostingStatus) {
  return status === "active";
}

export function getAgentHostingActionLabel(status: AgentHostingStatus) {
  return status === "exited" ? "开启托管" : "取消托管";
}

export function getAgentHostingStatusLabel(status: AgentHostingStatus) {
  return agentHostingStatusLabels[status];
}

export function isConversationInFullAutoAgentMode(conversation?: Conversation) {
  return conversation?.agentMode === CONVERSATION_AGENT_MODE.FULL;
}

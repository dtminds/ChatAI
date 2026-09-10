import type { WorkflowNodeKind } from "@/pages/chat/workflow/types";

export const AI_BILLING_SUBSCRIPTION_PATH = "/chat/ai-hosting/subscription";
export const AI_BILLING_GUIDE_PATH = "/chat/ai-hosting/subscription/billing";

export const agentAiCreditBillingItems = [
  {
    credits: "1",
    id: "ai-reply",
    name: "生成回复",
    note: "Agent 在全托管或半托管模式下完成一轮输出（回复或操作建议）",
    unit: "每条",
  },
  {
    credits: "1.5",
    id: "user-memory",
    name: "用户记忆",
    note: "Agent 执行某个用户的记忆提炼任务",
    unit: "每次",
  },
] as const;

export const insightAiCreditBillingItems = [
  {
    credits: "4",
    id: "conversation-insights",
    name: "会话洞察",
    note: "完成一个逻辑会话的摘要、质检和洞察",
    unit: "每次",
  },
] as const;

export const workflowAiCreditBillingItems = [
  { credits: "0.1", id: "ai-intent", name: "意图识别节点", note: "-", unit: "每次" },
  { credits: "1", id: "llm", name: "大模型节点", note: "-", unit: "每次" },
  {
    credits: "1",
    id: "ai-collect",
    name: "资料收集节点",
    note: "-",
    unit: "每次",
  },
] as const;

const billableWorkflowNodeKinds = new Set<WorkflowNodeKind>(
  workflowAiCreditBillingItems.map((item) => item.id),
);

export function isBillableWorkflowNodeKind(kind: WorkflowNodeKind) {
  return billableWorkflowNodeKinds.has(kind);
}

import type {
  AiHostingAgentListItem,
  AiHostingAgentModelSummary,
} from "@chatai/contracts";

export type AgentStatsPeriod = "today" | "yesterday" | "last7days" | "last30days";

export type AgentMetricKey =
  | "totalSessions"
  | "aiIndependentSessions"
  | "totalMessages"
  | "aiMessages"
  | "humanMessages";

export type AgentMetric = {
  changePercent: number;
  key: AgentMetricKey;
  label: string;
  value: number;
};

export type AgentRecord = AiHostingAgentListItem & {
  model: AiHostingAgentModelSummary;
};

export const agentStatsPeriodOptions: Array<{ label: string; value: AgentStatsPeriod }> = [
  { label: "今日", value: "today" },
  { label: "昨日", value: "yesterday" },
  { label: "近7日", value: "last7days" },
  { label: "近30日", value: "last30days" },
];

export const emptyAgentMetrics: AgentMetric[] = [
  { key: "totalSessions", label: "会话总数", value: 0, changePercent: 0 },
  { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 0, changePercent: 0 },
  { key: "totalMessages", label: "发送消息总数", value: 0, changePercent: 0 },
  { key: "aiMessages", label: "AI 发送消息数", value: 0, changePercent: 0 },
  { key: "humanMessages", label: "人工发送消息数", value: 0, changePercent: 0 },
];

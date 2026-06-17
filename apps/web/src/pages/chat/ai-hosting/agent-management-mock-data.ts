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

export type AgentRecord = {
  id: string;
  knowledgeBases: string[];
  model: string;
  name: string;
};

export const agentStatsPeriodOptions: Array<{ label: string; value: AgentStatsPeriod }> = [
  { label: "今日", value: "today" },
  { label: "昨日", value: "yesterday" },
  { label: "近7日", value: "last7days" },
  { label: "近30日", value: "last30days" },
];

export const mockAgentMetricsByPeriod: Record<AgentStatsPeriod, AgentMetric[]> = {
  today: [
    { key: "totalSessions", label: "会话总数", value: 256, changePercent: 17.83 },
    { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 45, changePercent: 17.83 },
    { key: "totalMessages", label: "发送消息总数", value: 3403, changePercent: -2.45 },
    { key: "aiMessages", label: "AI 发送消息数", value: 68, changePercent: 17.83 },
    { key: "humanMessages", label: "人工发送消息数", value: 865, changePercent: 17.83 },
  ],
  yesterday: [
    { key: "totalSessions", label: "会话总数", value: 217, changePercent: 8.12 },
    { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 38, changePercent: 5.4 },
    { key: "totalMessages", label: "发送消息总数", value: 3489, changePercent: 1.2 },
    { key: "aiMessages", label: "AI 发送消息数", value: 58, changePercent: 9.6 },
    { key: "humanMessages", label: "人工发送消息数", value: 734, changePercent: 12.1 },
  ],
  last7days: [
    { key: "totalSessions", label: "会话总数", value: 1684, changePercent: 12.5 },
    { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 312, changePercent: 15.2 },
    { key: "totalMessages", label: "发送消息总数", value: 22480, changePercent: -4.8 },
    { key: "aiMessages", label: "AI 发送消息数", value: 486, changePercent: 11.3 },
    { key: "humanMessages", label: "人工发送消息数", value: 5820, changePercent: 10.5 },
  ],
  last30days: [
    { key: "totalSessions", label: "会话总数", value: 6920, changePercent: 6.7 },
    { key: "aiIndependentSessions", label: "AI 独立接待会话数", value: 1288, changePercent: 9.1 },
    { key: "totalMessages", label: "发送消息总数", value: 91240, changePercent: 3.2 },
    { key: "aiMessages", label: "AI 发送消息数", value: 2034, changePercent: 7.8 },
    { key: "humanMessages", label: "人工发送消息数", value: 24100, changePercent: 8.2 },
  ],
};

export const mockAgents: AgentRecord[] = [
  {
    id: "agent-skincare",
    name: "护肤小助理",
    model: "Doubao-2.0-lite",
    knowledgeBases: ["美妆知识大全", "彩妆精选", "护肤成分库", "售后集合"],
  },
  {
    id: "agent-after-sales",
    name: "售后小助理",
    model: "Doubao-2.0-lite",
    knowledgeBases: ["售后集合"],
  },
  {
    id: "agent-makeup",
    name: "彩妆小助理",
    model: "Doubao-2.0-lite",
    knowledgeBases: ["彩妆精选"],
  },
];

export type ApplicationScopeAccount = {
  associatedAgentId: string | null;
  autoHostingEnabled: boolean;
  id: string;
  name: string;
  scriptRecommendationEnabled: boolean;
};

const applicationScopeAgentLabels: Record<string, string> = {
  "agent-skincare": "护肤",
  "agent-makeup": "彩妆",
  "agent-after-sales": "售后",
};

export function resolveApplicationScopeAgentLabel(agentId: string | null) {
  if (!agentId) {
    return "-";
  }

  return applicationScopeAgentLabels[agentId] ?? mockAgents.find((agent) => agent.id === agentId)?.name ?? "-";
}

export const mockApplicationScopeAccounts: ApplicationScopeAccount[] = [
  {
    id: "wecom-account-1",
    name: "小助理1",
    associatedAgentId: null,
    autoHostingEnabled: false,
    scriptRecommendationEnabled: false,
  },
  {
    id: "wecom-account-2",
    name: "小助理2",
    associatedAgentId: "agent-skincare",
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
  {
    id: "wecom-account-3",
    name: "小助理3",
    associatedAgentId: "agent-makeup",
    autoHostingEnabled: true,
    scriptRecommendationEnabled: true,
  },
];

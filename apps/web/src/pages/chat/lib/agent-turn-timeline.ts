import type {
  AgentTurnApprovalMode,
  AgentTurnEventEnvelope,
  AgentTurnToolCategory,
} from "@chatai/contracts";

export type AgentTurnTimelineStatus =
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentTurnTimelineActivity = {
  approvalMode?: AgentTurnApprovalMode;
  category?: AgentTurnToolCategory;
  completedAt?: string;
  decision?: {
    action?: "approve" | "redirect" | "reject";
    instruction?: string;
    status: "pending" | "resolved";
  };
  error?: unknown;
  id: string;
  input?: unknown;
  kind: "thinking" | "tool" | "reply";
  label: string;
  name?: string;
  output?: unknown;
  startedAt: string;
  status: AgentTurnTimelineStatus;
  summary?: string;
};

const TOOL_LABELS: Readonly<Record<string, string>> = {
  "after_sales.apply": "申请退款",
  "knowledge.search": "查询知识库",
  "order.bind": "绑定订单",
  "order.query": "查询订单",
  "order.query.mock_failure": "查询订单",
  request_kf_clarification: "确认处理方式",
  "turn.finish": "生成回复",
};

export function projectAgentTurnTimeline(
  envelopes: readonly AgentTurnEventEnvelope[],
): AgentTurnTimelineActivity[] {
  const activities: AgentTurnTimelineActivity[] = [];
  const activityIndexes = new Map<string, number>();

  for (const envelope of [...envelopes].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const { event } = envelope;

    if (event.type === "activity.updated") {
      upsertActivity(activities, activityIndexes, event.activity.id, (current) => ({
        ...current,
        completedAt:
          event.activity.status === "succeeded"
            ? envelope.occurredAt
            : current?.completedAt,
        id: event.activity.id,
        kind: "thinking",
        label: event.activity.summary,
        startedAt: current?.startedAt ?? envelope.occurredAt,
        status: event.activity.status,
        summary: event.activity.summary,
      }));
      continue;
    }

    if (event.type === "tool_call") {
      if (activityIndexes.has(event.callId)) continue;

      const kind = event.name === "turn.finish" ? "reply" : "tool";
      upsertActivity(activities, activityIndexes, event.callId, () => ({
        approvalMode: event.approvalMode,
        category: event.category,
        id: event.callId,
        input: event.input,
        kind,
        label: TOOL_LABELS[event.name] ?? event.name,
        name: event.name,
        startedAt: envelope.occurredAt,
        status:
          event.name === "request_kf_clarification" ? "waiting" : "running",
        summary: event.summary,
      }));
      continue;
    }

    if (event.type === "decision.requested") {
      updateActivity(activities, activityIndexes, event.callId, (current) => ({
        ...current,
        decision: { status: "pending" },
        status: "waiting",
      }));
      continue;
    }

    if (event.type === "decision.resolved") {
      updateActivity(activities, activityIndexes, event.callId, (current) => ({
        ...current,
        decision: {
          action: event.action,
          instruction: event.instruction,
          status: "resolved",
        },
        status: event.action === "approve" ? "running" : "cancelled",
      }));
      continue;
    }

    if (event.type === "tool_result") {
      updateActivity(activities, activityIndexes, event.callId, (current) => ({
        ...current,
        completedAt: envelope.occurredAt,
        error: event.error,
        output: event.output,
        status: event.status,
      }));
    }
  }

  return activities;
}

function upsertActivity(
  activities: AgentTurnTimelineActivity[],
  indexes: Map<string, number>,
  id: string,
  create: (
    current: AgentTurnTimelineActivity | undefined,
  ) => AgentTurnTimelineActivity,
) {
  const index = indexes.get(id);
  if (index === undefined) {
    indexes.set(id, activities.length);
    activities.push(create(undefined));
    return;
  }

  activities[index] = create(activities[index]);
}

function updateActivity(
  activities: AgentTurnTimelineActivity[],
  indexes: Map<string, number>,
  id: string,
  update: (current: AgentTurnTimelineActivity) => AgentTurnTimelineActivity,
) {
  const index = indexes.get(id);
  if (index === undefined) return;
  activities[index] = update(activities[index]);
}

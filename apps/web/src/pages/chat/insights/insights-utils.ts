import type {
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightDetailResponse,
} from "@chatai/contracts";

export function formatInsightTime(value?: number) {
  if (!value) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

export function formatResolutionStatus(
  status: InsightDetailResponse["problemResolution"]["resolutionStatus"],
) {
  const labels = {
    no_customer_problem: "无明确问题",
    partially_resolved: "部分解决",
    resolved: "已解决",
    unknown: "待复核",
    unresolved: "未解决",
  } as const;

  return labels[status];
}

export function formatAnalysisStatus(status: InsightAnalysisStatus) {
  const labels = {
    analyzing: "分析中",
    failed: "失败",
    partial: "部分完成",
    ready: "已完成",
    stale: "已过期",
  } as const;

  return labels[status];
}

export function formatActionStatus(status: InsightActionStatus) {
  const labels = {
    dismissed: "已忽略",
    done: "已完成",
    expired: "已过期",
    open: "待处理",
  } as const;

  return labels[status];
}

export function formatPriority(priority: "high" | "low" | "medium") {
  const labels = {
    high: "高",
    low: "低",
    medium: "中",
  } as const;

  return labels[priority];
}

export function formatSeverity(severity: "high" | "low" | "medium") {
  const labels = {
    high: "高严重",
    low: "低严重",
    medium: "中严重",
  } as const;

  return labels[severity];
}

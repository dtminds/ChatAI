import type {
  InsightActionStatus,
  InsightAnalysisStatus,
  InsightDetailResponse,
} from "@chatai/contracts";

export function formatInsightTime(value?: number) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  if (isSameCalendarDay(date, now)) {
    return `今天 ${time}`;
  }

  if (isSameCalendarDay(date, addDays(now, -1))) {
    return `昨天 ${time}`;
  }

  const nowMonday = getMondayStartOfDay(now);

  if (date.getTime() >= nowMonday.getTime() && date.getTime() < addDays(nowMonday, 7).getTime()) {
    return `${formatWeekday(date)} ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function getMondayStartOfDay(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -daysSinceMonday);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
}

export function formatResolutionStatus(
  status: InsightDetailResponse["problemResolution"]["resolutionStatus"],
) {
  const labels = {
    no_customer_problem: "无需客服处理",
    partially_resolved: "部分解决",
    resolved: "已解决",
    unknown: "消息不足",
    unresolved: "未解决",
  } as const;

  return labels[status];
}

export function formatAnalysisStatus(status: InsightAnalysisStatus) {
  const labels = {
    analyzing: "待分析",
    failed: "失败",
    partial: "部分完成",
    ready: "已完成",
    skipped: "未运行",
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

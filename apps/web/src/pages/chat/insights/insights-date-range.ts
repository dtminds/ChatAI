export type InsightDateRange = {
  from: string;
  to: string;
};

export function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

export function getDefaultDateRange(today = new Date()): InsightDateRange {
  const to = new Date(today);
  const from = new Date(to);

  from.setDate(to.getDate() - 29);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

export function getCurrentMonthDateRange(today = new Date()): InsightDateRange {
  const from = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(today),
  };
}

export function getPreviousMonthDateRange(today = new Date()): InsightDateRange {
  const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const to = new Date(today.getFullYear(), today.getMonth(), 0);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

export function getRecentDateRange(days: number, today = new Date()): InsightDateRange {
  const to = new Date(today);
  const from = new Date(to);

  from.setDate(to.getDate() - days + 1);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

export function getWeekDateRange(today = new Date()): InsightDateRange {
  const to = new Date(today);
  const from = getStartOfWeek(today);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

export function getPreviousWeekDateRange(today = new Date()): InsightDateRange {
  const thisWeekStart = getStartOfWeek(today);
  const from = new Date(thisWeekStart);
  const to = new Date(thisWeekStart);

  from.setDate(thisWeekStart.getDate() - 7);
  to.setDate(thisWeekStart.getDate() - 1);

  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
  };
}

export function getYesterdayDateRange(today = new Date()): InsightDateRange {
  const yesterday = new Date(today);

  yesterday.setDate(today.getDate() - 1);

  return {
    from: formatDateInputValue(yesterday),
    to: formatDateInputValue(yesterday),
  };
}

function getStartOfWeek(today: Date) {
  const from = new Date(today);
  const day = from.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  from.setDate(from.getDate() - daysSinceMonday);

  return from;
}

export function toBoundaryDate(value: string, boundary: "end" | "start") {
  if (!value) {
    return undefined;
  }

  return boundary === "start"
    ? `${value}T00:00:00.000+08:00`
    : `${value}T23:59:59.999+08:00`;
}

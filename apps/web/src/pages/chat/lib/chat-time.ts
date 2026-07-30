const TIME_PART_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const WEEKDAY_PART_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  weekday: "short",
});

export function formatTextMessageSentAt(value: string, now = new Date()) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const datePart =
    date.getFullYear() === now.getFullYear()
      ? `${month}/${day}`
      : `${date.getFullYear()}/${month}/${day}`;

  return `${datePart} ${hour}:${minute}`;
}

export function formatConversationTimestamp(value: string) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  const now = new Date();

  if (isSameCalendarDay(date, now)) {
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes >= 0 && diffMinutes < 60) {
      return diffMinutes === 0 ? "刚刚" : `${diffMinutes}分钟前`;
    }

    return TIME_PART_FORMATTER.format(date);
  }

  if (date.getFullYear() === now.getFullYear()) {
    return [
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("/");
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("/");
}

export function parseWorkbenchDate(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatMessageDividerLabel(value: string, now = new Date()) {
  const date = parseWorkbenchDate(value);

  if (!date) {
    return value;
  }

  return formatMessageDividerDate(date, now);
}

export function formatMessageDividerDate(date: Date, now = new Date()) {
  const time = TIME_PART_FORMATTER.format(date);

  if (isSameCalendarDay(date, now)) {
    return time;
  }

  if (isSameCalendarDay(date, addDays(now, -1))) {
    return `昨天 ${time}`;
  }

  if (isSameWeekMondayToSunday(date, now)) {
    return `${WEEKDAY_PART_FORMATTER.format(date)} ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function isSameWeekMondayToSunday(a: Date, b: Date) {
  const weekStart = getMondayStartOfDay(b);
  const nextWeekStart = addDays(weekStart, 7);

  return a.getTime() >= weekStart.getTime() && a.getTime() < nextWeekStart.getTime();
}

function getMondayStartOfDay(value: Date) {
  const date = startOfDay(value);
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;

  return addDays(date, -daysSinceMonday);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);

  return date;
}

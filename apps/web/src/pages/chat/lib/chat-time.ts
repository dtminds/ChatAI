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

    return formatDatePart(date, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
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

function formatDatePart(
  date: Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

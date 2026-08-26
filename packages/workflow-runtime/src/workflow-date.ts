const SHANGHAI_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Shanghai",
  year: "numeric",
});

export function formatWorkflowMetricDate(value: Date) {
  return SHANGHAI_DATE_FORMATTER.format(value);
}

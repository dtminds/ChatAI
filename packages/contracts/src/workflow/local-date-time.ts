const WORKFLOW_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isValidWorkflowLocalDateTime(value: string) {
  const match = WORKFLOW_LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const [hour = 0, minute = 0] = match[4]!.split(":").map(Number);
  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
    && normalized.getUTCHours() === hour
    && normalized.getUTCMinutes() === minute;
}

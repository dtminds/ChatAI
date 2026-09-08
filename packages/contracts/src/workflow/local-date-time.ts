const WORKFLOW_LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/;
const WORKFLOW_LOCAL_DATE_TIME_TO_SECOND_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T((?:[01]\d|2[0-3]):[0-5]\d):([0-5]\d)$/;
const WORKFLOW_LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WORKFLOW_LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const WORKFLOW_LOCAL_TIME_TO_SECOND_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export function isValidWorkflowLocalDate(value: string) {
  const match = WORKFLOW_LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day;
}

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

export function isValidWorkflowLocalDateTimeToSecond(value: string) {
  const match = WORKFLOW_LOCAL_DATE_TIME_TO_SECOND_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const [hour = 0, minute = 0] = match[4]!.split(":").map(Number);
  const second = Number(match[5]);
  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
    && normalized.getUTCHours() === hour
    && normalized.getUTCMinutes() === minute
    && normalized.getUTCSeconds() === second;
}

/**
 * Canonicalizes persisted minute-only workflow clock values after the picker
 * gained second precision. End bounds include the complete legacy minute.
 */
export function normalizeWorkflowLocalTimeToSecond(value: unknown, end: boolean) {
  if (typeof value !== "string") return undefined;
  if (WORKFLOW_LOCAL_TIME_TO_SECOND_PATTERN.test(value)) return value;
  return WORKFLOW_LOCAL_TIME_PATTERN.test(value)
    ? `${value}:${end ? "59" : "00"}`
    : undefined;
}

/**
 * Canonicalizes persisted minute-only workflow date-times without changing the
 * legacy interval semantics: starts begin at :00 and ends include :59.
 */
export function normalizeWorkflowLocalDateTimeToSecond(value: unknown, end: boolean) {
  if (typeof value !== "string") return undefined;
  if (isValidWorkflowLocalDateTimeToSecond(value)) return value;
  return isValidWorkflowLocalDateTime(value)
    ? `${value}:${end ? "59" : "00"}`
    : undefined;
}

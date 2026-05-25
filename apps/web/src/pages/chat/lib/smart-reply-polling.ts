export function shouldPollSmartReplies(
  lastPolledAt: number | undefined,
  now: number,
  intervalMs: number,
) {
  return lastPolledAt == null || now - lastPolledAt >= intervalMs;
}

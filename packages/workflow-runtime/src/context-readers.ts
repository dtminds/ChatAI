export function readWorkflowTriggerSeatId(trigger: Record<string, unknown>) {
  const projection = isRecord(trigger.projection) ? trigger.projection : null;
  const seatId = projection?.seatId;
  return typeof seatId === "number" && Number.isSafeInteger(seatId) && seatId > 0
    ? seatId
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

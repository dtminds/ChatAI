import { WORKFLOW_ORDER_NUMBER_MAX_LENGTH } from "@chatai/contracts";

export function readWorkflowOrderNumber(value: unknown) {
  const orderNumber = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  if (!orderNumber || orderNumber.length > WORKFLOW_ORDER_NUMBER_MAX_LENGTH) return null;
  return { orderNumber, source: "workflow" as const };
}

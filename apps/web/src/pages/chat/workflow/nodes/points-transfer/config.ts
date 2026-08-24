import type { WorkflowVariableSelector } from "../../types";

export function normalizePointsTransferSelector(
  value: unknown,
): WorkflowVariableSelector | undefined {
  if (
    !Array.isArray(value)
    || value.length < 2
    || value.length > 4
    || value.some((part) => typeof part !== "string" || !part.trim())
  ) {
    return undefined;
  }

  return [...value];
}

export function getPointsTransferMetric(selector: WorkflowVariableSelector | undefined) {
  return selector ? "已选择订单号" : "待配置订单号";
}

export function getPointsTransferStatus(selector: WorkflowVariableSelector | undefined) {
  return selector ? "ready" as const : "warning" as const;
}

export function getPointsTransferNodePatch(selector: WorkflowVariableSelector | undefined) {
  return selector
    ? {
        metric: getPointsTransferMetric(selector),
        orderNumberSelector: selector,
        status: getPointsTransferStatus(selector),
      }
    : {
        metric: getPointsTransferMetric(selector),
        status: getPointsTransferStatus(selector),
      };
}

export function isPointsTransferOrderNumberVariable(valueType: { kind: string }) {
  return valueType.kind === "string" || valueType.kind === "number";
}

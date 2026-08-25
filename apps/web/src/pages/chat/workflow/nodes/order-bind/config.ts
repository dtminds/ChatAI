import type { WorkflowVariableSelector } from "../../types";

export function normalizeOrderBindSelector(
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

export function getOrderBindMetric(selector: WorkflowVariableSelector | undefined) {
  return selector ? "已选择订单号" : "待配置订单号";
}

export function getOrderBindStatus(selector: WorkflowVariableSelector | undefined) {
  return selector ? "ready" as const : "warning" as const;
}

export function getOrderBindNodePatch(selector: WorkflowVariableSelector | undefined) {
  return selector
    ? {
        metric: getOrderBindMetric(selector),
        orderNumberSelector: selector,
        status: getOrderBindStatus(selector),
      }
    : {
        metric: getOrderBindMetric(selector),
        status: getOrderBindStatus(selector),
      };
}

export function isOrderBindOrderNumberVariable(valueType: { kind: string }) {
  return valueType.kind === "string" || valueType.kind === "number";
}

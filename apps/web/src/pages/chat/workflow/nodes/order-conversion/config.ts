import type { WorkflowVariableSelector } from "../../types";

export function normalizeOrderConversionSelector(
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

export function getOrderConversionMetric(selector: WorkflowVariableSelector | undefined) {
  return selector ? "已选择订单号" : "待配置订单号";
}

export function getOrderConversionStatus(selector: WorkflowVariableSelector | undefined) {
  return selector ? "ready" as const : "warning" as const;
}

export function getOrderConversionNodePatch(selector: WorkflowVariableSelector | undefined) {
  return selector
    ? {
        metric: getOrderConversionMetric(selector),
        orderNumberSelector: selector,
        status: getOrderConversionStatus(selector),
      }
    : {
        metric: getOrderConversionMetric(selector),
        status: getOrderConversionStatus(selector),
      };
}

export function isOrderConversionOrderNumberVariable(valueType: { kind: string }) {
  return valueType.kind === "string" || valueType.kind === "number";
}

import { ShoppingBasket01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { isWorkflowNodeExecutionConfig } from "@chatai/contracts";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import { resolveWorkflowVariable } from "../../workflow-variables";
import {
  createDefaultOrderQueryConditions,
  getOrderQueryMetric,
  isOrderNumberVariable,
  isOrderQueryReady,
  normalizeOrderQuerySelector,
} from "./config";

const base = createStandardNodeDefinition({
  accentClassName: "bg-orange-600 text-white",
  accentRgb: "234 88 12",
  description: "按订单号或客户订单条件查询订单数据",
  icon: ShoppingBasket01Icon,
  kind: "order-query",
  label: "订单查询",
  metric: "待配置订单号",
  paletteGroup: "data",
  sort: 60,
});

export const orderQueryNodeDefinition: WorkflowNodeDefinition<"order-query"> = {
  ...base,
  createDefaultData: () => ({
    ...base.createDefaultData(),
    mode: "order-number",
    status: "warning",
  }),
  getOutputVariables: () => [
    { description: "符合条件的累计订单数量", key: "orderCount", label: "累计订单数", usages: ["variable"], valueType: { kind: "number" } },
    { description: "符合条件订单的累计实付金额", key: "totalAmount", label: "累计订单金额", usages: ["variable"], valueType: { kind: "number" } },
    { description: "累计实付金额扣除已完成退款后的金额", key: "netAmount", label: "净成交金额", usages: ["variable"], valueType: { kind: "number" } },
  ],
  sanitizeData: (data) => {
    if (data.mode === "conditions") {
      const next = { ...data, conditions: data.conditions ?? createDefaultOrderQueryConditions(), mode: "conditions" as const };
      delete (next as Record<string, unknown>).orderNumberSelector;
      return { ...next, metric: getOrderQueryMetric(next), status: isOrderQueryReady(next) ? "ready" : "warning" };
    }
    const selector = normalizeOrderQuerySelector(data.orderNumberSelector);
    const next = { ...data, mode: "order-number" as const, orderNumberSelector: selector };
    delete (next as Record<string, unknown>).conditions;
    if (!selector) delete (next as Record<string, unknown>).orderNumberSelector;
    return { ...next, metric: getOrderQueryMetric(next), status: isOrderQueryReady(next) ? "ready" : "warning" };
  },
  validate: (node, context) => {
    if (node.data.mode === "conditions") {
      return isWorkflowNodeExecutionConfig("order-query", {
        conditions: node.data.conditions,
        mode: "conditions",
      })
        ? []
        : [{ code: "order-query-conditions-invalid", message: "查询条件不完整", severity: "warning", source: "config" }];
    }
    const selector = normalizeOrderQuerySelector(node.data.orderNumberSelector);
    if (!selector) return [{ code: "order-query-selector-required", message: "需选择订单号", severity: "warning", source: "config" }];
    const variable = resolveWorkflowVariable(context.availableVariables, selector);
    return variable && isOrderNumberVariable(variable.valueType) ? [] : [{ code: "order-query-variable-invalid", message: "订单号引用了不可用或类型已变化的变量", severity: "warning", source: "config" }];
  },
};

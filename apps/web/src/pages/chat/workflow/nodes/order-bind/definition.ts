import { Link04Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getOrderBindNodePatch,
  isOrderBindOrderNumberVariable,
  normalizeOrderBindSelector,
} from "./config";

const baseOrderBindNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-amber-600 text-white",
  accentRgb: "217 119 6",
  description: "把订单号绑定到当前客户",
  icon: Link04Icon,
  kind: "order-bind",
  label: "绑定订单",
  metric: "待配置订单号",
  paletteGroup: "operate",
  sort: 95,
});

export const orderBindNodeDefinition: WorkflowNodeDefinition<"order-bind"> = {
  ...baseOrderBindNodeDefinition,
  createDefaultData: () => ({
    ...baseOrderBindNodeDefinition.createDefaultData(),
    ...getOrderBindNodePatch(undefined),
  }),
  getOutputVariables: () => [
    {
      description: "系统会返回绑定订单结果，成功会返回 “success”，失败会返回 “false”",
      key: "result",
      label: "操作结果",
      usages: ["variable"],
      valueType: { kind: "string" },
    },
  ],
  sanitizeData: (data) => {
    const selector = normalizeOrderBindSelector(data.orderNumberSelector);
    const next = {
      ...data,
      ...getOrderBindNodePatch(selector),
    };
    if (!selector) delete next.orderNumberSelector;
    return next;
  },
  validate: (node, context) => {
    const selector = normalizeOrderBindSelector(node.data.orderNumberSelector);
    if (!selector) {
      return [{
        code: "order-bind-selector-required",
        message: "需选择订单号",
        severity: "warning",
        source: "config",
      }];
    }
    const variable = resolveWorkflowVariable(context.availableVariables, selector);
    return variable && isOrderBindOrderNumberVariable(variable.valueType)
      ? []
      : [{
          code: "order-bind-variable-invalid",
          message: "订单号引用了不可用或类型已变化的变量",
          severity: "warning",
          source: "config",
        }];
  },
};

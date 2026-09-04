import { FileUserIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getOrderBindNodePatch,
  isOrderBindOrderNumberVariable,
  normalizeOrderBindSelector,
} from "./config";

const baseOrderBindNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-amber-500 text-white",
  accentRgb: "217 119 6",
  description: "通过「资料收集」提取订单号，然后通过此节点将订单关联到当前客户，用于完善客户画像",
  icon: FileUserIcon,
  kind: "order-bind",
  label: "关联订单",
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
      description: "订单是否关联成功",
      key: "result",
      label: "操作结果",
      usages: ["variable"],
      valueType: { kind: "boolean" },
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

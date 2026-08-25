import { CoinsYenIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getOrderConversionNodePatch,
  isOrderConversionOrderNumberVariable,
  normalizeOrderConversionSelector,
} from "./config";

const baseOrderConversionNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-rose-400 text-white",
  accentRgb: "244 63 94",
  description: "通过「资料收集」提取订单号，然后使用此节点代客转换积分",
  icon: CoinsYenIcon,
  kind: "order-conversion",
  label: "代客转积分",
  metric: "待配置订单号",
  paletteGroup: "operate",
  sort: 140,
});

export const orderConversionNodeDefinition: WorkflowNodeDefinition<"order-conversion"> = {
  ...baseOrderConversionNodeDefinition,
  createDefaultData: () => ({
    ...baseOrderConversionNodeDefinition.createDefaultData(),
    ...getOrderConversionNodePatch(undefined),
  }),
  getOutputVariables: () => [
    {
      description: "积分是否转换成功",
      key: "result",
      label: "操作结果",
      usages: ["variable"],
      valueType: { kind: "boolean" },
    },
  ],
  sanitizeData: (data) => {
    const selector = normalizeOrderConversionSelector(data.orderNumberSelector);
    const next = {
      ...data,
      ...getOrderConversionNodePatch(selector),
    };
    if (!selector) delete next.orderNumberSelector;
    return next;
  },
  validate: (node, context) => {
    const selector = normalizeOrderConversionSelector(node.data.orderNumberSelector);
    if (!selector) {
      return [{
        code: "order-conversion-selector-required",
        message: "需选择订单号",
        severity: "warning",
        source: "config",
      }];
    }
    const variable = resolveWorkflowVariable(context.availableVariables, selector);
    return variable && isOrderConversionOrderNumberVariable(variable.valueType)
      ? []
      : [{
          code: "order-conversion-variable-invalid",
          message: "订单号引用了不可用或类型已变化的变量",
          severity: "warning",
          source: "config",
        }];
  },
};

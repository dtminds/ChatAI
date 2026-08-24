import { Link04Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getPointsTransferNodePatch,
  isPointsTransferOrderNumberVariable,
  normalizePointsTransferSelector,
} from "./config";

const basePointsTransferNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-rose-500 text-white",
  accentRgb: "244 63 94",
  description: "根据订单号为客户转积分",
  icon: Link04Icon,
  kind: "points-transfer",
  label: "代客转积分",
  metric: "待配置订单号",
  paletteGroup: "operate",
  sort: 140,
});

export const pointsTransferNodeDefinition: WorkflowNodeDefinition<"points-transfer"> = {
  ...basePointsTransferNodeDefinition,
  createDefaultData: () => ({
    ...basePointsTransferNodeDefinition.createDefaultData(),
    ...getPointsTransferNodePatch(undefined),
  }),
  getOutputVariables: () => [
    {
      description: "系统会返回代客转积分结果，成功会返回 “success”，失败会返回 “false”",
      key: "result",
      label: "操作结果",
      usages: ["variable"],
      valueType: { kind: "string" },
    },
  ],
  sanitizeData: (data) => {
    const selector = normalizePointsTransferSelector(data.orderNumberSelector);
    const next = {
      ...data,
      ...getPointsTransferNodePatch(selector),
    };
    if (!selector) delete next.orderNumberSelector;
    return next;
  },
  validate: (node, context) => {
    const selector = normalizePointsTransferSelector(node.data.orderNumberSelector);
    if (!selector) {
      return [{
        code: "points-transfer-selector-required",
        message: "需选择订单号",
        severity: "warning",
        source: "config",
      }];
    }
    const variable = resolveWorkflowVariable(context.availableVariables, selector);
    return variable && isPointsTransferOrderNumberVariable(variable.valueType)
      ? []
      : [{
          code: "points-transfer-variable-invalid",
          message: "订单号引用了不可用或类型已变化的变量",
          severity: "warning",
          source: "config",
        }];
  },
};

import { UserEdit01Icon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { isWorkflowOutputValueTypeEqual } from "../../workflow-node-outputs";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  areCustomerUpdateFieldsComplete,
  getCustomerUpdateNodePatch,
  normalizeCustomerUpdateFields,
} from "./config";

const baseCustomerUpdateNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-blue-400 text-white",
  accentRgb: "37 99 235",
  description: "更新客户画像上的自定义属性字段",
  icon: UserEdit01Icon,
  kind: "customer-update",
  label: "修改客户资料",
  metric: "待配置资料字段",
  paletteGroup: "operate",
  sort: 90,
});

export const customerUpdateNodeDefinition: WorkflowNodeDefinition<"customer-update"> = {
  ...baseCustomerUpdateNodeDefinition,
  createDefaultData: () => ({
    ...baseCustomerUpdateNodeDefinition.createDefaultData(),
    ...getCustomerUpdateNodePatch([]),
  }),
  sanitizeData: (data) => ({
    ...data,
    ...getCustomerUpdateNodePatch(data.fields),
  }),
  validate: (node, context) => {
    if (!areCustomerUpdateFieldsComplete(node.data.fields)) {
      return [{
        code: "customer-update-fields-required",
        message: "需配置至少一个完整属性",
        severity: "warning",
        source: "config",
      }];
    }
    const referencesInvalidVariable = normalizeCustomerUpdateFields(node.data.fields)
      .some((field) => {
        if (field.value.kind !== "variable") return false;
        const variable = resolveWorkflowVariable(context.availableVariables, field.value.selector);
        return !variable || !isWorkflowOutputValueTypeEqual(field.value.valueType, variable.valueType);
      });
    return referencesInvalidVariable
      ? [{
          code: "customer-update-variable-invalid",
          message: "客户属性引用了不可用或类型已变化的变量",
          severity: "warning",
          source: "config",
        }]
      : [];
  },
};

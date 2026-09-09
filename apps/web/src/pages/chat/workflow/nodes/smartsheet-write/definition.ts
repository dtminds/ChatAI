import { FileSpreadsheetIcon } from "@hugeicons/core-free-icons";
import {
  isValidSmartsheetWebhookUrl,
  isWorkflowSmartsheetFieldValueTypeCompatible,
  parseSmartsheetSchema,
} from "@chatai/contracts";
import type { WorkflowNodeDefinition } from "../definition-types";
import { isWorkflowOutputValueTypeEqual } from "../../workflow-node-outputs";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  areSmartsheetWriteFieldsComplete,
  getSmartsheetWriteNodePatch,
  normalizeSmartsheetFieldMappings,
} from "./config";

const baseSmartsheetWriteNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-emerald-600 text-white",
  accentRgb: "5 150 105",
  description: "将数据写入企业微信智能表格",
  icon: FileSpreadsheetIcon,
  kind: "smartsheet-write",
  label: "写入智能表格",
  metric: "未配置",
  paletteGroup: "data",
  sort: 150,
});

export const smartsheetWriteDefinition: WorkflowNodeDefinition<"smartsheet-write"> = {
  ...baseSmartsheetWriteNodeDefinition,
  createDefaultData: () => ({
    ...baseSmartsheetWriteNodeDefinition.createDefaultData(),
    ...getSmartsheetWriteNodePatch({
      webhookUrl: "",
      schema: "",
      fieldMappings: [],
    }),
  }),
  getOutputVariables: () => [
    {
      key: "success",
      label: "写入结果",
      usages: ["variable"],
      valueType: { kind: "boolean" },
    },
  ],
  sanitizeData: (data) => ({
    ...data,
    ...getSmartsheetWriteNodePatch(data),
  }),
  validate: (node, context) => {
    const issues = [];
    if (!areSmartsheetWriteFieldsComplete(node.data)) {
      if (!isValidSmartsheetWebhookUrl(node.data.webhookUrl)) {
        issues.push({
          code: "smartsheet-webhook-required",
          message: "需填写有效 Webhook 地址",
          severity: "warning" as const,
          source: "config" as const,
        });
      }
      if (!parseSmartsheetSchema(node.data.schema)) {
        issues.push({
          code: "smartsheet-schema-required",
          message: "需填写有效 Schema",
          severity: "warning" as const,
          source: "config" as const,
        });
      }
      if (normalizeSmartsheetFieldMappings(node.data.fieldMappings).length === 0) {
        issues.push({
          code: "smartsheet-fields-required",
          message: "需配置至少一个字段",
          severity: "warning" as const,
          source: "config" as const,
        });
      } else if (!areSmartsheetWriteFieldsComplete(node.data)) {
        issues.push({
          code: "smartsheet-field-value-required",
          message: "字段值不完整",
          severity: "warning" as const,
          source: "config" as const,
        });
      }
    }
    const referencesInvalidVariable = normalizeSmartsheetFieldMappings(node.data.fieldMappings)
      .some((mapping) => {
        if (mapping.value.kind !== "variable") return false;
        const variable = resolveWorkflowVariable(context.availableVariables, mapping.value.selector);
        return !variable
          || !isWorkflowOutputValueTypeEqual(mapping.value.valueType, variable.valueType)
          || !isWorkflowSmartsheetFieldValueTypeCompatible(mapping.fieldType, mapping.value.valueType);
      });
    if (referencesInvalidVariable) {
      issues.push({
        code: "smartsheet-variable-invalid",
        message: "字段引用了不可用或类型已变化的变量",
        severity: "warning" as const,
        source: "config" as const,
      });
    }
    return issues;
  },
};

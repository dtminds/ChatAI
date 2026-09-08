import { ListTodoIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getVariableContentPreview,
  normalizeVariableContent,
} from "../variable-content/content";

const baseDefinition = createStandardNodeDefinition({
  accentClassName: "bg-emerald-600 text-white",
  accentRgb: "5 150 105",
  description: "根据流程中的客户信息创建工单，供运营或客服继续跟进处理",
  icon: ListTodoIcon,
  kind: "ticket-create",
  label: "创建工单",
  metric: "待配置标题",
  paletteGroup: "operate",
  sort: 125,
});

export const ticketCreateNodeDefinition: WorkflowNodeDefinition<"ticket-create"> = {
  ...baseDefinition,
  createDefaultData: () => ({
    ...baseDefinition.createDefaultData(),
    description: [],
    metric: "待配置标题",
    priority: "medium",
    status: "warning",
    ticketTitle: [],
  }),
  getOutputVariables: () => [
    {
      description: "创建成功的工单 ID",
      key: "ticketId",
      label: "工单 ID",
      usages: ["variable", "message-content"],
      valueType: { kind: "string" },
    },
  ],
  sanitizeData: data => ({
    ...data,
    description: normalizeVariableContent(data.description),
    ticketTitle: normalizeVariableContent(data.ticketTitle),
  }),
  validate: node => getVariableContentPreview(node.data.ticketTitle)
    ? []
    : [{
        code: "ticket-create-title-required",
        message: "需配置工单标题",
        severity: "warning",
        source: "config",
      }],
};

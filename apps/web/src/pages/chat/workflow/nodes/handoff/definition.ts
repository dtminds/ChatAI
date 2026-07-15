import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getVariableContentPreview,
  normalizeVariableContent,
} from "../variable-content/content";

const baseHandoffNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-slate-600 text-white ring-slate-600/20",
  accentRgb: "71 85 105",
  description: "将客户转交给人工或指定团队",
  icon: UserSwitchIcon,
  kind: "handoff",
  label: "转人工",
  metric: "待配置客服提示",
  paletteGroup: "message",
  sort: 110,
});

export const handoffNodeDefinition: WorkflowNodeDefinition<"handoff"> = {
  ...baseHandoffNodeDefinition,
  createDefaultData: () => ({
    ...baseHandoffNodeDefinition.createDefaultData(),
    customerMessage: [],
    metric: "待配置客服提示",
    operatorMessage: [],
    status: "warning",
  }),
  createExecutionConfig: (data) => ({
    customerMessage: normalizeVariableContent(data.customerMessage),
    operatorMessage: normalizeVariableContent(data.operatorMessage),
  }),
  sanitizeData: (data) => ({
    ...data,
    customerMessage: normalizeVariableContent(data.customerMessage),
    operatorMessage: normalizeVariableContent(data.operatorMessage),
  }),
  validate: (node) => getVariableContentPreview(node.data.operatorMessage)
    ? []
    : [{
        code: "handoff-operator-message-required",
        message: "转人工节点需要配置给客服的转发提示",
        severity: "warning",
        source: "config",
      }],
};

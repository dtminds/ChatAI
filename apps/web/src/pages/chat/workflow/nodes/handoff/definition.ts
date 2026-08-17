import { UserSwitchIcon } from "@hugeicons/core-free-icons";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getVariableContentPreview,
  normalizeVariableContent,
} from "../variable-content/content";

const baseHandoffNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-cyan-600 text-white",
  accentRgb: "8 145 178",
  description: "遇到复杂、个性化或需人工介入的问题时，将客户转接至人工客服，可向接管客服说明客户需求和当前背景便于处理",
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

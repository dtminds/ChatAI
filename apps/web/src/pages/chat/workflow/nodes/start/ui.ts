import { StartConfig } from "./panel";
import type { WorkflowNodeUiBinding } from "../ui-types";
import { getStartNodeSourceIds, isChatAiStartNodeData } from "../../types";

const triggerLabels = {
  "contact.friend_added": "添加好友",
  "contact.tag_added": "添加标签",
  "message.received": "用户消息",
} as const;

export const startNodeUi: WorkflowNodeUiBinding<"start"> = {
  body: {
    getFields: (data) => {
      const isChatAi = isChatAiStartNodeData(data);
      const sourceIds = getStartNodeSourceIds(data);
      const sourceLabel = isChatAi ? "托管账号" : "企微成员";
      return [
        {
          id: "sources",
          label: sourceLabel,
          value: sourceIds.length
            ? { kind: "text" as const, text: `已选 ${sourceIds.length} 个${sourceLabel}` }
            : { kind: "empty" as const },
        },
      {
        id: "triggers",
        label: "进入方式",
        value: data.entryMode === "direct-push"
          ? { kind: "text", text: "外部推送" }
          : data.triggers.length
          ? {
              kind: "text",
              maxLines: 2,
              text: [...new Set(data.triggers.map(trigger => triggerLabels[trigger.type]))].join("、"),
            }
          : { kind: "empty" },
      },
      {
        id: "entry-limit",
        label: "进入限制",
        value: { kind: "text", text: formatEntryPolicy(data.entryPolicy) },
      },
      ];
    },
    kind: "fields",
  },
  settings: {
    component: StartConfig,
    kind: "custom",
  },
};

function formatEntryPolicy(policy: import("@chatai/contracts").WorkflowEntryPolicy) {
  if (policy.mode === "never") return "不允许重复进入";
  if (policy.mode === "lifetime_limit") return `每个客户最多进入 ${policy.maxEntries} 次`;
  return `${policy.windowSize} ${policy.windowUnit === "hour" ? "小时" : "天"}内最多进入 ${policy.maxEntries} 次`;
}

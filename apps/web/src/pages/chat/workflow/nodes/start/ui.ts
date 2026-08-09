import { StartConfig } from "./panel";
import type { WorkflowNodeUiBinding } from "../ui-types";

const triggerLabels = {
  "contact.friend_added": "添加好友",
  "customer.tag_added": "添加标签",
  "message.received": "用户消息",
} as const;

export const startNodeUi: WorkflowNodeUiBinding<"start"> = {
  body: {
    getFields: (data) => [
      {
        id: "hosting-accounts",
        label: "托管账号",
        value: data.accountIds.length
          ? { kind: "text", text: `已选 ${data.accountIds.length} 个账号` }
          : { kind: "empty" },
      },
      {
        id: "triggers",
        label: "触发条件",
        value: data.triggers.length
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
    ],
    kind: "fields",
  },
  settings: {
    component: StartConfig,
    kind: "custom",
  },
};

function formatEntryPolicy(policy: import("@chatai/contracts").WorkflowEntryPolicy) {
  if (policy.mode === "never") return "不允许重复进入";
  if (policy.mode === "lifetime_limit") return `最多进入 ${policy.maxEntries} 次`;
  return `${policy.windowSize} ${policy.windowUnit === "hour" ? "小时" : "天"}内最多 ${policy.maxEntries} 次`;
}

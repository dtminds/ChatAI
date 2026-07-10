import type { WorkflowNodeUiBinding } from "../ui-types";
import { MessageConfig } from "./panel";

export const messageNodeUi: WorkflowNodeUiBinding<"message"> = {
  body: {
    getFields: (data) => [
      {
        id: "content",
        label: "消息内容",
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "text", maxLines: 3, text: data.metric },
      },
    ],
    kind: "fields",
  },
  settings: { component: MessageConfig, kind: "custom" },
};

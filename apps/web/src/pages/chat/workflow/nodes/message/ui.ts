import type { WorkflowNodeUiBinding } from "../ui-types";

export const messageNodeUi: WorkflowNodeUiBinding<"message"> = {
  body: {
    getFields: (data) => [
      {
        id: "content",
        label: "消息内容",
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "text", text: data.metric },
      },
    ],
    kind: "fields",
  },
  settings: { kind: "schema", nodeKind: "message" },
};

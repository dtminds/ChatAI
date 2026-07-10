import type { WorkflowNodeUiBinding } from "../ui-types";

export const tagNodeUi: WorkflowNodeUiBinding<"tag"> = {
  body: {
    getFields: (data) => [
      {
        id: "tag",
        label: "客户标签",
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "tag", text: data.metric },
      },
    ],
    kind: "fields",
  },
  settings: { kind: "schema", nodeKind: "tag" },
};

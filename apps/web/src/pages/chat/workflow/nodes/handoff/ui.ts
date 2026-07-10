import type { WorkflowNodeUiBinding } from "../ui-types";

export const handoffNodeUi: WorkflowNodeUiBinding<"handoff"> = {
  body: {
    getFields: (data) => [
      {
        id: "target",
        label: "接管目标",
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "text", text: data.metric },
      },
    ],
    kind: "fields",
  },
  settings: { kind: "schema", nodeKind: "handoff" },
};

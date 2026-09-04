import type { WorkflowNodeKind } from "../types";
import type { WorkflowNodeUiBinding } from "./ui-types";

export function createPlaceholderNodeUi<TKind extends WorkflowNodeKind>(
  kind: TKind,
  fieldLabel: string,
): WorkflowNodeUiBinding<TKind> {
  return {
    body: {
      getFields: (data) => [{
        id: "configuration",
        label: fieldLabel,
        value: data.metric.startsWith("待配置")
          ? { kind: "empty" }
          : { kind: "text", maxLines: 2, text: data.metric },
      }],
      kind: "fields",
    },
    settings: { kind: "schema", nodeKind: kind },
  };
}

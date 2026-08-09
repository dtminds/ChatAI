import type { WorkflowNodeUiBinding } from "../ui-types";
import { getVariableContentPreview } from "../variable-content/content";
import { HandoffConfig } from "./panel";

export const handoffNodeUi: WorkflowNodeUiBinding<"handoff"> = {
  body: {
    getFields: (data) => [
      {
        id: "operator-message",
        label: "客服提示",
        value: data.operatorMessage?.length
          ? {
              kind: "text",
              maxLines: 2,
              text: getVariableContentPreview(data.operatorMessage, data.availableVariables),
            }
          : { kind: "empty" },
      },
      {
        id: "customer-message",
        label: "对客话术",
        value: data.customerMessage?.length
          ? {
              kind: "text",
              maxLines: 2,
              text: getVariableContentPreview(data.customerMessage, data.availableVariables),
            }
          : { kind: "empty" },
      },
    ],
    kind: "fields",
  },
  settings: { component: HandoffConfig, kind: "custom" },
};

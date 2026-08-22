import type { WorkflowNodeUiBinding } from "../ui-types";
import { getVariableContentSummarySegments } from "../variable-content/content";
import { HandoffConfig } from "./panel";

export const handoffNodeUi: WorkflowNodeUiBinding<"handoff"> = {
  body: {
    getFields: (data) => [
      {
        id: "operator-message",
        label: "客服提示",
        value: data.operatorMessage?.length
          ? {
              items: getVariableContentSummarySegments(
                data.operatorMessage,
                data.availableVariables,
              ),
              kind: "segments",
              maxLines: 2,
            }
          : { kind: "empty" },
      },
      {
        id: "customer-message",
        label: "对客话术",
        value: data.customerMessage?.length
          ? {
              items: getVariableContentSummarySegments(
                data.customerMessage,
                data.availableVariables,
              ),
              kind: "segments",
              maxLines: 2,
            }
          : { kind: "empty" },
      },
    ],
    kind: "fields",
  },
  settings: { component: HandoffConfig, kind: "custom" },
};

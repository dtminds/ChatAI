import { StandardNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const actionNodeUi: WorkflowNodeUiBinding<"action"> = {
  body: StandardNodeBody,
  settings: {
    kind: "schema",
    nodeKind: "action",
  },
};

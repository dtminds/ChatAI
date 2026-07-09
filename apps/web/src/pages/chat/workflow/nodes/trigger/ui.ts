import { StandardNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const triggerNodeUi: WorkflowNodeUiBinding = {
  body: StandardNodeBody,
  settings: {
    kind: "schema",
    nodeKind: "trigger",
  },
};

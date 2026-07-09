import { StandardNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const aiNodeUi: WorkflowNodeUiBinding = {
  body: StandardNodeBody,
  settings: {
    kind: "schema",
    nodeKind: "ai",
  },
};

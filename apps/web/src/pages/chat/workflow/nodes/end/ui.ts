import type { WorkflowNodeUiBinding } from "../ui-types";

export const endNodeUi: WorkflowNodeUiBinding<"end"> = {
  body: { kind: "none" },
  settings: { kind: "none" },
};

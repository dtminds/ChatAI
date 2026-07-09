import { BranchConfig } from "../../panels/node-settings";
import { BranchNodeBody } from "../node-bodies";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const branchNodeUi: WorkflowNodeUiBinding = {
  body: BranchNodeBody,
  settings: {
    component: BranchConfig,
    kind: "custom",
  },
};

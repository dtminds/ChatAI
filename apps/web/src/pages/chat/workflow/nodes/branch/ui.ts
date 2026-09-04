import { BranchConfig } from "../../panels/node-settings";
import { BranchNodeBody } from "./body";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const branchNodeUi: WorkflowNodeUiBinding<"branch"> = {
  body: {
    component: BranchNodeBody,
    kind: "custom",
  },
  settings: {
    component: BranchConfig,
    kind: "custom",
  },
};

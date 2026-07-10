import type { WorkflowNodeKind } from "../types";
import { actionNodeUi } from "./action/ui";
import { aiNodeUi } from "./ai/ui";
import { branchNodeUi } from "./branch/ui";
import { goalNodeUi } from "./goal/ui";
import { triggerNodeUi } from "./trigger/ui";
import { waitNodeUi } from "./wait/ui";
import type { WorkflowNodeUiBinding } from "./ui-types";

export const workflowNodeUiRegistry = {
  action: actionNodeUi,
  ai: aiNodeUi,
  branch: branchNodeUi,
  goal: goalNodeUi,
  trigger: triggerNodeUi,
  wait: waitNodeUi,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeUiBinding<TKind>;
};

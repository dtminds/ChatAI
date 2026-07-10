import type { WorkflowNodeKind } from "../types";
import type { WorkflowNodeDefinition } from "./definition-types";
import { actionNodeDefinition } from "./action/definition";
import { aiNodeDefinition } from "./ai/definition";
import { branchNodeDefinition } from "./branch/definition";
import { goalNodeDefinition } from "./goal/definition";
import { triggerNodeDefinition } from "./trigger/definition";
import { waitNodeDefinition } from "./wait/definition";

export const workflowNodeDefinitions = {
  action: actionNodeDefinition,
  ai: aiNodeDefinition,
  branch: branchNodeDefinition,
  goal: goalNodeDefinition,
  trigger: triggerNodeDefinition,
  wait: waitNodeDefinition,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeDefinition<TKind>;
};

export const orderedWorkflowNodeDefinitions = Object.values(workflowNodeDefinitions).sort(
  (first, second) => first.sort - second.sort,
);

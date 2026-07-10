import type { WorkflowNodeKind } from "../types";
import type { WorkflowNodeDefinition } from "./definition-types";
import { branchNodeDefinition } from "./branch/definition";
import { couponNodeDefinition } from "./coupon/definition";
import { endNodeDefinition } from "./end/definition";
import { handoffNodeDefinition } from "./handoff/definition";
import { messageNodeDefinition } from "./message/definition";
import { startNodeDefinition } from "./start/definition";
import { tagNodeDefinition } from "./tag/definition";
import { waitNodeDefinition } from "./wait/definition";

export const workflowNodeDefinitions = {
  branch: branchNodeDefinition,
  coupon: couponNodeDefinition,
  end: endNodeDefinition,
  handoff: handoffNodeDefinition,
  message: messageNodeDefinition,
  start: startNodeDefinition,
  tag: tagNodeDefinition,
  wait: waitNodeDefinition,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeDefinition<TKind>;
};

export const orderedWorkflowNodeDefinitions = Object.values(workflowNodeDefinitions).sort(
  (first, second) => first.sort - second.sort,
);

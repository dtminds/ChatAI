import type { WorkflowNodeKind } from "../types";
import type { WorkflowNodeDefinition } from "./definition-types";
import { agentNodeDefinition } from "./agent/definition";
import { aiCollectNodeDefinition } from "./ai-collect/definition";
import { aiIntentNodeDefinition } from "./ai-intent/definition";
import { branchNodeDefinition } from "./branch/definition";
import { couponNodeDefinition } from "./coupon/definition";
import { customerUpdateNodeDefinition } from "./customer-update/definition";
import { endNodeDefinition } from "./end/definition";
import { handoffNodeDefinition } from "./handoff/definition";
import { llmNodeDefinition } from "./llm/definition";
import { messageNodeDefinition } from "./message/definition";
import { orderQueryNodeDefinition } from "./order-query/definition";
import { startNodeDefinition } from "./start/definition";
import { tagNodeDefinition } from "./tag/definition";
import { tagQueryNodeDefinition } from "./tag-query/definition";
import { waitNodeDefinition } from "./wait/definition";

export const workflowNodeDefinitions = {
  agent: agentNodeDefinition,
  "ai-collect": aiCollectNodeDefinition,
  "ai-intent": aiIntentNodeDefinition,
  branch: branchNodeDefinition,
  coupon: couponNodeDefinition,
  "customer-update": customerUpdateNodeDefinition,
  end: endNodeDefinition,
  handoff: handoffNodeDefinition,
  llm: llmNodeDefinition,
  message: messageNodeDefinition,
  "order-query": orderQueryNodeDefinition,
  start: startNodeDefinition,
  tag: tagNodeDefinition,
  "tag-query": tagQueryNodeDefinition,
  wait: waitNodeDefinition,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeDefinition<TKind>;
};

export const orderedWorkflowNodeDefinitions = Object.values(workflowNodeDefinitions).sort(
  (first, second) => first.sort - second.sort,
);

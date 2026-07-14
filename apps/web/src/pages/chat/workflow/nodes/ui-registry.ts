import type { WorkflowNodeKind } from "../types";
import { agentNodeUi } from "./agent/ui";
import { aiCollectNodeUi } from "./ai-collect/ui";
import { aiIntentNodeUi } from "./ai-intent/ui";
import { branchNodeUi } from "./branch/ui";
import { couponNodeUi } from "./coupon/ui";
import { customerUpdateNodeUi } from "./customer-update/ui";
import { endNodeUi } from "./end/ui";
import { handoffNodeUi } from "./handoff/ui";
import { llmNodeUi } from "./llm/ui";
import { messageNodeUi } from "./message/ui";
import { orderQueryNodeUi } from "./order-query/ui";
import { startNodeUi } from "./start/ui";
import { tagNodeUi } from "./tag/ui";
import { tagQueryNodeUi } from "./tag-query/ui";
import { waitNodeUi } from "./wait/ui";
import type { WorkflowNodeUiBinding } from "./ui-types";

export const workflowNodeUiRegistry = {
  agent: agentNodeUi,
  "ai-collect": aiCollectNodeUi,
  "ai-intent": aiIntentNodeUi,
  branch: branchNodeUi,
  coupon: couponNodeUi,
  "customer-update": customerUpdateNodeUi,
  end: endNodeUi,
  handoff: handoffNodeUi,
  llm: llmNodeUi,
  message: messageNodeUi,
  "order-query": orderQueryNodeUi,
  start: startNodeUi,
  tag: tagNodeUi,
  "tag-query": tagQueryNodeUi,
  wait: waitNodeUi,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeUiBinding<TKind>;
};

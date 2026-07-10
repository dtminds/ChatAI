import type { WorkflowNodeKind } from "../types";
import { branchNodeUi } from "./branch/ui";
import { couponNodeUi } from "./coupon/ui";
import { endNodeUi } from "./end/ui";
import { handoffNodeUi } from "./handoff/ui";
import { messageNodeUi } from "./message/ui";
import { startNodeUi } from "./start/ui";
import { tagNodeUi } from "./tag/ui";
import { waitNodeUi } from "./wait/ui";
import type { WorkflowNodeUiBinding } from "./ui-types";

export const workflowNodeUiRegistry = {
  branch: branchNodeUi,
  coupon: couponNodeUi,
  end: endNodeUi,
  handoff: handoffNodeUi,
  message: messageNodeUi,
  start: startNodeUi,
  tag: tagNodeUi,
  wait: waitNodeUi,
} satisfies {
  [TKind in WorkflowNodeKind]: WorkflowNodeUiBinding<TKind>;
};

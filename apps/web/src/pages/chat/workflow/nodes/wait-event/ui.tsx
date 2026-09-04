import type { WorkflowNodeUiBinding } from "../ui-types";
import { WaitEventNodeBody } from "./body";
import { WaitEventConfig } from "./panel";

export const waitEventNodeUi: WorkflowNodeUiBinding<"wait-event"> = {
  body: {
    component: WaitEventNodeBody,
    kind: "custom",
  },
  settings: { component: WaitEventConfig, kind: "custom" },
};

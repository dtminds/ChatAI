import { TriggerConfig } from "./panel";
import { TriggerNodeBody } from "./body";
import type { WorkflowNodeUiBinding } from "../ui-types";

export const triggerNodeUi: WorkflowNodeUiBinding = {
  body: TriggerNodeBody,
  settings: {
    component: TriggerConfig,
    kind: "custom",
  },
};

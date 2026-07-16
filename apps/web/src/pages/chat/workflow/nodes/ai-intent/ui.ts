import type { WorkflowNodeUiBinding } from "../ui-types";
import { AiIntentNodeBody } from "./body";
import { AiIntentConfig } from "./panel";

export const aiIntentNodeUi: WorkflowNodeUiBinding<"ai-intent"> = {
  body: {
    component: AiIntentNodeBody,
    kind: "custom",
  },
  settings: { component: AiIntentConfig, kind: "custom" },
};

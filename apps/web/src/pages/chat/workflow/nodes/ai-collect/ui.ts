import type { WorkflowNodeUiBinding } from "../ui-types";
import { AiCollectNodeBody } from "./body";
import { AiCollectConfig } from "./panel";

export const aiCollectNodeUi: WorkflowNodeUiBinding<"ai-collect"> = {
  body: { component: AiCollectNodeBody, kind: "custom" },
  settings: { component: AiCollectConfig, kind: "custom" },
};

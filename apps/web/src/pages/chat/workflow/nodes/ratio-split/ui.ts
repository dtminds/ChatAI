import type { WorkflowNodeUiBinding } from "../ui-types";
import { RatioSplitNodeBody } from "./body";
import { RatioSplitConfig } from "./panel";

export const ratioSplitNodeUi: WorkflowNodeUiBinding<"ratio-split"> = {
  body: {
    component: RatioSplitNodeBody,
    kind: "custom",
  },
  settings: {
    component: RatioSplitConfig,
    kind: "custom",
  },
};

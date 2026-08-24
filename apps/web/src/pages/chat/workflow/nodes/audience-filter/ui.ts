import type { WorkflowNodeUiBinding } from "../ui-types";
import { AudienceFilterNodeBody } from "./body";
import { AudienceFilterConfig } from "./panel";

export const audienceFilterNodeUi: WorkflowNodeUiBinding<"audience-filter"> = {
  body: {
    component: AudienceFilterNodeBody,
    kind: "custom",
  },
  settings: { component: AudienceFilterConfig, kind: "custom" },
};

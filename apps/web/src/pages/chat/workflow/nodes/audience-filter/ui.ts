import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getWorkflowAudienceFilterMatchModeLabel,
  normalizeWorkflowAudienceFilterMatchMode,
  normalizeWorkflowAudienceGroups,
} from "./config";
import { AudienceFilterConfig } from "./panel";

export const audienceFilterNodeUi: WorkflowNodeUiBinding<"audience-filter"> = {
  body: {
    getFields: (data) => {
      const groups = normalizeWorkflowAudienceGroups(data.groups);
      const matchMode = normalizeWorkflowAudienceFilterMatchMode(data.matchMode);
      return [
        {
          id: "match-mode",
          label: "匹配方式",
          value: {
            kind: "text",
            text: getWorkflowAudienceFilterMatchModeLabel(matchMode),
          },
        },
        {
          id: "groups",
          label: "人群包",
          value: groups.length > 0
            ? { kind: "text", text: `已选择 ${groups.length} 个` }
            : { kind: "empty" },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: AudienceFilterConfig, kind: "custom" },
};

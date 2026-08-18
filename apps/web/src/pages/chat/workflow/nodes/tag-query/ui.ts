import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getWorkflowTagQueryMatchModeLabel,
  normalizeWorkflowTagQueryIds,
  normalizeWorkflowTagQueryMatchMode,
} from "./config";
import { TagQueryConfig } from "./panel";

export const tagQueryNodeUi: WorkflowNodeUiBinding<"tag-query"> = {
  body: {
    getFields: (data) => {
      const tagIds = normalizeWorkflowTagQueryIds(data.tagIds);
      const matchMode = normalizeWorkflowTagQueryMatchMode(data.matchMode);
      return [
        {
          id: "match-mode",
          label: "匹配方式",
          value: {
            kind: "text",
            text: getWorkflowTagQueryMatchModeLabel(matchMode),
          },
        },
        {
          id: "tags",
          label: "客户标签",
          value: tagIds.length > 0
            ? { kind: "text", text: `已选择 ${tagIds.length} 个` }
            : { kind: "empty" },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: TagQueryConfig, kind: "custom" },
};

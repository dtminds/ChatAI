import type { WorkflowNodeUiBinding } from "../ui-types";
import { normalizeWorkflowTagIds, normalizeWorkflowTagOperation } from "./config";
import { TagConfig } from "./panel";

export const tagNodeUi: WorkflowNodeUiBinding<"tag"> = {
  body: {
    getFields: (data) => {
      const operation = normalizeWorkflowTagOperation(data.operation);
      const tagIds = normalizeWorkflowTagIds(data.tagIds);
      return [
        {
          id: "operation",
          label: "操作方式",
          value: { kind: "text", text: operation === "add" ? "添加标签" : "移除标签" },
        },
        {
          id: "tag",
          label: "客户标签",
          value: tagIds.length > 0
            ? { kind: "text", text: `已选择 ${tagIds.length} 个` }
            : { kind: "empty" },
        },
      ];
    },
    kind: "fields",
  },
  settings: { component: TagConfig, kind: "custom" },
};

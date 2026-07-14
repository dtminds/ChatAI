import type { WorkflowNodeUiBinding } from "../ui-types";
import { getVariableContentPreview } from "../variable-content/content";
import { normalizeWorkflowMessageAttachments } from "./attachments";
import { MessageConfig } from "./panel";

export const messageNodeUi: WorkflowNodeUiBinding<"message"> = {
  body: {
    getFields: (data) => {
      const contentPreview = getVariableContentPreview(data.content, data.availableVariables);
      const attachmentCount = normalizeWorkflowMessageAttachments(data.attachments).length;

      return [{
        id: "content",
        label: "消息内容",
        value: contentPreview
          ? { kind: "text", maxLines: 3, text: contentPreview }
          : { kind: "empty" },
      },
      {
        id: "attachments",
        label: "附件",
        value: attachmentCount > 0
          ? { kind: "text", maxLines: 1, text: `${attachmentCount} 个` }
          : { kind: "empty" },
      }];
    },
    kind: "fields",
  },
  settings: { component: MessageConfig, kind: "custom" },
};

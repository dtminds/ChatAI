import type { WorkflowNodeUiBinding } from "../ui-types";
import {
  getWorkflowVariableDisplayLabel,
  resolveWorkflowVariable,
} from "../../workflow-variables";
import { getVariableContentPreview } from "../variable-content/content";
import { normalizeWorkflowMessageAttachments } from "./attachments";
import {
  normalizeWorkflowMessageContentMode,
  normalizeWorkflowMessageOutputSelector,
} from "./content-source";
import { MessageConfig } from "./panel";

export const messageNodeUi: WorkflowNodeUiBinding<"message"> = {
  body: {
    getFields: (data) => {
      const contentMode = normalizeWorkflowMessageContentMode(data.contentMode);
      const outputSelector = normalizeWorkflowMessageOutputSelector(data.outputSelector);
      const resolvedOutput = outputSelector
        ? resolveWorkflowVariable(data.availableVariables ?? [], outputSelector)
        : undefined;
      const selectedOutput = resolvedOutput?.type === "string"
        && resolvedOutput.usages?.includes("message-content")
        ? resolvedOutput
        : undefined;
      const contentPreview = contentMode === "node-output"
        ? selectedOutput ? getWorkflowVariableDisplayLabel(selectedOutput) : ""
        : getVariableContentPreview(data.content, data.availableVariables);
      const attachmentCount = normalizeWorkflowMessageAttachments(data.attachments).length;

      return [{
        id: "content",
        label: "消息内容",
        value: contentPreview
          ? { kind: "text", maxLines: 3, text: contentPreview }
          : {
              kind: "empty",
              text: contentMode === "node-output" && outputSelector
                ? "输出不可用"
                : undefined,
            },
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

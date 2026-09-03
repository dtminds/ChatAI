import type { WorkflowNodeUiBinding } from "../ui-types";
import { resolveWorkflowVariable } from "../../workflow-variables";
import { createWorkflowVariableReferenceSummarySegments } from "../../workflow-node-summary";
import {
  getVariableContentPreview,
  getVariableContentSummarySegments,
} from "../variable-content/content";
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
        ? resolveWorkflowVariable(data.availableMessageContentOutputs ?? [], outputSelector)
        : undefined;
      const selectedOutput = resolvedOutput?.type === "string"
        && resolvedOutput.usages?.includes("message-content")
        ? resolvedOutput
        : undefined;
      const customContentPreview = getVariableContentPreview(data.content, data.availableVariables);
      const contentValue = contentMode === "node-output"
        ? selectedOutput
          ? {
              items: createWorkflowVariableReferenceSummarySegments(selectedOutput),
              kind: "segments" as const,
              maxLines: 3,
            }
          : {
              kind: "empty" as const,
              text: outputSelector ? "输出不可用" : undefined,
            }
        : customContentPreview
          ? {
              items: getVariableContentSummarySegments(data.content, data.availableVariables),
              kind: "segments" as const,
              maxLines: 3,
            }
          : { kind: "empty" as const };
      const attachmentCount = normalizeWorkflowMessageAttachments(data.attachments).length;

      return [{
        id: "content",
        label: "消息内容",
        value: contentValue,
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

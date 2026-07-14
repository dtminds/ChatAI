import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
  QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH,
} from "@chatai/contracts";
import { MessageAttachmentPicker } from "@/pages/chat/components/message-content/message-attachment-picker";
import type { NodeSettingsProps } from "../../panels/types";
import { getAvailableVariablesForNode } from "../../workflow-variables";
import { getVariableContentPreview, normalizeVariableContent } from "../variable-content/content";
import { VariableContentEditor } from "../variable-content/editor";
import { normalizeWorkflowMessageAttachments } from "./attachments";

export function MessageConfig({ edges, node, nodes, onNodeChange }: NodeSettingsProps<"message">) {
  const variables = getAvailableVariablesForNode(node.id, nodes, edges);
  const attachments = normalizeWorkflowMessageAttachments(node.data.attachments);

  const updateMessage = ({
    attachments: nextAttachments = attachments,
    content: nextContent = normalizeVariableContent(node.data.content),
  }: {
    attachments?: typeof attachments;
    content?: ReturnType<typeof normalizeVariableContent>;
  }) => {
    const preview = getVariableContentPreview(nextContent, variables);
    const attachmentMetric = nextAttachments.length > 0
      ? `${nextAttachments.length} 个附件`
      : "";

    onNodeChange({
      attachments: nextAttachments,
      content: nextContent,
      metric: preview || attachmentMetric || "待配置消息内容",
      status: preview || attachmentMetric ? "ready" : "warning",
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">消息内容</h3>
        <VariableContentEditor
          ariaLabel="消息内容"
          maxLength={QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH}
          onChange={(content) => updateMessage({ content })}
          placeholder="请输入消息内容"
          segments={normalizeVariableContent(node.data.content)}
          variables={variables}
        />
      </section>
      <MessageAttachmentPicker
        attachments={attachments}
        imageSource="material-library"
        maxCount={QUICK_REPLY_ATTACHMENT_MAX_COUNT}
        onChange={(nextAttachments) => updateMessage({
          attachments: normalizeWorkflowMessageAttachments(nextAttachments),
        })}
      />
    </div>
  );
}

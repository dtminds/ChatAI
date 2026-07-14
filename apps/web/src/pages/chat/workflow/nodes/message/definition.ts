import { Message01Icon } from "@hugeicons/core-free-icons";
import {
  QUICK_REPLY_ATTACHMENT_MAX_COUNT,
} from "@chatai/contracts";
import type { WorkflowNodeDefinition } from "../definition-types";
import { createStandardNodeDefinition } from "../standard-node-definition-factory";
import {
  getVariableContentText,
  normalizeVariableContent,
} from "../variable-content/content";
import {
  hasInvalidWorkflowMessageAttachments,
  normalizeWorkflowMessageAttachments,
} from "./attachments";

const baseMessageNodeDefinition = createStandardNodeDefinition({
  accentClassName: "bg-sky-500 text-white ring-sky-500/20",
  accentRgb: "14 165 233",
  description: "向客户发送营销消息",
  icon: Message01Icon,
  kind: "message",
  label: "消息发送",
  metric: "待配置消息内容",
  paletteGroup: "message",
  sort: 100,
});

export const messageNodeDefinition: WorkflowNodeDefinition<"message"> = {
  ...baseMessageNodeDefinition,
  createDefaultData: () => ({
    ...baseMessageNodeDefinition.createDefaultData(),
    attachments: [],
    content: [],
    metric: "待配置消息内容",
    status: "warning",
  }),
  createExecutionConfig: (data) => ({
    attachments: normalizeWorkflowMessageAttachments(data.attachments),
    content: normalizeVariableContent(data.content),
  }),
  sanitizeData: (data) => ({
    ...data,
    attachments: normalizeWorkflowMessageAttachments(data.attachments),
    content: normalizeVariableContent(data.content),
  }),
  validate: (node) => {
    const contentText = getVariableContentText(node.data.content).trim();
    const attachments = normalizeWorkflowMessageAttachments(node.data.attachments);
    const issues = [];

    if (!contentText && attachments.length === 0) {
      issues.push(createMessageIssue(
        "message-content-required",
        "消息节点需要配置消息内容或附件",
      ));
    }

    if (attachments.length > QUICK_REPLY_ATTACHMENT_MAX_COUNT) {
      issues.push(createMessageIssue(
        "message-attachments-too-many",
        `附件不能超过 ${QUICK_REPLY_ATTACHMENT_MAX_COUNT} 个`,
      ));
    }

    if (hasInvalidWorkflowMessageAttachments(node.data.attachments)) {
      issues.push(createMessageIssue(
        "message-attachment-invalid",
        "消息附件数据异常，请重新选择",
      ));
    }

    return issues;
  },
};

function createMessageIssue(code: string, message: string) {
  return {
    code,
    message,
    severity: "warning" as const,
    source: "config" as const,
  };
}

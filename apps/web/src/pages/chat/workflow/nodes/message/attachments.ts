import {
  normalizeQuickReplyAttachments,
  validateQuickReplyAttachment,
  type WorkbenchQuickReplyAttachment,
} from "@chatai/contracts";
import type { WorkflowNodeStatus } from "../../types";

export function normalizeWorkflowMessageAttachments(
  attachments: unknown,
): WorkbenchQuickReplyAttachment[] {
  return normalizeQuickReplyAttachments(attachments).map((attachment) => ({
    ...attachment,
    content: sanitizeAttachmentContent(attachment.content),
  }));
}

export function hasInvalidWorkflowMessageAttachments(attachments: unknown) {
  const rawAttachments = Array.isArray(attachments) ? attachments : [];
  const normalizedAttachments = normalizeWorkflowMessageAttachments(attachments);

  if (normalizedAttachments.length !== rawAttachments.length) {
    return true;
  }

  return normalizedAttachments.some((attachment) => (
    !attachment.materialCollectionId
    || !attachment.msgInfoId
    || !validateQuickReplyAttachment(attachment).ok
  ));
}

export function getWorkflowMessageNodeStatus({
  attachments,
  hasContent,
  requiresContent = false,
}: {
  attachments: unknown;
  hasContent: boolean;
  requiresContent?: boolean;
}): WorkflowNodeStatus {
  const normalizedAttachments = normalizeWorkflowMessageAttachments(attachments);
  const configured = requiresContent
    ? hasContent
    : hasContent || normalizedAttachments.length > 0;

  return configured && !hasInvalidWorkflowMessageAttachments(attachments)
    ? "ready"
    : "warning";
}

function sanitizeAttachmentContent(content: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(content).flatMap(([key, value]) => {
      if (key === "localUrl") {
        return [];
      }

      const sanitizedValue = sanitizeAttachmentValue(value);
      return sanitizedValue === undefined ? [] : [[key, sanitizedValue]];
    }),
  );
}

function sanitizeAttachmentValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("blob:") ? undefined : value;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value.flatMap((item) => {
      const sanitizedItem = sanitizeAttachmentValue(item);
      return sanitizedItem === undefined ? [] : [sanitizedItem];
    });

    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (value && typeof value === "object") {
    const sanitizedRecord = sanitizeAttachmentContent(
      value as Record<string, unknown>,
    );

    return Object.keys(sanitizedRecord).length > 0 ? sanitizedRecord : undefined;
  }

  return value;
}

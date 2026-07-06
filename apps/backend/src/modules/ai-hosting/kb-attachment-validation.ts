import type { KbAttachmentContent, KbAttachmentType } from "@chatai/contracts";
import {
  validateQuickReplyAttachment,
  type WorkbenchQuickReplyAttachment,
} from "@chatai/contracts";
import { BadRequestError } from "../../shared/errors.js";

const ATTACHMENT_TYPE_TO_CONTENT_TYPE = {
  2: "file",
  3: "weapp",
  4: "h5",
  6: "image",
  7: "file",
} as const satisfies Record<KbAttachmentType, WorkbenchQuickReplyAttachment["type"]>;

export function validateKbAttachmentContent(
  attachmentType: KbAttachmentType,
  attachmentContent: KbAttachmentContent,
) {
  if (!attachmentContent || Object.keys(attachmentContent).length === 0) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "附件数据不完整");
  }

  const expectedType = ATTACHMENT_TYPE_TO_CONTENT_TYPE[attachmentType];

  if (attachmentContent.type !== expectedType) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "附件数据不完整");
  }

  const quickReplyAttachment: WorkbenchQuickReplyAttachment = {
    content: attachmentContent.content,
    type: attachmentContent.type,
    ...(attachmentContent.materialCollectionId
      ? { materialCollectionId: attachmentContent.materialCollectionId }
      : {}),
    ...(attachmentContent.msgInfoId ? { msgInfoId: attachmentContent.msgInfoId } : {}),
    ...(attachmentContent.msgid ? { msgid: attachmentContent.msgid } : {}),
  };

  const result = validateQuickReplyAttachment(quickReplyAttachment);

  if (!result.ok) {
    throw new BadRequestError("KB_ATTACHMENT_INVALID", "附件数据不完整");
  }
}

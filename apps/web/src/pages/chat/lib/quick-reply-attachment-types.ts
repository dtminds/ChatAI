import type { WorkbenchQuickReplyAttachment } from "@chatai/contracts";

export type QuickReplyLocalImageAttachment = WorkbenchQuickReplyAttachment & {
  localFile: File;
};

export type QuickReplyDraftAttachment =
  | WorkbenchQuickReplyAttachment
  | QuickReplyLocalImageAttachment;

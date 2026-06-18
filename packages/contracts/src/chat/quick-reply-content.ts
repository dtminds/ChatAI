export const QUICK_REPLY_CATEGORY_TITLE_MAX_LENGTH = 10;
export const QUICK_REPLY_LABEL_TEXT_MAX_LENGTH = 10;
export const QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH = 1000;
export const QUICK_REPLY_IMPORT_MAX_ROWS = 1000;
export const QUICK_REPLY_BATCH_CREATE_LIMIT = 100;
export const QUICK_REPLY_IMPORT_PRIMARY_CATEGORY_LIMIT = 100;
export const QUICK_REPLY_IMPORT_SECONDARY_CATEGORY_LIMIT = 500;
export const QUICK_REPLY_ATTACHMENT_MAX_COUNT = 5;
export const QUICK_REPLY_TOP_CATEGORY_LIMIT = 50;
export const QUICK_REPLY_CHILD_CATEGORY_LIMIT = 50;
export const QUICK_REPLY_TOP_CATEGORY_ITEM_LIMIT = 5000;
export const QUICK_REPLY_CATEGORY_CONTENT_ITEM_LIMIT = 10_000;

export const QUICK_REPLY_LABEL_COLOR_VALUES = [
  "",
  "orange",
  "green",
  "blue",
  "pink",
  "purple",
  "rose",
  "teal",
  "brown",
  "slate",
] as const;

export type QuickReplyLabelColor =
  (typeof QUICK_REPLY_LABEL_COLOR_VALUES)[number];

export function isQuickReplyLabelColor(
  value: string,
): value is QuickReplyLabelColor {
  return QUICK_REPLY_LABEL_COLOR_VALUES.includes(value as QuickReplyLabelColor);
}

export const QUICK_REPLY_SCOPE_TYPE = {
  ENTERPRISE: 1,
  PERSONAL: 2,
} as const;

export type QuickReplyScopeType =
  (typeof QUICK_REPLY_SCOPE_TYPE)[keyof typeof QUICK_REPLY_SCOPE_TYPE];

export type WorkbenchQuickReplyAttachmentType =
  | "image"
  | "file"
  | "h5"
  | "weapp"
  | "sphfeed";

export type WorkbenchQuickReplyAttachment = {
  type: WorkbenchQuickReplyAttachmentType;
  materialCollectionId?: string;
  msgid?: string;
  content: Record<string, unknown>;
};

export type QuickReplyValidationResult =
  | { ok: true }
  | { ok: false; errorMsg: string };

export function normalizeQuickReplyAttachments(
  attachments: unknown,
): WorkbenchQuickReplyAttachment[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.flatMap((attachment) => {
    if (!isRecord(attachment)) {
      return [];
    }

    const type = readString(attachment.type);

    if (!isQuickReplyAttachmentType(type)) {
      return [];
    }

    const content = isRecord(attachment.content)
      ? compactRecord(attachment.content)
      : {};
    const materialCollectionId = readString(attachment.materialCollectionId);
    const msgid = readString(attachment.msgid);

    return [
      {
        type,
        ...(materialCollectionId ? { materialCollectionId } : {}),
        ...(msgid ? { msgid } : {}),
        content,
      },
    ];
  });
}

export function validateQuickReplyPayload(input: {
  attachments: unknown;
  contentText: string | null | undefined;
}): QuickReplyValidationResult {
  const contentText = input.contentText?.trim() ?? "";
  const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];

  for (const attachment of rawAttachments) {
    if (!isRecord(attachment) || !isQuickReplyAttachmentType(readString(attachment.type))) {
      return { ok: false, errorMsg: "附件类型不支持" };
    }
  }

  const attachments = normalizeQuickReplyAttachments(input.attachments);

  if (!contentText && attachments.length === 0) {
    return { ok: false, errorMsg: "请填写话术内容或添加附件" };
  }

  if (contentText.length > QUICK_REPLY_CONTENT_TEXT_MAX_LENGTH) {
    return { ok: false, errorMsg: "话术内容不能超过1000字" };
  }

  if (attachments.length > QUICK_REPLY_ATTACHMENT_MAX_COUNT) {
    return { ok: false, errorMsg: "附件最多添加5个" };
  }

  for (const attachment of attachments) {
    const result = validateQuickReplyAttachment(attachment);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function validateQuickReplyAttachment(
  attachment: WorkbenchQuickReplyAttachment,
): QuickReplyValidationResult {
  if (attachment.type === "image") {
    return readString(attachment.content.fileUrl)
      ? { ok: true }
      : { ok: false, errorMsg: "图片附件数据异常" };
  }

  if (attachment.type === "file") {
    return attachment.materialCollectionId &&
      attachment.msgid &&
      readString(attachment.content.fileName) &&
      readString(attachment.content.fileUrl)
      ? { ok: true }
      : { ok: false, errorMsg: "文件附件数据异常" };
  }

  if (attachment.type === "h5") {
    return attachment.materialCollectionId &&
      attachment.msgid &&
      readString(attachment.content.title) &&
      (readString(attachment.content.href) ||
        readString(attachment.content.url) ||
        readString(attachment.content.linkUrl))
      ? { ok: true }
      : { ok: false, errorMsg: "H5附件数据异常" };
  }

  if (attachment.type === "weapp") {
    return attachment.materialCollectionId && attachment.msgid
      ? { ok: true }
      : { ok: false, errorMsg: "小程序附件数据异常" };
  }

  if (attachment.type === "sphfeed") {
    return attachment.materialCollectionId && attachment.msgid
      ? { ok: true }
      : { ok: false, errorMsg: "视频号附件数据异常" };
  }

  return { ok: false, errorMsg: "附件类型不支持" };
}

function isQuickReplyAttachmentType(
  value: string,
): value is WorkbenchQuickReplyAttachmentType {
  return (
    value === "image" ||
    value === "file" ||
    value === "h5" ||
    value === "weapp" ||
    value === "sphfeed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactRecord(record: Record<string, unknown>) {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    compacted[key] = value;
  }

  return compacted;
}

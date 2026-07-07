import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type KbAttachmentContent,
  type KbAttachmentListItem,
  type WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import type { QuickReplyDraftAttachment } from "@/pages/chat/components/quick-reply/quick-reply-attachment-picker";

export const KB_ATTACHMENT_TYPE = {
  FILE: 2,
  MINI_PROGRAM: 3,
  LINK: 4,
  IMAGE: 6,
  VIDEO: 7,
} as const;

export type KbAttachmentType =
  (typeof KB_ATTACHMENT_TYPE)[keyof typeof KB_ATTACHMENT_TYPE];

export type KbAttachmentItem = {
  attachmentType: KbAttachmentType;
  createdAt: number;
  description: string;
  fileSizeLabel?: string;
  id: string;
  payload: QuickReplyDraftAttachment;
  subtitle?: string;
  title: string;
};

export function getKbAttachmentPrimaryColumnLabel(type: KbAttachmentType) {
  const labels: Record<KbAttachmentType, string> = {
    [KB_ATTACHMENT_TYPE.IMAGE]: "图片",
    [KB_ATTACHMENT_TYPE.VIDEO]: "视频",
    [KB_ATTACHMENT_TYPE.FILE]: "文件",
    [KB_ATTACHMENT_TYPE.LINK]: "链接",
    [KB_ATTACHMENT_TYPE.MINI_PROGRAM]: "小程序",
  };

  return labels[type];
}

export function getKbAttachmentDeleteActionLabel(type: KbAttachmentType) {
  return type === KB_ATTACHMENT_TYPE.MINI_PROGRAM ? "移除" : "删除";
}

export const kbAttachmentTypeFilters: Array<{
  label: string;
  value: KbAttachmentType;
}> = [
  { label: "图片", value: KB_ATTACHMENT_TYPE.IMAGE },
  // { label: "视频", value: KB_ATTACHMENT_TYPE.VIDEO },
  { label: "文件", value: KB_ATTACHMENT_TYPE.FILE },
  { label: "链接", value: KB_ATTACHMENT_TYPE.LINK },
  { label: "小程序", value: KB_ATTACHMENT_TYPE.MINI_PROGRAM },
];

export function getKbAttachmentDialogTitle(type: KbAttachmentType, mode: "create" | "edit" = "create") {
  const prefix = mode === "edit" ? "编辑" : "添加";
  const titles: Record<KbAttachmentType, string> = {
    [KB_ATTACHMENT_TYPE.IMAGE]: `${prefix}图片附件`,
    [KB_ATTACHMENT_TYPE.VIDEO]: `${prefix}视频附件`,
    [KB_ATTACHMENT_TYPE.FILE]: `${prefix}文件附件`,
    [KB_ATTACHMENT_TYPE.LINK]: `${prefix}链接附件`,
    [KB_ATTACHMENT_TYPE.MINI_PROGRAM]: `${prefix}小程序附件`,
  };

  return titles[type];
}

export function getKbAttachmentDescriptionLabel(type: KbAttachmentType) {
  const labels: Record<KbAttachmentType, string> = {
    [KB_ATTACHMENT_TYPE.IMAGE]: "图片描述",
    [KB_ATTACHMENT_TYPE.VIDEO]: "视频描述",
    [KB_ATTACHMENT_TYPE.FILE]: "文件描述",
    [KB_ATTACHMENT_TYPE.LINK]: "链接描述",
    [KB_ATTACHMENT_TYPE.MINI_PROGRAM]: "小程序描述",
  };

  return labels[type];
}

export const KB_ATTACHMENT_DESCRIPTION_HINT_EMPHASIS = "命中后会作为附件发送。";

export function getKbAttachmentDescriptionHint(type: KbAttachmentType) {
  const hints: Record<KbAttachmentType, string> = {
    [KB_ATTACHMENT_TYPE.IMAGE]:
      "描述会参与对图片的检索，如电商场景下，描述可以用于存放图片对应的直播预告海报、活动海报、产品使用说明等，",
    [KB_ATTACHMENT_TYPE.VIDEO]:
      "描述会参与对视频的检索，如产品安装视频、使用教程等，",
    [KB_ATTACHMENT_TYPE.FILE]:
      "描述会参与对文件的检索，如产品安装说明、使用教程等，",
    [KB_ATTACHMENT_TYPE.LINK]:
      "描述会参与对链接的检索，如直播活动链接、公众号文章、外部链接，",
    [KB_ATTACHMENT_TYPE.MINI_PROGRAM]:
      "描述会参与对小程序的检索，如私域商城商品、营销活动、直播预告，",
  };

  return hints[type];
}

export function getKbMaterialBizType(type: KbAttachmentType) {
  return type;
}

export function isKbLocalUploadedImageMaterial(msgInfoId: string | undefined) {
  return msgInfoId === "0";
}

export function getKbAttachmentSelectLabel(type: KbAttachmentType) {
  const labels: Record<KbAttachmentType, string> = {
    [KB_ATTACHMENT_TYPE.IMAGE]: "选择图片",
    [KB_ATTACHMENT_TYPE.VIDEO]: "选择视频",
    [KB_ATTACHMENT_TYPE.FILE]: "选择文件",
    [KB_ATTACHMENT_TYPE.LINK]: "选择链接",
    [KB_ATTACHMENT_TYPE.MINI_PROGRAM]: "选择小程序",
  };

  return labels[type];
}

export function buildKbAttachmentPayloadFromMaterial(
  type: KbAttachmentType,
  item: WorkbenchMaterialCollectionItemDto,
): QuickReplyDraftAttachment | undefined {
  if (
    !item.msgInfoId
    || (item.msgInfoId === "0" && type !== KB_ATTACHMENT_TYPE.IMAGE)
  ) {
    return undefined;
  }

  if (type === KB_ATTACHMENT_TYPE.IMAGE && item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.IMAGE) {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "image",
    };
  }

  if (type === KB_ATTACHMENT_TYPE.VIDEO && item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.VIDEO) {
    const fileName = readString(item.content.fileName) || item.title.trim() || "视频";

    return {
      content: {
        ...item.content,
        fileName,
      },
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "file",
    };
  }

  if (type === KB_ATTACHMENT_TYPE.FILE && item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.FILE) {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "file",
    };
  }

  if (type === KB_ATTACHMENT_TYPE.LINK && item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.H5) {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "h5",
    };
  }

  if (
    type === KB_ATTACHMENT_TYPE.MINI_PROGRAM
    && item.bizType === MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM
  ) {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "weapp",
    };
  }

  return undefined;
}

export function getKbAttachmentTitle(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  if (payload.type === "file") {
    return readString(content.fileName) || "文件";
  }

  if (payload.type === "h5") {
    return readString(content.title) || "链接";
  }

  if (payload.type === "weapp") {
    return readString(content.title) || "小程序";
  }

  return readString(content.alt) || readString(content.fileName) || "图片";
}

export function extractKbAttachmentMeta(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  if (payload.type === "file") {
    const fileSizeLabel = readString(content.fileSizeLabel);

    return {
      fileSizeLabel: fileSizeLabel || undefined,
    };
  }

  if (payload.type === "weapp") {
    const subtitle = readString(content.appName);

    return {
      subtitle: subtitle || "小程序名称",
    };
  }

  return {};
}

export function getKbAttachmentPreviewUrl(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  if (payload.type === "image") {
    return getKbAttachmentImageUrl(payload);
  }

  if (payload.type === "file") {
    return readString(content.coverUrl) || undefined;
  }

  if (payload.type === "h5" || payload.type === "weapp") {
    return (
      readString(content.previewImageUrl)
      || readString(content.imageUrl)
      || readString(content.coverImageUrl)
      || readString(content.coverUrl)
      || undefined
    );
  }

  return readString(content.coverUrl) || readString(content.fileUrl) || undefined;
}

export function getKbAttachmentImageUrl(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  return (
    readString(content.localUrl)
    || readString(content.imageUrl)
    || readString(content.fileUrl)
    || readString(content.url)
    || undefined
  );
}

export function getKbAttachmentFileUrl(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  return readString(content.fileUrl) || readString(content.url) || undefined;
}

export function getKbAttachmentLinkUrl(payload: QuickReplyDraftAttachment) {
  const content = payload.content;

  return (
    readString(content.href)
    || readString(content.linkUrl)
    || readString(content.url)
    || undefined
  );
}

export function getKbAttachmentFileExtension(payload: QuickReplyDraftAttachment) {
  if (payload.type !== "file") {
    return "";
  }

  const content = payload.content;
  const extension = readString(content.extension);
  const fileName = readString(content.fileName);

  if (extension) {
    return extension.replace(/^\./, "").toLowerCase();
  }

  const index = fileName.lastIndexOf(".");

  return index >= 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

export function toKbAttachmentItem(item: KbAttachmentListItem): KbAttachmentItem {
  const payload = toQuickReplyDraftAttachment(item.attachmentContent);

  return {
    attachmentType: item.attachmentType,
    createdAt: parseKbAttachmentTimestamp(item.createdAt),
    description: item.description,
    fileSizeLabel: item.fileSizeLabel,
    id: item.chunkId,
    payload,
    subtitle: item.subtitle,
    title: resolveKbAttachmentDisplayTitle(item.attachmentType, item.title, payload),
  };
}

function resolveKbAttachmentDisplayTitle(
  attachmentType: KbAttachmentType,
  listTitle: string,
  payload: QuickReplyDraftAttachment,
) {
  if (
    attachmentType === KB_ATTACHMENT_TYPE.LINK
    || attachmentType === KB_ATTACHMENT_TYPE.MINI_PROGRAM
  ) {
    return getKbAttachmentTitle(payload);
  }

  return listTitle;
}

export function toQuickReplyDraftAttachment(
  content: KbAttachmentContent,
): QuickReplyDraftAttachment {
  return {
    content: content.content,
    materialCollectionId: content.materialCollectionId,
    msgInfoId: content.msgInfoId,
    msgid: content.msgid,
    type: content.type,
  };
}

export function toKbAttachmentContent(
  payload: QuickReplyDraftAttachment,
): KbAttachmentContent {
  const attachmentType = resolveKbAttachmentContentType(payload.type);
  const content: KbAttachmentContent = {
    content: payload.content,
    type: attachmentType,
  };

  if (payload.materialCollectionId) {
    content.materialCollectionId = payload.materialCollectionId;
  }

  if (payload.msgInfoId) {
    content.msgInfoId = payload.msgInfoId;
  }

  if (payload.msgid) {
    content.msgid = payload.msgid;
  }

  return content;
}

export function isSameKbAttachmentPayload(
  left: QuickReplyDraftAttachment,
  right: QuickReplyDraftAttachment,
) {
  return (
    JSON.stringify(toKbAttachmentContent(left))
    === JSON.stringify(toKbAttachmentContent(right))
  );
}

function parseKbAttachmentTimestamp(value: string) {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
}

function resolveKbAttachmentContentType(
  type: QuickReplyDraftAttachment["type"],
): KbAttachmentContent["type"] {
  if (type === "image" || type === "file" || type === "h5" || type === "weapp") {
    return type;
  }

  throw new Error(`Unsupported KB attachment type: ${type}`);
}

export function formatKbAttachmentCreatedAt(timestamp: number) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

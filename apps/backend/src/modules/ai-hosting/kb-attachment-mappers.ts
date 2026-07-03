import type { KbAttachmentContent, KbAttachmentListItem, KbAttachmentType } from "@chatai/contracts";
import { normalizeJavaChunkDisplayTime } from "./kb-chunk-java-mappers.js";
import type { AgentKbJavaChunkPageItem } from "./kb-chunk-java-mappers.js";

export function mapJavaChunkToKbAttachmentListItem(
  item: AgentKbJavaChunkPageItem,
): KbAttachmentListItem | null {
  if (
    item.attachmentType == null
    || item.attachmentContent == null
    || !isKbAttachmentContent(item.attachmentContent)
    || !isKbAttachmentType(item.attachmentType)
  ) {
    return null;
  }

  const attachmentContent = item.attachmentContent;
  const attachmentType = item.attachmentType;
  const title = deriveKbAttachmentTitle(item.title, attachmentContent);
  const meta = deriveKbAttachmentMeta(attachmentContent);

  return {
    attachmentContent,
    attachmentType,
    chunkId: String(item.id),
    createdAt: normalizeJavaChunkDisplayTime(item.createTime),
    description: item.content?.trim() ?? "",
    title,
    updatedAt: normalizeJavaChunkDisplayTime(item.updateTime),
    ...meta,
  };
}

export function deriveKbAttachmentTitle(
  chunkTitle: string | null | undefined,
  attachmentContent: KbAttachmentContent,
) {
  const normalizedChunkTitle = chunkTitle?.trim();

  if (normalizedChunkTitle) {
    return normalizedChunkTitle;
  }

  return deriveKbAttachmentTitleFromContent(attachmentContent);
}

export function deriveKbAttachmentTitleFromContent(attachmentContent: KbAttachmentContent) {
  const content = attachmentContent.content;

  if (attachmentContent.type === "file") {
    return readString(content.fileName) || "文件";
  }

  if (attachmentContent.type === "h5") {
    return readString(content.title) || "链接";
  }

  if (attachmentContent.type === "weapp") {
    return readString(content.title) || "小程序";
  }

  return readString(content.alt) || readString(content.fileName) || "图片";
}

function deriveKbAttachmentMeta(attachmentContent: KbAttachmentContent) {
  const content = attachmentContent.content;

  if (attachmentContent.type === "file") {
    const fileSizeLabel = readString(content.fileSizeLabel);

    return {
      fileSizeLabel: fileSizeLabel || undefined,
    };
  }

  if (attachmentContent.type === "weapp") {
    const subtitle = readString(content.appName);

    return {
      subtitle: subtitle || "小程序名称",
    };
  }

  return {};
}

function isKbAttachmentType(value: number): value is KbAttachmentType {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isKbAttachmentContent(value: unknown): value is KbAttachmentContent {
  if (!isRecord(value)) {
    return false;
  }

  const type = readString(value.type);

  return (
    type === "image"
    || type === "file"
    || type === "h5"
    || type === "weapp"
  ) && isRecord(value.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

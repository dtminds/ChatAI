import type {
  KbAttachmentContent,
  KbAttachmentListItem,
  KbAttachmentType,
  WorkbenchMaterialCollectionItemDto,
} from "@chatai/contracts";
import { mapMaterialCollectionItem } from "../chat/material-collection-mappers.js";
import type { MaterialCollectionRow } from "../chat/material-collection-mappers.js";
import { normalizeJavaChunkDisplayTime } from "./kb-chunk-java-mappers.js";
import type { AgentKbJavaChunkPageItem } from "./kb-chunk-java-mappers.js";
import {
  readPrimaryKbAttachmentMaterialId,
  readPrimaryKbAttachmentType,
} from "./kb-attachment-material-utils.js";

export function mapJavaChunkToKbAttachmentListItem(
  item: AgentKbJavaChunkPageItem,
  materialById: ReadonlyMap<number, MaterialCollectionRow>,
): KbAttachmentListItem | null {
  const attachmentType = readPrimaryKbAttachmentType(item.attachmentTypes);
  const materialId = readPrimaryKbAttachmentMaterialId(item.attachmentIds);

  if (attachmentType == null || materialId == null) {
    return null;
  }

  const materialRow = materialById.get(materialId);

  if (!materialRow) {
    return null;
  }

  const materialItem = mapMaterialCollectionItem(materialRow);
  const attachmentContent = mapMaterialItemToKbAttachmentContent(materialItem);

  if (!attachmentContent) {
    return null;
  }

  const title = deriveKbAttachmentTitle(item.title, attachmentContent);
  const meta = deriveKbAttachmentMeta(attachmentContent);

  return {
    attachmentContent,
    attachmentType,
    chunkId: String(item.id),
    createdAt: normalizeJavaChunkDisplayTime(item.createTime),
    description: item.content?.trim() ?? "",
    materialCollectionId: String(materialId),
    title,
    updatedAt: normalizeJavaChunkDisplayTime(item.updateTime),
    ...meta,
  };
}

export function mapMaterialItemToKbAttachmentContent(
  item: WorkbenchMaterialCollectionItemDto,
): KbAttachmentContent | null {
  if (
    !item.msgInfoId
    || (item.msgInfoId === "0" && item.contentType !== "image")
  ) {
    return null;
  }

  if (item.contentType === "image") {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "image",
    };
  }

  if (item.contentType === "video" || item.contentType === "file") {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "file",
    };
  }

  if (item.contentType === "h5") {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "h5",
    };
  }

  if (item.contentType === "mini-program") {
    return {
      content: item.content,
      materialCollectionId: item.id,
      msgInfoId: item.msgInfoId,
      type: "weapp",
    };
  }

  return null;
}

export function deriveKbAttachmentTitle(
  chunkTitle: string | null | undefined,
  attachmentContent: KbAttachmentContent,
) {
  if (attachmentContent.type === "h5" || attachmentContent.type === "weapp") {
    return deriveKbAttachmentTitleFromContent(attachmentContent);
  }

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

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

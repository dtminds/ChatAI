import type { WorkbenchQuickReplyAttachment, WorkbenchQuickReplyDto } from "@chatai/contracts";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";

export function buildQuickReplyComposerSegments(
  quickReply: WorkbenchQuickReplyDto,
): {
  invalidAttachmentCount: number;
  segments: ComposerSegment[];
} {
  const segments: ComposerSegment[] = [];
  let invalidAttachmentCount = 0;
  const contentText = quickReply.contentText.trim();

  if (contentText) {
    segments.push({
      text: contentText,
      type: "text",
    });
  }

  for (const attachment of quickReply.attachments) {
    const segment = buildQuickReplyAttachmentSegment(attachment);

    if (segment) {
      segments.push(segment);
    } else {
      invalidAttachmentCount += 1;
    }
  }

  return {
    invalidAttachmentCount,
    segments,
  };
}

function buildQuickReplyAttachmentSegment(
  attachment: WorkbenchQuickReplyAttachment,
): ComposerSegment | undefined {
  if (attachment.type === "image") {
    const fileUrl = readString(attachment.content.fileUrl);

    if (!fileUrl) {
      return undefined;
    }

    return {
      alt: readString(attachment.content.alt) || "图片",
      type: "image",
      url: fileUrl,
    };
  }

  if (attachment.type === "file") {
    const fileName = readString(attachment.content.fileName);
    const fileUrl = readString(attachment.content.fileUrl);

    if (!fileName || !fileUrl || !attachment.materialCollectionId || !attachment.msgid) {
      return undefined;
    }

    return {
      extension: readString(attachment.content.extension) || getFileExtension(fileName),
      fileName,
      fileSize: readNumber(attachment.content.fileSize),
      fileSizeLabel: readString(attachment.content.fileSizeLabel) || undefined,
      materialCollectionId: attachment.materialCollectionId,
      msgid: attachment.msgid,
      type: "file",
      url: fileUrl,
    };
  }

  if (attachment.type === "h5") {
    const title = readString(attachment.content.title);
    const href =
      readString(attachment.content.href) ||
      readString(attachment.content.url) ||
      readString(attachment.content.linkUrl);

    if (!title || !href || !attachment.materialCollectionId || !attachment.msgid) {
      return undefined;
    }

    return {
      coverUrl:
        readString(attachment.content.coverUrl) ||
        readString(attachment.content.previewImageUrl) ||
        undefined,
      desc:
        readString(attachment.content.desc) ||
        readString(attachment.content.description) ||
        undefined,
      href,
      materialCollectionId: attachment.materialCollectionId,
      msgid: attachment.msgid,
      title,
      type: "h5",
    };
  }

  if (attachment.type === "weapp") {
    if (!attachment.materialCollectionId || !attachment.msgid) {
      return undefined;
    }

    return {
      appName: readString(attachment.content.appName) || undefined,
      coverImageUrl:
        readString(attachment.content.coverImageUrl) ||
        readString(attachment.content.imageUrl) ||
        undefined,
      logoUrl: readString(attachment.content.logoUrl) || undefined,
      materialCollectionId: attachment.materialCollectionId,
      msgid: attachment.msgid,
      sourceLabel: readString(attachment.content.sourceLabel) || undefined,
      title: readString(attachment.content.title) || undefined,
      type: "weapp",
    };
  }

  if (attachment.type === "sphfeed") {
    if (!attachment.materialCollectionId || !attachment.msgid) {
      return undefined;
    }

    return {
      description: readString(attachment.content.description) || undefined,
      imageUrl: readString(attachment.content.imageUrl) || undefined,
      materialCollectionId: attachment.materialCollectionId,
      msgid: attachment.msgid,
      sourceLabel: readString(attachment.content.sourceLabel) || undefined,
      title: readString(attachment.content.title) || undefined,
      type: "sphfeed",
      url: readString(attachment.content.url) || undefined,
    };
  }

  return undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.trim();

  return extension && extension !== fileName ? extension.toLowerCase() : "";
}

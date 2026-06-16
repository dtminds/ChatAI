import type { WorkbenchQuickReplyAttachment } from "@chatai/contracts";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { SphFeedMessageCard } from "@/pages/chat/components/message/sphfeed";
import type {
  FileMessageContent,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
  SphFeedMessageContent,
} from "@/pages/chat/chat-types";

type QuickReplyAttachmentPreviewProps = {
  attachment: WorkbenchQuickReplyAttachment;
};

export function QuickReplyAttachmentPreview({
  attachment,
}: QuickReplyAttachmentPreviewProps) {
  if (attachment.type === "image") {
    return <ImageMessageCard content={toImageContent(attachment)} />;
  }

  if (attachment.type === "file") {
    return (
      <FileMessageCard
        content={toFileContent(attachment)}
        showDownloadAction={false}
      />
    );
  }

  if (attachment.type === "h5") {
    return (
      <LinkMessageCard
        content={toH5Content(attachment)}
        disableLink
      />
    );
  }

  if (attachment.type === "weapp") {
    return (
      <MiniAppMessageCard
        content={toMiniProgramContent(attachment)}
        titleLines={1}
      />
    );
  }

  return (
    <SphFeedMessageCard
      content={toSphFeedContent(attachment)}
      disableLink
    />
  );
}

function toImageContent(
  attachment: WorkbenchQuickReplyAttachment,
): ImageMessageContent {
  return {
    alt: readString(attachment.content.alt) || "图片",
    height: readNumber(attachment.content.height),
    imageUrl:
      readString(attachment.content.localUrl) ||
      readString(attachment.content.imageUrl) ||
      readString(attachment.content.fileUrl) ||
      readString(attachment.content.url),
    type: "image",
    width: readNumber(attachment.content.width),
  };
}

function toFileContent(
  attachment: WorkbenchQuickReplyAttachment,
): FileMessageContent {
  const fileName = readString(attachment.content.fileName) || "文件";

  return {
    downloadStatus: readFileDownloadStatus(attachment.content.downloadStatus),
    extension: readString(attachment.content.extension) || getFileExtension(fileName),
    fileName,
    fileSerialNo: readString(attachment.content.fileSerialNo) || undefined,
    fileSizeLabel: readString(attachment.content.fileSizeLabel) || undefined,
    fileUrl: readString(attachment.content.fileUrl) || undefined,
    sourceLabel: readString(attachment.content.sourceLabel) || "文件",
    type: "file",
  };
}

function toH5Content(
  attachment: WorkbenchQuickReplyAttachment,
): H5CardMessageContent {
  return {
    description:
      readString(attachment.content.description) ||
      readString(attachment.content.desc),
    previewImageUrl:
      readString(attachment.content.previewImageUrl) ||
      readString(attachment.content.imageUrl) ||
      readString(attachment.content.coverUrl) ||
      undefined,
    sourceLabel: readString(attachment.content.sourceLabel) || "链接",
    title: readString(attachment.content.title) || "链接",
    type: "h5",
    url:
      readString(attachment.content.url) ||
      readString(attachment.content.href) ||
      readString(attachment.content.linkUrl) ||
      undefined,
  };
}

function toMiniProgramContent(
  attachment: WorkbenchQuickReplyAttachment,
): MiniProgramMessageContent {
  return {
    appName:
      readString(attachment.content.appName) ||
      readString(attachment.content.description) ||
      "小程序",
    coverImageUrl:
      readString(attachment.content.coverImageUrl) ||
      readString(attachment.content.imageUrl) ||
      readString(attachment.content.fileUrl) ||
      readString(attachment.content.coverUrl) ||
      undefined,
    logoUrl: readString(attachment.content.logoUrl) || undefined,
    sourceLabel: readString(attachment.content.sourceLabel) || "小程序",
    title: readString(attachment.content.title) || "小程序",
    type: "mini-program",
  };
}

function toSphFeedContent(
  attachment: WorkbenchQuickReplyAttachment,
): SphFeedMessageContent {
  return {
    description: readString(attachment.content.description),
    imageUrl: readString(attachment.content.imageUrl) || undefined,
    sourceLabel: readString(attachment.content.sourceLabel) || "视频号",
    title: readString(attachment.content.title) || "视频号",
    type: "sphfeed",
    url: readString(attachment.content.url) || undefined,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readFileDownloadStatus(value: unknown) {
  return value === "ing" || value === "finished" || value === "failed"
    ? value
    : undefined;
}

function getFileExtension(fileName: string) {
  const lastSegment = fileName.split(/[\\/]/).pop() ?? "";
  const extension = lastSegment.includes(".") ? lastSegment.split(".").pop() : "";

  return extension?.trim().toLowerCase() || "file";
}

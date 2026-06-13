import { useState } from "react";
import { cn } from "@/lib/utils";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { MaterialActionsMenu } from "@/pages/chat/components/material-collection/material-actions-menu";
import type {
  FileMessageContent,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
} from "@/pages/chat/chat-types";
import type {
  MaterialCollectionItem,
  MaterialCollectionGroup,
} from "@/pages/chat/components/material-collection/material-types";

type MaterialCardProps = {
  className?: string;
  groups?: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onDelete?: (item: MaterialCollectionItem) => void;
  onMove?: (item: MaterialCollectionItem, groupId: string) => void;
  onSelect?: (item: MaterialCollectionItem) => void;
  onTop?: (item: MaterialCollectionItem) => void;
};

export function MaterialCard({
  className,
  groups = [],
  item,
  onDelete,
  onMove,
  onSelect,
  onTop,
}: MaterialCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );

  return (
    <div
      className={cn(
        "group/material relative block w-full max-w-full align-top overflow-visible",
        className,
      )}
    >
      <button
        aria-label={`选择素材 ${item.title}`}
        className="block w-full max-w-full rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => onSelect?.(item)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
          });
        }}
        type="button"
      >
        <MaterialCardContent item={item} />
      </button>

      <MaterialActionsMenu
        groups={groups}
        item={item}
        onDelete={onDelete}
        onMove={onMove}
        onOpenChange={setContextMenu}
        onTop={onTop}
        position={contextMenu}
      />
    </div>
  );
}

function MaterialCardContent({ item }: { item: MaterialCollectionItem }) {
  if (item.contentType === "emotion") {
    return (
      <ImageMessageCard
        content={toExpressionContent(item)}
        messageId={item.id}
      />
    );
  }

  if (item.contentType === "file") {
    return (
      <FileMessageCard
        className="w-full"
        content={toFileContent(item)}
        showDownloadAction={false}
      />
    );
  }

  if (item.contentType === "mini-program") {
    return (
      <MiniAppMessageCard
        className="w-full"
        content={toMiniProgramContent(item)}
        titleLines={1}
      />
    );
  }

  return (
    <LinkMessageCard
      className="w-full"
      content={toH5Content(item)}
      disableLink
    />
  );
}

function toExpressionContent(item: MaterialCollectionItem): ImageMessageContent {
  return {
    alt: readString(item.content.alt) || item.title || "表情",
    height: readNumber(item.content.height),
    imageUrl:
      readString(item.content.imageUrl) ||
      readString(item.content.url) ||
      readString(item.content.fileUrl),
    type: "image",
    variant: "emotion",
    width: readNumber(item.content.width),
  };
}

function toFileContent(item: MaterialCollectionItem): FileMessageContent {
  const fileName = readString(item.content.fileName) || item.title || "文件";

  return {
    downloadStatus: readFileDownloadStatus(item.content.downloadStatus),
    extension: readString(item.content.extension) || getFileExtension(fileName),
    fileName,
    fileSerialNo: readString(item.content.fileSerialNo) || undefined,
    fileSizeLabel: readString(item.content.fileSizeLabel) || undefined,
    fileUrl: readString(item.content.fileUrl) || undefined,
    sourceLabel: readString(item.content.sourceLabel) || "文件",
    type: "file",
  };
}

function toMiniProgramContent(item: MaterialCollectionItem): MiniProgramMessageContent {
  return {
    appName:
      readString(item.content.appName) ||
      readString(item.content.description) ||
      "小程序",
    coverImageUrl:
      readString(item.content.coverImageUrl) ||
      readString(item.content.imageUrl) ||
      readString(item.content.fileUrl) ||
      readString(item.content.coverUrl) ||
      undefined,
    logoUrl: readString(item.content.logoUrl) || undefined,
    sourceLabel: readString(item.content.sourceLabel) || "小程序",
    title: readString(item.content.title) || item.title || "小程序",
    type: "mini-program",
  };
}

function toH5Content(item: MaterialCollectionItem): H5CardMessageContent {
  return {
    description:
      readString(item.content.description) ||
      readString(item.content.desc),
    previewImageUrl:
      readString(item.content.previewImageUrl) ||
      readString(item.content.imageUrl) ||
      readString(item.content.coverUrl) ||
      undefined,
    sourceLabel: readString(item.content.sourceLabel) || "链接",
    title: readString(item.content.title) || item.title || "链接",
    type: "h5",
    url:
      readString(item.content.url) ||
      readString(item.content.href) ||
      undefined,
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

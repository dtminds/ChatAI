import {
  Delete02Icon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import type {
  FileMessageContent,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
} from "@/pages/chat/chat-types";
import type {
  MaterialCollectionItem,
  MaterialCollectionMode,
} from "@/pages/chat/components/material-collection/material-types";

type MaterialCardProps = {
  className?: string;
  item: MaterialCollectionItem;
  mode?: MaterialCollectionMode;
  onDelete?: (item: MaterialCollectionItem) => void;
  onSelect?: (item: MaterialCollectionItem) => void;
  onTop?: (item: MaterialCollectionItem) => void;
};

export function MaterialCard({
  className,
  item,
  mode = "browse",
  onDelete,
  onSelect,
  onTop,
}: MaterialCardProps) {
  const isManageMode = mode === "manage";

  return (
    <div
      className={cn(
        "group/material relative rounded-[10px] border border-transparent p-1 transition-colors hover:border-border hover:bg-surface-muted",
        className,
      )}
    >
      <button
        aria-label={`选择素材 ${item.title}`}
        className="block w-full rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        disabled={isManageMode}
        onClick={() => onSelect?.(item)}
        type="button"
      >
        <MaterialCardContent item={item} />
      </button>

      {isManageMode ? (
        <div className="mt-2 flex items-center justify-end gap-1">
          <Button
            aria-label={`置顶 ${item.title}`}
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={() => onTop?.(item)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={1.8} />
            置顶
          </Button>
          <Button
            aria-label={`删除 ${item.title}`}
            className="h-7 gap-1 px-2 text-[12px] text-destructive hover:text-destructive"
            onClick={() => onDelete?.(item)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} />
            删除
          </Button>
        </div>
      ) : null}
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
        content={toFileContent(item)}
        showDownloadAction={false}
      />
    );
  }

  if (item.contentType === "mini-program") {
    return <MiniAppMessageCard content={toMiniProgramContent(item)} />;
  }

  return <LinkMessageCard content={toH5Content(item)} />;
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
    appName: readString(item.content.appName) || "小程序",
    coverImageUrl:
      readString(item.content.coverImageUrl) ||
      readString(item.content.imageUrl) ||
      undefined,
    logoUrl: readString(item.content.logoUrl) || undefined,
    sourceLabel: readString(item.content.sourceLabel) || "小程序",
    title: readString(item.content.title) || item.title || "小程序",
    type: "mini-program",
  };
}

function toH5Content(item: MaterialCollectionItem): H5CardMessageContent {
  return {
    description: readString(item.content.description),
    previewImageUrl:
      readString(item.content.previewImageUrl) ||
      readString(item.content.imageUrl) ||
      undefined,
    sourceLabel: readString(item.content.sourceLabel) || "链接",
    title: readString(item.content.title) || item.title || "链接",
    type: "h5",
    url: readString(item.content.url) || undefined,
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

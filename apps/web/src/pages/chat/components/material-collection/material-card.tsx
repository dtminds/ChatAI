import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  readMaterialDescription,
  readMaterialLinkUrl,
} from "@chatai/contracts";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { SphFeedMessageCard } from "@/pages/chat/components/message/sphfeed";
import { MaterialActionsMenu } from "@/pages/chat/components/material-collection/material-actions-menu";
import { MaterialSelectionIndicator } from "@/pages/chat/components/material-collection/material-selection-indicator";
import type {
  FileMessageContent,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
  SphFeedMessageContent,
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
  onEdit?: (item: MaterialCollectionItem) => void;
  onMove?: (item: MaterialCollectionItem, groupId: string) => void;
  onSelect?: (item: MaterialCollectionItem) => void;
  onToggleSelect?: () => void;
  onTop?: (item: MaterialCollectionItem) => void;
  selected?: boolean;
  selectionMode?: "immediate" | "toggle";
};

export function MaterialCard({
  className,
  groups = [],
  item,
  onDelete,
  onEdit,
  onMove,
  onSelect,
  onToggleSelect,
  onTop,
  selected = false,
  selectionMode = "immediate",
}: MaterialCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const isToggleMode = selectionMode === "toggle";

  return (
    <div
      className={cn(
        "group/material relative block w-full max-w-full align-top overflow-visible",
        className,
      )}
    >
      <button
        aria-label={`选择素材 ${item.title}`}
        aria-pressed={isToggleMode ? selected : undefined}
        className="relative block w-full max-w-full rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => {
          if (isToggleMode) {
            onToggleSelect?.();
            return;
          }

          onSelect?.(item);
        }}
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
        {isToggleMode && selected ? (
          <MaterialSelectionIndicator
            className="absolute right-2 top-2 z-10 pointer-events-none"
            selected
          />
        ) : null}
        <MaterialCardContent item={item} />
      </button>

      <MaterialActionsMenu
        groups={groups}
        item={item}
        onDelete={onDelete}
        onEdit={onEdit}
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

  if (item.contentType === "sphfeed") {
    return (
      <SphFeedMessageCard
        content={toSphFeedContent(item)}
        disableLink
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

function toSphFeedContent(item: MaterialCollectionItem): SphFeedMessageContent {
  return {
    description: readString(item.content.description),
    imageUrl: readString(item.content.imageUrl) || undefined,
    sourceLabel: readString(item.content.sourceLabel) || "视频号",
    title: readString(item.content.title) || item.title || "视频号",
    type: "sphfeed",
    url: readString(item.content.url) || undefined,
  };
}

function toH5Content(item: MaterialCollectionItem): H5CardMessageContent {
  const contentRecord = isRecord(item.content) ? item.content : {};

  return {
    description: readMaterialDescription(contentRecord),
    previewImageUrl:
      readString(item.content.previewImageUrl) ||
      readString(item.content.imageUrl) ||
      readString(item.content.coverUrl) ||
      undefined,
    sourceLabel: readString(item.content.sourceLabel) || "链接",
    title: readString(item.content.title) || item.title || "链接",
    type: "h5",
    url: readMaterialLinkUrl(contentRecord) || undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Delete02Icon,
  FolderTransferIcon,
  PinIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const targetGroups = groups.filter((group) => group.id !== item.groupId);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const contextMenuNode = contextMenu ? createPortal(
    <div
      className="fixed z-50 min-w-[7.5rem] rounded-[10px] border border-border bg-popover p-1 text-popover-foreground shadow-[0_10px_28px_var(--shadow-soft)] pointer-events-auto"
      ref={menuRef}
      role="menu"
      style={{ left: contextMenu.x, pointerEvents: "auto", top: contextMenu.y }}
    >
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
        disabled={!onTop}
        onClick={() => {
          onTop?.(item);
          setContextMenu(null);
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.8} />
        移到最前
      </button>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground disabled:pointer-events-none disabled:opacity-45"
        disabled={targetGroups.length === 0}
        onClick={() => {
          setContextMenu(null);
          setIsMoveDialogOpen(true);
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={FolderTransferIcon} size={16} strokeWidth={1.8} />
        移动分组
      </button>
      <button
        className="flex h-8 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-destructive outline-none transition-colors hover:bg-destructive/10 focus:bg-destructive/10 disabled:pointer-events-none disabled:opacity-45"
        disabled={!onDelete}
        onClick={() => {
          onDelete?.(item);
          setContextMenu(null);
        }}
        role="menuitem"
        type="button"
      >
        <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={1.8} />
        删除
      </button>
    </div>,
    document.body,
  ) : null;

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

      {contextMenuNode}
      <MaterialMoveGroupDialog
        groups={targetGroups}
        item={item}
        onMove={(groupId) => onMove?.(item, groupId)}
        onOpenChange={setIsMoveDialogOpen}
        open={isMoveDialogOpen}
      />
    </div>
  );
}

function MaterialMoveGroupDialog({
  groups,
  item,
  onMove,
  onOpenChange,
  open,
}: {
  groups: MaterialCollectionGroup[];
  item: MaterialCollectionItem;
  onMove: (groupId: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedGroupId("");
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>移动分组</DialogTitle>
          <DialogDescription>
            {item.title}
          </DialogDescription>
        </DialogHeader>

        <Select
          onValueChange={setSelectedGroupId}
          value={selectedGroupId}
        >
          <SelectTrigger
            aria-label="选择目标分组"
            className="w-full"
          >
            <SelectValue placeholder="选择目标分组" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={!selectedGroupId}
            onClick={() => {
              onMove(selectedGroupId);
              onOpenChange(false);
            }}
            type="button"
          >
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

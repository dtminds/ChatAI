import { useState } from "react";
import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { ImagePreviewDialog } from "@/pages/chat/components/message/image";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { getSafeMessageUrl } from "@/pages/chat/components/message/url";
import { normalizeMediaAssetUrl } from "@/pages/chat/lib/media-asset-url";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KbTableLoadingRow } from "./kb-table-loading-row";
import { TableOverflowTooltip } from "./shared";
import {
  formatKbAttachmentCreatedAt,
  getKbAttachmentDeleteActionLabel,
  getKbAttachmentFileExtension,
  getKbAttachmentFileUrl,
  getKbAttachmentImageUrl,
  getKbAttachmentLinkUrl,
  getKbAttachmentPreviewUrl,
  getKbAttachmentPrimaryColumnLabel,
  getKbAttachmentTitle,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const PRIMARY_COLUMN_MAX_WIDTH_CLASS = "max-w-60";
const LINKABLE_TEXT_CLASS =
  "underline-offset-2 transition-colors hover:text-primary hover:underline";

type KbAttachmentsTableProps = {
  activeType: KbAttachmentType;
  items: KbAttachmentItem[];
  loading?: boolean;
  onDelete: (id: string) => void;
  onEdit: (item: KbAttachmentItem) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelectItem: (id: string, checked: boolean) => void;
  selectedIds: string[];
};

export function KbAttachmentsTable({
  activeType,
  items,
  loading = false,
  onDelete,
  onEdit,
  onToggleSelectAll,
  onToggleSelectItem,
  selectedIds,
}: KbAttachmentsTableProps) {
  const [previewImage, setPreviewImage] = useState<{
    alt: string;
    imageUrl: string;
  } | null>(null);
  const primaryColumnLabel = getKbAttachmentPrimaryColumnLabel(activeType);
  const deleteActionLabel = getKbAttachmentDeleteActionLabel(activeType);
  const columnCount = 5;
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <TooltipProvider>
      <Table aria-label="附件列表" className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-12 px-4">
              <Checkbox
                aria-label="全选附件"
                checked={allSelected}
                onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
              />
            </TableHead>
            <TableHead
              className={cn(
                "h-11 px-4",
                PRIMARY_COLUMN_MAX_WIDTH_CLASS,
              )}
            >
              {primaryColumnLabel}
            </TableHead>
            <TableHead className="h-11 px-4">
              描述
            </TableHead>
            <TableHead className="h-11 w-44 px-4">
              创建时间
            </TableHead>
            <TableHead className="h-11 w-28 px-4 text-right">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <KbTableLoadingRow colSpan={columnCount} />
          ) : null}
          {!loading
            ? items.map((item) => (
            <TableRow className="hover:bg-muted/20" key={item.id}>
              <TableCell className="px-4 py-4 align-middle">
                <Checkbox
                  aria-label={`选择附件 ${item.title}`}
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={(checked) =>
                    onToggleSelectItem(item.id, checked === true)
                  }
                />
              </TableCell>
              <TableCell
                className={cn(
                  "px-4 py-4 align-top",
                  PRIMARY_COLUMN_MAX_WIDTH_CLASS,
                )}
              >
                <KbAttachmentPrimaryCell item={item} onPreviewImage={setPreviewImage} />
              </TableCell>
              <TableCell className="px-4 py-4 align-middle">
                <TableOverflowTooltip
                  className="line-clamp-4 text-sm leading-6 text-muted-foreground"
                  tooltip={item.description}
                >
                  {item.description}
                </TableOverflowTooltip>
              </TableCell>
              <TableCell className="px-4 py-4 align-middle text-sm text-foreground">
                {formatKbAttachmentCreatedAt(item.createdAt)}
              </TableCell>
              <TableCell className="px-4 py-4 align-middle text-right">
                <div className="inline-flex items-center gap-4">
                  <Button
                    className="h-auto p-0 text-sm text-primary"
                    onClick={() => onEdit(item)}
                    type="button"
                    variant="link"
                  >
                    编辑
                  </Button>
                  <Button
                    className="h-auto p-0 text-sm text-primary"
                    onClick={() => onDelete(item.id)}
                    type="button"
                    variant="link"
                  >
                    {deleteActionLabel}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
            : null}
        </TableBody>
      </Table>
      {previewImage ? (
        <ImagePreviewDialog
          alt={previewImage.alt}
          imageUrl={previewImage.imageUrl}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewImage(null);
            }
          }}
          open
        />
      ) : null}
    </TooltipProvider>
  );
}

function KbAttachmentPrimaryCell({
  item,
  onPreviewImage,
}: {
  item: KbAttachmentItem;
  onPreviewImage: (image: { alt: string; imageUrl: string }) => void;
}) {
  if (item.attachmentType === KB_ATTACHMENT_TYPE.IMAGE) {
    return (
      <KbAttachmentThumbnail
        item={item}
        onClick={() => {
          const imageUrl = normalizeKbAttachmentMediaUrl(
            getKbAttachmentImageUrl(item.payload),
          );

          if (imageUrl) {
            onPreviewImage({ alt: item.title || "图片", imageUrl });
          }
        }}
      />
    );
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.VIDEO) {
    const videoUrl = getKbAttachmentOpenUrl(item);

    return (
      <KbAttachmentThumbnail
        item={item}
        onClick={videoUrl ? () => openAttachmentUrl(videoUrl) : undefined}
      />
    );
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.FILE) {
    const fileUrl = getKbAttachmentOpenUrl(item);
    const fileContent = (
      <>
        <FileExtensionBadge
          className="size-10"
          extension={getKbAttachmentFileExtension(item.payload)}
        />
        <div className="min-w-0 max-w-full">
          <TableOverflowTooltip
            className={cn(
              "truncate text-sm font-medium text-foreground",
              fileUrl && LINKABLE_TEXT_CLASS,
            )}
            tooltip={item.title}
          >
            {item.title}
          </TableOverflowTooltip>
          {item.fileSizeLabel ? (
            <div className="mt-1 text-sm text-muted-foreground">{item.fileSizeLabel}</div>
          ) : null}
        </div>
      </>
    );

    if (!fileUrl) {
      return <div className="flex min-w-0 items-start gap-3">{fileContent}</div>;
    }

    return (
      <button
        aria-label={`打开文件 ${item.title}`}
        className="flex min-w-0 items-start gap-3 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => openAttachmentUrl(fileUrl)}
        type="button"
      >
        {fileContent}
      </button>
    );
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.LINK) {
    const linkUrl = getKbAttachmentOpenUrl(item);
    const title = getKbAttachmentTitle(item.payload);
    const content = (
      <>
        <KbAttachmentThumbnail item={item} />
        <TableOverflowTooltip
          className={cn(
            "min-w-0 flex-1 whitespace-normal line-clamp-2 text-sm font-medium leading-5 text-foreground",
            linkUrl && LINKABLE_TEXT_CLASS,
          )}
          tooltip={title}
        >
          {title}
        </TableOverflowTooltip>
      </>
    );

    if (!linkUrl) {
      return <div className="flex min-w-0 max-w-full items-start gap-3">{content}</div>;
    }

    return (
      <button
        aria-label={`打开链接 ${title}`}
        className="flex min-w-0 max-w-full items-start gap-3 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => openAttachmentUrl(linkUrl)}
        type="button"
      >
        {content}
      </button>
    );
  }

  const title = getKbAttachmentTitle(item.payload);

  return (
    <div className="flex min-w-0 max-w-full items-start gap-3">
      <KbAttachmentThumbnail item={item} />
      <div className="min-w-0 max-w-full flex-1">
        <TableOverflowTooltip
          className="whitespace-normal line-clamp-2 text-sm font-medium leading-5 text-foreground"
          tooltip={title}
        >
          {title}
        </TableOverflowTooltip>
        {item.subtitle ? (
          <div className="mt-1 inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-muted-foreground">
            <MiniProgramMark className="size-3.5! shrink-0" />
            <TableOverflowTooltip className="min-w-0 truncate" tooltip={item.subtitle}>
              {item.subtitle}
            </TableOverflowTooltip>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function KbAttachmentThumbnail({
  item,
  onClick,
}: {
  item: KbAttachmentItem;
  onClick?: () => void;
}) {
  const previewUrl = normalizeKbAttachmentMediaUrl(
    getKbAttachmentPreviewUrl(item.payload),
  );
  const isVideo = item.attachmentType === KB_ATTACHMENT_TYPE.VIDEO;
  const content = (
    <>
      {previewUrl ? (
        <img
          alt=""
          aria-hidden="true"
          className="size-full object-cover"
          src={previewUrl}
        />
      ) : null}
      {isVideo ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/10">
          <span className="flex size-7 items-center justify-center rounded-full bg-black/45 text-white">
            <HugeiconsIcon
              aria-hidden="true"
              color="currentColor"
              icon={PlayIcon}
              size={14}
              strokeWidth={1.8}
            />
          </span>
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "relative size-14 shrink-0 overflow-hidden rounded-[8px] bg-muted",
    !previewUrl && "border border-border",
    onClick && "outline-none transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/30",
  );

  if (onClick) {
    return (
      <button
        aria-label={isVideo ? `播放视频 ${item.title}` : `查看图片 ${item.title}`}
        className={className}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className}>{content}</div>
  );
}

function getKbAttachmentOpenUrl(item: KbAttachmentItem) {
  if (item.attachmentType === KB_ATTACHMENT_TYPE.FILE || item.attachmentType === KB_ATTACHMENT_TYPE.VIDEO) {
    const fileUrl = getKbAttachmentFileUrl(item.payload);

    return normalizeKbAttachmentMediaUrl(fileUrl);
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.LINK) {
    return getSafeMessageUrl(getKbAttachmentLinkUrl(item.payload));
  }

  return undefined;
}

function openAttachmentUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function normalizeKbAttachmentMediaUrl(url: string | undefined) {
  const trimmedUrl = url?.trim() ?? "";

  if (!trimmedUrl) {
    return "";
  }

  if (trimmedUrl.startsWith("blob:") || trimmedUrl.startsWith("data:image/")) {
    return trimmedUrl;
  }

  return normalizeMediaAssetUrl(trimmedUrl) || getSafeMessageUrl(trimmedUrl) || "";
}

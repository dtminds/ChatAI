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
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KbTableLoadingRow } from "./kb-table-loading-row";
import { TableOverflowTooltip } from "./shared";
import {
  formatKbAttachmentCreatedAt,
  getKbAttachmentDeleteActionLabel,
  getKbAttachmentFileExtension,
  getKbAttachmentPreviewUrl,
  getKbAttachmentPrimaryColumnLabel,
  getKbAttachmentTitle,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
} from "./kb-attachment-types";

const PRIMARY_COLUMN_MAX_WIDTH_CLASS = "max-w-60";

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
                <KbAttachmentPrimaryCell item={item} />
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
    </TooltipProvider>
  );
}

function KbAttachmentPrimaryCell({ item }: { item: KbAttachmentItem }) {
  if (
    item.attachmentType === KB_ATTACHMENT_TYPE.IMAGE ||
    item.attachmentType === KB_ATTACHMENT_TYPE.VIDEO
  ) {
    return <KbAttachmentThumbnail item={item} />;
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.FILE) {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <FileExtensionBadge
          className="size-10"
          extension={getKbAttachmentFileExtension(item.payload)}
        />
        <div className="min-w-0 max-w-full">
          <TableOverflowTooltip
            className="truncate text-sm font-medium text-foreground"
            tooltip={item.title}
          >
            {item.title}
          </TableOverflowTooltip>
          {item.fileSizeLabel ? (
            <div className="mt-1 text-sm text-muted-foreground">{item.fileSizeLabel}</div>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.LINK) {
    return (
      <div className="flex min-w-0 max-w-full items-start gap-3">
        <KbAttachmentThumbnail item={item} />
        <TableOverflowTooltip
          className="min-w-0 flex-1 whitespace-normal line-clamp-2 text-sm font-medium leading-5 text-foreground"
          tooltip={getKbAttachmentTitle(item.payload)}
        >
          {getKbAttachmentTitle(item.payload)}
        </TableOverflowTooltip>
      </div>
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

function KbAttachmentThumbnail({ item }: { item: KbAttachmentItem }) {
  const previewUrl = getKbAttachmentPreviewUrl(item.payload);
  const isVideo = item.attachmentType === KB_ATTACHMENT_TYPE.VIDEO;

  return (
    <div
      className={cn(
        "relative size-14 shrink-0 overflow-hidden rounded-[8px] bg-muted",
        !previewUrl && "border border-border",
      )}
    >
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
    </div>
  );
}

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
import {
  formatKbAttachmentCreatedAt,
  getKbAttachmentDeleteActionLabel,
  getKbAttachmentFileExtension,
  getKbAttachmentPreviewUrl,
  getKbAttachmentPrimaryColumnLabel,
  KB_ATTACHMENT_TYPE,
  type KbAttachmentItem,
  type KbAttachmentType,
  usesCombinedDescriptionColumn,
} from "./kb-attachment-types";

type KbAttachmentsTableProps = {
  activeType: KbAttachmentType;
  items: KbAttachmentItem[];
  onDelete: (id: string) => void;
  onEdit: (item: KbAttachmentItem) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onToggleSelectItem: (id: string, checked: boolean) => void;
  selectedIds: string[];
};

export function KbAttachmentsTable({
  activeType,
  items,
  onDelete,
  onEdit,
  onToggleSelectAll,
  onToggleSelectItem,
  selectedIds,
}: KbAttachmentsTableProps) {
  const combinedDescription = usesCombinedDescriptionColumn(activeType);
  const primaryColumnLabel = getKbAttachmentPrimaryColumnLabel(activeType);
  const deleteActionLabel = getKbAttachmentDeleteActionLabel(activeType);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  return (
    <div className="overflow-hidden rounded-[8px] border border-border bg-background">
      <Table aria-label="附件列表">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 w-12 px-4">
              <Checkbox
                aria-label="全选附件"
                checked={allSelected}
                onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
              />
            </TableHead>
            <TableHead className="h-11 px-4 text-sm font-medium text-muted-foreground">
              {primaryColumnLabel}
            </TableHead>
            {!combinedDescription ? (
              <TableHead className="h-11 px-4 text-sm font-medium text-muted-foreground">
                描述
              </TableHead>
            ) : null}
            <TableHead className="h-11 w-44 px-4 text-sm font-medium text-muted-foreground">
              创建时间
            </TableHead>
            <TableHead className="h-11 w-28 px-4 text-right text-sm font-medium text-muted-foreground">
              操作
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
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
                  "px-4 py-4",
                  combinedDescription ? "align-middle" : "align-top",
                )}
              >
                {combinedDescription ? (
                  <KbAttachmentCombinedDescriptionCell item={item} />
                ) : (
                  <KbAttachmentPrimaryCell item={item} />
                )}
              </TableCell>
              {!combinedDescription ? (
                <TableCell className="px-4 py-4 align-middle">
                  <p className="line-clamp-4 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </TableCell>
              ) : null}
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KbAttachmentCombinedDescriptionCell({ item }: { item: KbAttachmentItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <KbAttachmentThumbnail item={item} />
      <p className="min-w-0 flex-1 line-clamp-4 text-sm leading-6 text-muted-foreground">
        {item.description}
      </p>
    </div>
  );
}

function KbAttachmentPrimaryCell({ item }: { item: KbAttachmentItem }) {
  if (item.attachmentType === KB_ATTACHMENT_TYPE.FILE) {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <FileExtensionBadge
          className="size-10"
          extension={getKbAttachmentFileExtension(item.payload)}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
          {item.fileSizeLabel ? (
            <div className="mt-1 text-sm text-muted-foreground">{item.fileSizeLabel}</div>
          ) : null}
        </div>
      </div>
    );
  }

  if (item.attachmentType === KB_ATTACHMENT_TYPE.LINK) {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <KbAttachmentThumbnail item={item} />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-6 text-foreground">
          {item.title}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-3">
      <KbAttachmentThumbnail item={item} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-6 text-foreground">{item.title}</p>
        {item.subtitle ? (
          <div className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MiniProgramMark className="size-3.5! shrink-0" />
            <span className="truncate">{item.subtitle}</span>
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

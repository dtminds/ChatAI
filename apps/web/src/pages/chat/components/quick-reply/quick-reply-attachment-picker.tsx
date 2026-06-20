import {
  Add01Icon,
  Delete01Icon,
  File01Icon,
  Image01Icon,
  Link01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import {
  MATERIAL_COLLECTION_BIZ_TYPE,
  type WorkbenchMaterialCollectionItemDto,
  type WorkbenchQuickReplyAttachment,
  type WorkbenchQuickReplyAttachmentType,
} from "@chatai/contracts";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuickReplyAttachmentPreview } from "@/pages/chat/components/quick-reply/quick-reply-attachment-preview";
import {
  QuickReplyMaterialPickerDialog,
  type QuickReplyAttachmentMaterialBizType,
} from "@/pages/chat/components/quick-reply/quick-reply-material-picker-dialog";
import { MiniProgramMark } from "@/pages/chat/components/message/miniapp";
import { SphFeedMark } from "@/pages/chat/components/message/sphfeed";

type QuickReplyAttachmentPickerProps = {
  attachments: QuickReplyDraftAttachment[];
  maxCount: number;
  onChange: (attachments: QuickReplyDraftAttachment[]) => void;
};

export type QuickReplyLocalImageAttachment = WorkbenchQuickReplyAttachment & {
  localFile: File;
};

export type QuickReplyDraftAttachment =
  | WorkbenchQuickReplyAttachment
  | QuickReplyLocalImageAttachment;

export function QuickReplyAttachmentPicker({
  attachments,
  maxCount,
  onChange,
}: QuickReplyAttachmentPickerProps) {
  const [activePickerBizType, setActivePickerBizType] =
    useState<QuickReplyAttachmentMaterialBizType | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const canAddMore = attachments.length < maxCount;
  const handleImageFile = (file: File | undefined) => {
    if (!file) {
      return;
    }

    const localUrl = URL.createObjectURL(file);

    onChange([
      ...attachments,
      {
        content: {
          alt: file.name || "图片",
          localUrl,
        },
        localFile: file,
        type: "image",
      },
    ]);
  };

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">附件</span>
          <span className="text-xs text-muted-foreground">
            {attachments.length}/{maxCount}
          </span>
        </div>
        <div className="flex items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="添加附件"
                        className="size-7"
                        disabled={!canAddMore}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Add01Icon}
                          size={15}
                          strokeWidth={1.8}
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          imageInputRef.current?.click();
                        }}
                      >
                        <HugeiconsIcon
                          icon={Image01Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        图片
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setActivePickerBizType(MATERIAL_COLLECTION_BIZ_TYPE.FILE)
                        }
                      >
                        <HugeiconsIcon
                          icon={File01Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        文件
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setActivePickerBizType(MATERIAL_COLLECTION_BIZ_TYPE.H5)
                        }
                      >
                        <HugeiconsIcon
                          icon={Link01Icon}
                          size={14}
                          strokeWidth={1.8}
                        />
                        H5
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setActivePickerBizType(
                            MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM,
                          )
                        }
                      >
                        <MiniProgramMark className="!size-3.5" />
                        小程序
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled>
                        <SphFeedMark className="size-4" />
                        视频号
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TooltipTrigger>
              {!canAddMore ? (
                <TooltipContent side="top" sideOffset={6}>
                  附件已达数量上限
                </TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
          <input
            accept="image/*"
            aria-label="上传图片"
            className="sr-only"
            disabled={!canAddMore}
            onChange={(event) => {
              handleImageFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
            ref={imageInputRef}
            type="file"
          />
        </div>
      </div>
      <div className="w-full min-w-0 overflow-hidden min-h-[136px]">
        {attachments.length > 0 ? (
          <div className="w-full min-w-0 space-y-2">
            {attachments.map((attachment, index) => (
              <AttachmentRow
                attachment={attachment}
                key={`${attachment.type}:${attachment.materialCollectionId ?? ""}:${attachment.msgid ?? ""}:${index}`}
                onDelete={() => {
                  onChange(
                    attachments.filter((_, itemIndex) => itemIndex !== index),
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[8px] border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            暂无附件
          </div>
        )}
      </div>
      <QuickReplyMaterialPickerDialog
        bizType={activePickerBizType}
        onOpenChange={(open) => {
          if (!open) {
            setActivePickerBizType(null);
          }
        }}
        onSelect={(item) => {
          const attachment = buildAttachmentFromMaterial(item);

          if (!attachment) {
            return;
          }

          onChange([...attachments, attachment]);
        }}
        open={activePickerBizType !== null}
      />
    </div>
  );
}

function AttachmentRow({
  attachment,
  onDelete,
}: {
  attachment: QuickReplyDraftAttachment;
  onDelete: () => void;
}) {
  const title = getAttachmentTitle(attachment);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <div className="flex min-h-10 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-[8px] border border-border bg-surface px-3 py-2">
      {getAttachmentTypeIcon(attachment.type)}
      <span
        className="block min-w-0 flex-1 truncate text-sm text-foreground"
        title={title}
      >
        {title}
      </span>
      <HoverCard open={isPreviewOpen}>
        <HoverCardTrigger asChild>
          <Button
            aria-label={`预览附件 ${title}`}
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            onBlur={() => setIsPreviewOpen(false)}
            onFocus={() => setIsPreviewOpen(true)}
            onMouseEnter={() => setIsPreviewOpen(true)}
            onMouseLeave={() => setIsPreviewOpen(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={ViewIcon}
              size={15}
              strokeWidth={1.8}
            />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent
          align="end"
          className="w-auto max-w-[360px] p-2"
          side="top"
          sideOffset={8}
        >
          <QuickReplyAttachmentPreview attachment={attachment} />
        </HoverCardContent>
      </HoverCard>
      <Button
        aria-label={`删除附件 ${title}`}
        className="size-7 shrink-0"
        onClick={onDelete}
        size="icon"
        type="button"
        variant="ghost"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Delete01Icon}
          size={15}
          strokeWidth={1.8}
        />
      </Button>
    </div>
  );
}

function buildAttachmentFromMaterial(
  item: WorkbenchMaterialCollectionItemDto,
): WorkbenchQuickReplyAttachment | undefined {
  const type = getAttachmentTypeFromBizType(item.bizType);

  if (!type || !item.msgInfoId) {
    return undefined;
  }

  return {
    content: item.content,
    materialCollectionId: item.id,
    msgInfoId: item.msgInfoId,
    type,
  };
}

function getAttachmentTypeFromBizType(
  bizType: WorkbenchMaterialCollectionItemDto["bizType"],
): WorkbenchQuickReplyAttachmentType | undefined {
  switch (bizType) {
    case MATERIAL_COLLECTION_BIZ_TYPE.FILE:
      return "file";
    case MATERIAL_COLLECTION_BIZ_TYPE.H5:
      return "h5";
    case MATERIAL_COLLECTION_BIZ_TYPE.MINI_PROGRAM:
      return "weapp";
    case MATERIAL_COLLECTION_BIZ_TYPE.SPHFEED:
      return "sphfeed";
    default:
      return undefined;
  }
}

function getAttachmentTitle(attachment: WorkbenchQuickReplyAttachment) {
  const content = attachment.content;

  if (attachment.type === "file") {
    return readString(content.fileName) || "文件";
  }

  if (attachment.type === "h5") {
    return readString(content.title) || "H5";
  }

  if (attachment.type === "weapp") {
    return readString(content.title) || "小程序";
  }

  if (attachment.type === "sphfeed") {
    return readString(content.title) || "视频号";
  }

  return readString(content.alt) || readString(content.fileName) || "图片";
}

function getAttachmentTypeIcon(type: WorkbenchQuickReplyAttachmentType) {
  if (type === "weapp") {
    return <MiniProgramMark className="shrink-0 text-muted-foreground" />;
  }

  if (type === "sphfeed") {
    return <SphFeedMark className="size-4 shrink-0 text-muted-foreground" />;
  }

  return (
    <HugeiconsIcon
      aria-hidden="true"
      className="shrink-0 text-muted-foreground"
      icon={getHugeiconsAttachmentTypeIcon(type)}
      size={16}
      strokeWidth={1.8}
    />
  );
}

function getHugeiconsAttachmentTypeIcon(type: WorkbenchQuickReplyAttachmentType) {
  switch (type) {
    case "image":
      return Image01Icon;
    case "file":
      return File01Icon;
    case "h5":
      return Link01Icon;
    default:
      return File01Icon;
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

import {
  FileEmpty01Icon,
  Image01Icon,
  Link04Icon,
  Loading03Icon,
  PlayCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { FileExtensionBadge } from "@/pages/chat/components/message/file";
import { getFileExtension } from "@/pages/chat/lib/composer-file-files";

export type SmartReplyRecommendedAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  defaultSelected?: boolean;
  localPath?: string;
  slocalPath?: string;
  content?: string;
  coverUrl?: string;
};

type RecommendedAttachmentUiType = "image" | "video" | "link" | "file";

const ATTACHMENT_MEDIA_CDN_PREFIX = "https://b1.dtminds.com";

const ATTACHMENT_FILE_TYPE_LABELS: Record<number, string> = {
  1: "图片",
  2: "音频",
  3: "视频",
  4: "图文",
  5: "文件",
  6: "文本",
  7: "小程序",
};

export type SmartReplyRecommendedAttachmentsSectionProps = {
  recommendedAttachments: SmartReplyRecommendedAttachment[];
  selectedAttachmentIds: string[];
  onSelectedAttachmentIdsChange: (attachmentId: string, checked: boolean) => void;
  isLoading?: boolean;
  className?: string;
};

export function SmartReplyRecommendedAttachmentsSection({
  recommendedAttachments,
  selectedAttachmentIds,
  onSelectedAttachmentIdsChange,
  isLoading = false,
  className,
}: SmartReplyRecommendedAttachmentsSectionProps) {
  const selectedCount = selectedAttachmentIds.length;
  const totalAttachments = recommendedAttachments.length;

  if (isLoading) {
    return (
      <section className={className}>
        <p className="flex items-center gap-1 text-[13px] leading-[22px] text-muted-foreground">
          <HugeiconsIcon
            className="animate-spin"
            icon={Loading03Icon}
            size={14}
            strokeWidth={2}
          />
          正在加载推荐附件
        </p>
      </section>
    );
  }

  if (totalAttachments === 0) {
    return null;
  }

  return (
    <section className={className}>
      <p className="text-[13px] leading-[22px] text-foreground">
        <span aria-hidden>
          📎
        </span>{" "}
        推荐附件：
        <span className="text-muted-foreground">
          请按需勾选需要发送的附件 ({selectedCount}/{totalAttachments})
        </span>
      </p>
      <ul>
        {recommendedAttachments.map((attachment) => (
          <RecommendedAttachmentRow
            attachment={attachment}
            checked={selectedAttachmentIds.includes(attachment.id)}
            key={attachment.id}
            onCheckedChange={(checked) =>
              onSelectedAttachmentIdsChange(attachment.id, checked)
            }
          />
        ))}
      </ul>
    </section>
  );
}

function RecommendedAttachmentRow({
  attachment,
  checked,
  onCheckedChange,
}: {
  attachment: SmartReplyRecommendedAttachment;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const typeLabel = getAttachmentTypeLabel(attachment.fileType);

  return (
    <li className="mt-[12px] flex items-center gap-[16px] rounded-[6px] border border-border px-[22px] py-[16px]">
      <Checkbox
        aria-label={`选择附件 ${attachment.fileName}`}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <RecommendedAttachmentPreview attachment={attachment} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-[22px] text-foreground">
          {attachment.fileName}
        </p>
        <p className="text-[12px] leading-5 text-primary">{typeLabel}</p>
      </div>
    </li>
  );
}

function RecommendedAttachmentPreview({
  attachment,
}: {
  attachment: SmartReplyRecommendedAttachment;
}) {
  const uiType = getAttachmentUiType(attachment.fileType);
  const previewUrl = getAttachmentPreviewUrl(attachment);

  if (previewUrl) {
    return (
      <img
        alt=""
        className="size-10 shrink-0 rounded-[6px] object-cover"
        src={previewUrl}
      />
    );
  }

  if (uiType === "file") {
    return (
      <FileExtensionBadge
        className="size-10 shrink-0 rounded-[6px]"
        extension={getFileExtension(attachment.fileName)}
      />
    );
  }

  const icon = getAttachmentTypeIcon(uiType);

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-[6px]",
        getAttachmentPreviewTone(uiType),
      )}
    >
      <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} />
    </div>
  );
}

function parseAttachmentFileType(fileType: string) {
  const parsed = Number.parseInt(fileType, 10);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getAttachmentUiType(fileType: string): RecommendedAttachmentUiType {
  switch (parseAttachmentFileType(fileType)) {
    case 1:
      return "image";
    case 3:
      return "video";
    case 4:
    case 7:
      return "link";
    default:
      return "file";
  }
}

function getAttachmentTypeLabel(fileType: string) {
  const numericType = parseAttachmentFileType(fileType);

  return (
    (numericType != null ? ATTACHMENT_FILE_TYPE_LABELS[numericType] : undefined) ??
    "附件"
  );
}

function resolveAttachmentMediaUrl(path?: string) {
  const trimmed = path?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return ATTACHMENT_MEDIA_CDN_PREFIX + trimmed;
}

function getAttachmentPreviewUrl(attachment: SmartReplyRecommendedAttachment) {
  const uiType = getAttachmentUiType(attachment.fileType);

  if (uiType !== "file") {
    return (
      resolveAttachmentMediaUrl(attachment.coverUrl) ??
      resolveAttachmentMediaUrl(attachment.localPath) ??
      resolveAttachmentMediaUrl(attachment.slocalPath)
    );
  }

  return undefined;
}

function getAttachmentTypeIcon(type: RecommendedAttachmentUiType) {
  switch (type) {
    case "image":
      return Image01Icon;
    case "video":
      return PlayCircle02Icon;
    case "link":
      return Link04Icon;
    default:
      return FileEmpty01Icon;
  }
}

function getAttachmentPreviewTone(type: RecommendedAttachmentUiType) {
  switch (type) {
    case "video":
      return "bg-muted text-muted-foreground";
    case "file":
      return "bg-destructive/10 text-destructive";
    case "link":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

import {
  ArrowDown01Icon,
  Attachment01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { FileMessageContent } from "@/pages/chat/chat-types";

type FileMessageCardProps = {
  content: FileMessageContent;
  onDownloadClick?: () => void;
  transferState?: "idle" | "transferring";
};

export function FileMessageCard({
  content,
  onDownloadClick,
  transferState = "idle",
}: FileMessageCardProps) {
  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-border bg-surface p-3 pb-2">
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-foreground">
            {content.fileName}
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {content.fileSizeLabel}
          </p>
        </div>

        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-[8px] text-[11px] font-semibold uppercase",
            getFileBadgeTone(content.extension),
          )}
        >
          {content.extension}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HugeiconsIcon icon={Attachment01Icon} size={14} strokeWidth={1.8} />
          <span>{content.sourceLabel ?? "文件"}</span>
        </span>

        {transferState === "transferring" ? (
          <span
            aria-label="文件下载中"
            className="inline-flex items-center gap-1 font-medium text-muted-foreground"
            role="status"
          >
            <HugeiconsIcon
              className="animate-spin"
              icon={Loading03Icon}
              size={14}
              strokeWidth={1.8}
            />
            下载中
          </span>
        ) : (
          <button
            aria-label={`下载文件：${content.fileName}`}
            className="inline-flex items-center gap-1 rounded-[4px] font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/35"
            onClick={onDownloadClick}
            type="button"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
            下载
          </button>
        )}
      </div>
    </div>
  );
}

function getFileBadgeTone(extension: string) {
  switch (extension.toLowerCase()) {
    case "pdf":
      return "bg-destructive text-destructive-foreground";
    case "xls":
    case "xlsx":
      return "bg-success text-success-foreground";
    case "doc":
    case "docx":
      return "bg-info text-info-foreground";
    default:
      return "bg-muted-foreground text-background";
  }
}

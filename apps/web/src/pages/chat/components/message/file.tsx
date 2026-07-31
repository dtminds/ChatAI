import {
  DownloadCircle01Icon,
  Attachment01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { FileMessageContent } from "@/pages/chat/chat-types";
import { FileExtensionBadge } from "@/pages/chat/components/file-extension-badge";

type FileMessageCardProps = {
  className?: string;
  content: FileMessageContent;
  onDownloadClick?: () => void;
  showDownloadAction?: boolean;
};

export function FileMessageCard({
  className,
  content,
  onDownloadClick,
  showDownloadAction = true,
}: FileMessageCardProps) {
  const isDownloading = content.downloadStatus === "ing";

  return (
    <div
      className={cn(
        "flex w-[min(19rem,calc(100vw-7rem))] flex-col rounded-[8px] border border-border bg-surface p-3 pb-2",
        className,
      )}
      data-testid="file-message-card"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <div className="min-w-0">
          <p className="line-clamp-2 min-h-10 text-[14px] font-semibold leading-5 text-foreground">
            {content.fileName}
          </p>
        </div>

        <FileExtensionBadge extension={content.extension} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HugeiconsIcon icon={Attachment01Icon} size={14} strokeWidth={1.8} />
          <span>{content.sourceLabel ?? "文件"}</span>
          {content.fileSizeLabel ? (
            <span>{content.fileSizeLabel}</span>
          ) : null}
        </span>

        {showDownloadAction && isDownloading ? (
          <span
            aria-label="文件下载中"
            className="inline-flex items-center gap-1 font-medium text-muted-foreground"
            role="status"
          >
            <Spinner variant="classic" size={14} />
            提取中
          </span>
        ) : showDownloadAction ? (
          <button
            aria-label={`下载文件：${content.fileName}`}
            className="inline-flex items-center gap-1 rounded-[4px] font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/35"
            onClick={onDownloadClick}
            type="button"
          >
            <HugeiconsIcon icon={DownloadCircle01Icon} size={14} strokeWidth={1.8} />
            下载
          </button>
        ) : null}
      </div>
    </div>
  );
}

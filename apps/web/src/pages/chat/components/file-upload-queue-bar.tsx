import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FileUploadQueueItem } from "@/pages/chat/chat-types";

type FileUploadQueueBarProps = {
  items: FileUploadQueueItem[];
  onCancelFileUpload: (uploadId: string) => void;
};

export function FileUploadQueueBar({
  items,
  onCancelFileUpload,
}: FileUploadQueueBarProps) {
  return (
    <div className="px-5">
      <div className="overflow-hidden rounded-t-[14px] border border-b-0 border-divider bg-surface px-4 py-1.5">
        {items.map((item) => (
          <div
            className="grid h-7 grid-cols-[minmax(0,1fr)_160px_auto] items-center gap-4"
            key={item.id}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                {item.fileName}
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {item.status === "sending" ? "正在发送" : "正在准备发送"}
              </span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
                {item.progress}%
              </span>
            </div>
            <button
              aria-label={`取消上传 ${item.fileName}`}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-45"
              onClick={() => onCancelFileUpload(item.id)}
              type="button"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Cancel01Icon}
                size={15}
                strokeWidth={2}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

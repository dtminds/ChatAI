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
};

type FileExtensionBadgeProps = {
  className?: string;
  extension: string;
};

const FILE_TYPE_ICON_BY_EXTENSION: Record<
  string,
  {
    alt: string;
    src: string;
  }
> = {
  csv: {
    alt: "Excel 文件",
    src: "https://b5.bokr.com.cn/dist/excel.png",
  },
  doc: {
    alt: "Word 文件",
    src: "https://b5.bokr.com.cn/dist/word.png",
  },
  docx: {
    alt: "Word 文件",
    src: "https://b5.bokr.com.cn/dist/word.png",
  },
  pdf: {
    alt: "PDF 文件",
    src: "https://b5.bokr.com.cn/dist/pdf.png",
  },
  ppt: {
    alt: "PPT 文件",
    src: "https://b5.bokr.com.cn/dist/ppt.png",
  },
  pptx: {
    alt: "PPT 文件",
    src: "https://b5.bokr.com.cn/dist/ppt.png",
  },
  rar: {
    alt: "压缩文件",
    src: "https://b5.bokr.com.cn/dist/zip.png",
  },
  xls: {
    alt: "Excel 文件",
    src: "https://b5.bokr.com.cn/dist/excel.png",
  },
  xlsx: {
    alt: "Excel 文件",
    src: "https://b5.bokr.com.cn/dist/excel.png",
  },
  zip: {
    alt: "压缩文件",
    src: "https://b5.bokr.com.cn/dist/zip.png",
  },
};

const DEFAULT_FILE_TYPE_ICON = {
  alt: "文件",
  src: "https://b5.bokr.com.cn/dist/file.png",
};

export function FileMessageCard({
  content,
  onDownloadClick,
}: FileMessageCardProps) {
  const isDownloading = content.downloadStatus === "ing";

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

        <FileExtensionBadge extension={content.extension} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-divider pt-2.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <HugeiconsIcon icon={Attachment01Icon} size={14} strokeWidth={1.8} />
          <span>{content.sourceLabel ?? "文件"}</span>
        </span>

        {isDownloading ? (
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

export function FileExtensionBadge({
  className,
  extension,
}: FileExtensionBadgeProps) {
  const fileTypeIcon = getFileTypeIcon(extension) ?? DEFAULT_FILE_TYPE_ICON;

  return (
    <img
      alt={fileTypeIcon.alt}
      className={cn("size-12 shrink-0 object-contain", className)}
      src={fileTypeIcon.src}
    />
  );
}

function getFileTypeIcon(extension: string) {
  return FILE_TYPE_ICON_BY_EXTENSION[extension.trim().toLowerCase()];
}

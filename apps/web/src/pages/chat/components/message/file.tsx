import {
  DownloadCircle01Icon,
  Attachment01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { FileMessageContent } from "@/pages/chat/chat-types";

type FileMessageCardProps = {
  className?: string;
  content: FileMessageContent;
  onDownloadClick?: () => void;
  showDownloadAction?: boolean;
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
  bmp: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  gif: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  jpeg: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  jpg: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  png: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  svg: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
  },
  webp: {
    alt: "图片文件",
    src: "https://b5.bokr.com.cn/dist/image.png",
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

function getFileTypeIcon(extension: string | null | undefined) {
  if (!extension) {
    return undefined;
  }

  const trimmed = extension.trim().toLowerCase();
  const lastSegment = trimmed.split(".").pop() ?? trimmed;

  return FILE_TYPE_ICON_BY_EXTENSION[lastSegment];
}

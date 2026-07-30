import { cn } from "@/lib/utils";

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

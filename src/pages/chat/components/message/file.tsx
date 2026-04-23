import {
  ArrowDown01Icon,
  Attachment01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { FileMessageContent } from "@/pages/chat/chat-types";

type FileMessageCardProps = {
  content: FileMessageContent;
};

export function FileMessageCard({ content }: FileMessageCardProps) {
  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-[#e6ebf1] bg-white p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-[#18212f]">
            {content.fileName}
          </p>
          <p className="mt-1.5 text-[13px] text-[#8b96a6]">{content.fileSizeLabel}</p>
        </div>

        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-[8px] text-[11px] font-semibold uppercase text-white",
            getFileBadgeTone(content.extension),
          )}
        >
          {content.extension}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#edf1f5] pt-2.5 text-[11px] text-[#7d8898]">
        <span className="inline-flex items-center gap-1.5">
          <HugeiconsIcon icon={Attachment01Icon} size={14} strokeWidth={1.8} />
          <span>{content.sourceLabel ?? "文件"}</span>
        </span>

        <span className="inline-flex items-center gap-1 font-medium text-[#506070]">
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.8} />
          下载
        </span>
      </div>
    </div>
  );
}

function getFileBadgeTone(extension: string) {
  switch (extension.toLowerCase()) {
    case "pdf":
      return "bg-[linear-gradient(135deg,#ff6a5e,#e63b2e)]";
    case "xls":
    case "xlsx":
      return "bg-[linear-gradient(135deg,#47b36f,#2f8f54)]";
    case "doc":
    case "docx":
      return "bg-[linear-gradient(135deg,#5d8df5,#3467d6)]";
    default:
      return "bg-[linear-gradient(135deg,#7a8aa0,#536175)]";
  }
}

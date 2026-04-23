import {
  AiBrowserIcon,
  AiFileIcon,
  AnalysisTextLinkIcon,
  ArrowDown01Icon,
  Attachment01Icon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type {
  ChatMessage,
  FileMessageContent,
  H5CardMessageContent,
  ImageMessageContent,
  MiniProgramMessageContent,
  VoiceMessageContent,
} from "@/pages/chat/chat-types";

type MessageContentRendererProps = {
  isAgent: boolean;
  message: ChatMessage;
};

export function MessageContentRenderer({
  isAgent,
  message,
}: MessageContentRendererProps) {
  switch (message.content.type) {
    case "text":
      return <TextMessageBubble isAgent={isAgent} text={message.content.text} />;
    case "voice":
      return <VoiceMessageCard content={message.content} isAgent={isAgent} />;
    case "image":
      return <ImageMessageCard content={message.content} />;
    case "file":
      return <FileMessageCard content={message.content} />;
    case "h5":
      return <H5MessageCard content={message.content} />;
    case "mini-program":
      return <MiniProgramMessageCard content={message.content} />;
  }
}

export function TextMessageBubble({
  isAgent,
  text,
}: {
  isAgent: boolean;
  text: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] px-3 py-2.5 text-[14px] leading-6",
        isAgent ? "bg-[#cfe7ff] text-[#18212f]" : "bg-[#f2f4f7] text-[#18212f]",
      )}
    >
      {text}
    </div>
  );
}

export function VoiceMessageCard({
  content,
  isAgent,
}: {
  content: VoiceMessageContent;
  isAgent: boolean;
}) {
  const bubbleTone = isAgent ? "bg-[#d8edff]" : "bg-[#f1f3f6]";

  return (
    <div
      className={cn(
        "relative inline-flex min-h-10 min-w-28 items-center gap-2.5 rounded-[12px] px-3.5 py-1.5",
        bubbleTone,
      )}
    >
      <HugeiconsIcon
        className="relative z-1 shrink-0 text-[#1f2733]"
        icon={VolumeHighIcon}
        size={18}
        strokeWidth={1.9}
      />
      <span className="relative z-1 shrink-0 text-[14px] font-semibold leading-none text-[#1f2733]">
        {content.durationLabel}
      </span>
    </div>
  );
}

export function ImageMessageCard({ content }: { content: ImageMessageContent }) {
  const frameStyle = getImageFrameStyle(content);

  return (
    <div
      className="relative isolate overflow-hidden rounded-[8px]"
      style={frameStyle}
    >
      <img
        alt={content.alt}
        className="absolute inset-0 h-full w-full object-cover"
        height={content.height}
        loading="lazy"
        src={content.imageUrl}
        width={content.width}
      />
    </div>
  );
}

export function FileMessageCard({ content }: { content: FileMessageContent }) {
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

export function H5MessageCard({ content }: { content: H5CardMessageContent }) {
  return (
    <div className="w-[min(19rem,calc(100vw-7rem))] rounded-[8px] border border-[#e6ebf1] bg-white p-3">
      <p className="line-clamp-1 text-[14px] font-semibold leading-5 text-[#18212f]">
        {content.title}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2.5">
        <p className="line-clamp-2 text-[12px] leading-5 text-[#6f7b8b]">
          {content.description}
        </p>
        {content.previewImageUrl ? (
          <img
            alt={content.title}
            className="size-12 rounded-[8px] object-cover"
            loading="lazy"
            src={content.previewImageUrl}
          />
        ) : (
          <div className="flex size-12 items-center justify-center rounded-[8px] bg-[linear-gradient(135deg,rgba(224,235,252,0.95),rgba(248,233,244,0.95))] text-[#6986c7]">
            <HugeiconsIcon icon={AnalysisTextLinkIcon} size={18} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </div>
  );
}

export function MiniProgramMessageCard({
  content,
}: {
  content: MiniProgramMessageContent;
}) {
  return (
    <div className="w-[min(17rem,calc(100vw-7rem))] rounded-[8px] border border-[#e6ebf1] bg-white p-2.5 pb-1.5">
      <div className="flex items-center gap-1.5 text-[12px] text-[#667487]">
        <div className="flex size-7 items-center justify-center rounded-full bg-[#eee] text-[#5276d9]">
          <HugeiconsIcon icon={AiBrowserIcon} size={14} strokeWidth={1.9} />
        </div>
        <span className="font-medium">{content.appName}</span>
      </div>

      <div className="mt-2.5">
        <p className="line-clamp-2 text-[14px] font-medium leading-5 text-[#18212f]">
          {content.title}
        </p>
      </div>

      <div className="mt-2.5 aspect-[5/4] overflow-hidden rounded-[8px] bg-[#f4f6f8]">
        {content.coverImageUrl ? (
          <img
            alt={content.title}
            className="block h-full w-full object-cover"
            loading="lazy"
            src={content.coverImageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[#d4dae2]">
            <HugeiconsIcon icon={AiFileIcon} size={36} strokeWidth={1.6} />
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1 border-t border-[#edf1f5] pt-2 text-[11px] text-[#7d8898]">
        <MiniProgramMark className="shrink-0 text-[#111111]" />
        <span>{content.sourceLabel ?? "小程序"}</span>
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

function MiniProgramMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("h-4 w-4", className)}
      viewBox="0 0 1024 1024"
    >
      <path
        d="M800 384a160.384 160.384 0 0 1-128.64 156.928 32 32 0 0 1-12.48-62.72A96 96 0 1 0 544 384v256a160 160 0 1 1-191.36-156.928 32 32 0 1 1 12.48 62.72A96 96 0 1 0 480 640V384a160 160 0 0 1 320 0z"
        fill="currentColor"
      />
    </svg>
  );
}

function getImageFrameStyle(content: ImageMessageContent) {
  const rawWidth = content.width ?? 320;
  const rawHeight = content.height ?? 320;
  const maxWidth = 360;
  const maxHeight = 320;
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight, 1);

  return {
    width: `${Math.max(Math.round(rawWidth * scale), 160)}px`,
    height: `${Math.max(Math.round(rawHeight * scale), 120)}px`,
    maxWidth: "min(22rem, calc(100vw - 7rem))",
  };
}

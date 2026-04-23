import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { VoiceMessageContent } from "@/pages/chat/chat-types";

type VoiceMessageCardProps = {
  content: VoiceMessageContent;
  isAgent: boolean;
};

export function VoiceMessageCard({
  content,
  isAgent,
}: VoiceMessageCardProps) {
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

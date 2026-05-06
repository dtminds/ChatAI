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
  const bubbleTone = isAgent ? "bg-message-agent" : "bg-message-customer";

  return (
    <div
      className={cn(
        "relative inline-flex min-h-10 min-w-28 items-center gap-2.5 rounded-[12px] px-3.5 py-1.5",
        bubbleTone,
      )}
    >
      <HugeiconsIcon
        className="relative z-1 shrink-0 text-foreground"
        icon={VolumeHighIcon}
        size={18}
        strokeWidth={1.9}
      />
      <span className="relative z-1 shrink-0 text-[14px] font-semibold leading-none text-foreground">
        {content.durationLabel}
      </span>
    </div>
  );
}

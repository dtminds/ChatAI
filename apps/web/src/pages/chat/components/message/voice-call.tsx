import { Call02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getTextBubbleClassName } from "@/pages/chat/components/message/bubble-style";
import type { VoiceCallMessageContent } from "@/pages/chat/chat-types";
import { cn } from "@/lib/utils";

type VoiceCallMessageCardProps = {
  content: VoiceCallMessageContent;
  isAgent: boolean;
  isOwnMessage?: boolean;
  variant?: "bubble" | "plain";
};

export function VoiceCallMessageCard({
  content,
  isAgent,
  isOwnMessage,
  variant = "bubble",
}: VoiceCallMessageCardProps) {
  const isRightAligned = variant === "bubble" && (isAgent || Boolean(isOwnMessage));
  const accessibleName = content.missed ? `${content.text} 未接听` : content.text;

  return (
    <div
      aria-label={accessibleName}
      className={cn(
        "flex items-center gap-1.5",
        variant === "plain"
          ? "w-full max-w-full min-w-0 text-sm leading-6 text-foreground"
          : cn(getTextBubbleClassName(isAgent, isOwnMessage), "py-2"),
        isRightAligned ? "flex-row-reverse" : "flex-row",
      )}
      data-testid="voice-call-message-bubble"
      role="img"
    >
      <HugeiconsIcon
        aria-hidden="true"
        className={cn(
          "shrink-0",
          isRightAligned ? "text-primary" : "text-muted-foreground",
        )}
        icon={Call02Icon}
        size={16}
        strokeWidth={1.8}
      />
      <span className="min-w-0">{content.text}</span>
      {content.missed ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-destructive"
          data-testid="voice-call-missed-dot"
        />
      ) : null}
    </div>
  );
}

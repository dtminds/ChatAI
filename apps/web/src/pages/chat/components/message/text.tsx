import { cn } from "@/lib/utils";
import { parseWechatEmojiText } from "@/pages/chat/wechat-emoji";

type TextMessageBubbleProps = {
  isAgent: boolean;
  text: string;
};

export function TextMessageBubble({ isAgent, text }: TextMessageBubbleProps) {
  return (
    <div
      className={cn(
        "w-fit max-w-full rounded-[12px] px-3 py-2.5 text-[14px] leading-6",
        isAgent
          ? "bg-primary/10 text-foreground"
          : "bg-secondary text-foreground",
      )}
      data-testid="text-message-bubble"
    >
      <span
        className="whitespace-pre-wrap break-words"
        style={{
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {parseWechatEmojiText(text).map((segment, index) =>
          segment.type === "text" ? (
            <span key={`text-${index}`}>{segment.value}</span>
          ) : (
            <img
              alt={segment.value.name}
              className="mx-0.5 inline-block size-6 align-[-0.35em]"
              draggable={false}
              key={`emoji-${segment.value.name}-${index}`}
              src={segment.value.path}
              title={segment.value.name}
            />
          ),
        )}
      </span>
    </div>
  );
}

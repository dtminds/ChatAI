import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { getTextBubbleClassName } from "@/pages/chat/components/message/bubble-style";
import { parseWechatEmojiText } from "@/pages/chat/wechat-emoji";

type WechatEmojiTextProps = {
  className?: string;
  text: string;
};

type TextMessageBubbleProps = {
  isAgent: boolean;
  isOwnMessage?: boolean;
  onClick?: () => void;
  text: string;
};

export function TextMessageBubble({
  isAgent,
  isOwnMessage,
  onClick,
  text,
}: TextMessageBubbleProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    onClick();
  };

  const interactiveProps = onClick
    ? {
        "aria-label": "查看发送时间",
        onClick,
        onKeyDown: handleKeyDown,
        role: "button" as const,
        tabIndex: 0,
      }
    : {};

  return (
    <div
      className={cn(
        getTextBubbleClassName(isAgent, isOwnMessage),
        onClick && "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
      )}
      data-testid="text-message-bubble"
      {...interactiveProps}
    >
      <WechatEmojiText
        className="whitespace-pre-wrap break-words"
        text={text}
      />
    </div>
  );
}

export function WechatEmojiText({ className, text }: WechatEmojiTextProps) {
  return (
    <span
      className={className}
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
            className="mx-0.5 inline-block size-5 align-[-0.35em]"
            draggable={false}
            key={`emoji-${segment.value.name}-${index}`}
            src={segment.value.path}
            title={segment.value.name}
          />
        ),
      )}
    </span>
  );
}

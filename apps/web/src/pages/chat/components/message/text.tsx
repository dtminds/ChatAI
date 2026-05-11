import { getTextBubbleClassName } from "@/pages/chat/components/message/bubble-style";
import { parseWechatEmojiText } from "@/pages/chat/wechat-emoji";

type TextMessageBubbleProps = {
  isAgent: boolean;
  isOwnMessage?: boolean;
  text: string;
};

export function TextMessageBubble({ isAgent, isOwnMessage, text }: TextMessageBubbleProps) {
  return (
    <div
      className={getTextBubbleClassName(isAgent, isOwnMessage)}
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

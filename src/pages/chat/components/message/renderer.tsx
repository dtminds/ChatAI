import type { ChatMessage } from "@/pages/chat/chat-types";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import { VoiceMessageCard } from "@/pages/chat/components/message/voice";

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
      return <LinkMessageCard content={message.content} />;
    case "mini-program":
      return <MiniAppMessageCard content={message.content} />;
  }
}

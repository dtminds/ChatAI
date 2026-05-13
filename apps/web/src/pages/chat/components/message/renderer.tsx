import type { ChatMessage } from "@/pages/chat/chat-types";
import { ContactCardMessageCard } from "@/pages/chat/components/message/contact-card";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { LocationMessageCard } from "@/pages/chat/components/message/location";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { QuoteMessageCard } from "@/pages/chat/components/message/quote";
import { SolitaireMessageCard } from "@/pages/chat/components/message/solitaire";
import { SphFeedMessageCard } from "@/pages/chat/components/message/sphfeed";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import { VideoMessageCard } from "@/pages/chat/components/message/video";
import { VoiceMessageCard } from "@/pages/chat/components/message/voice";

type MessageContentRendererProps = {
  isAgent: boolean;
  message: ChatMessage;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
};

export function MessageContentRenderer({
  isAgent,
  message,
  onOpenQuotedMessage,
}: MessageContentRendererProps) {
  switch (message.content.type) {
    case "text":
      return (
        <TextMessageBubble
          isAgent={isAgent}
          isOwnMessage={message.isOwnMessage}
          text={message.content.text}
        />
      );
    case "voice":
      return <VoiceMessageCard content={message.content} isAgent={isAgent} />;
    case "image":
      return <ImageMessageCard content={message.content} />;
    case "video":
      return <VideoMessageCard content={message.content} />;
    case "file":
      return <FileMessageCard content={message.content} />;
    case "h5":
      return <LinkMessageCard content={message.content} />;
    case "mini-program":
      return <MiniAppMessageCard content={message.content} />;
    case "contact-card":
      return <ContactCardMessageCard content={message.content} />;
    case "location":
      return <LocationMessageCard content={message.content} />;
    case "sphfeed":
      return <SphFeedMessageCard content={message.content} />;
    case "solitaire":
      return (
        <SolitaireMessageCard
          content={message.content}
          isAgent={isAgent}
          isOwnMessage={message.isOwnMessage}
        />
      );
    case "quote":
      return (
        <QuoteMessageCard
          content={message.content}
          isAgent={isAgent}
          isOwnMessage={message.isOwnMessage}
          onOpenQuotedMessage={onOpenQuotedMessage}
        />
      );
  }
}

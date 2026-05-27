import type { ChatMessage } from "@/pages/chat/chat-types";
import { ContactCardMessageCard } from "@/pages/chat/components/message/contact-card";
import { FileMessageCard } from "@/pages/chat/components/message/file";
import { ImageMessageCard } from "@/pages/chat/components/message/image";
import { LinkMessageCard } from "@/pages/chat/components/message/link";
import { LocationMessageCard } from "@/pages/chat/components/message/location";
import { MiniAppMessageCard } from "@/pages/chat/components/message/miniapp";
import { QuoteMessageCard } from "@/pages/chat/components/message/quote";
import { RedPacketMessageCard } from "@/pages/chat/components/message/redpacket";
import { SolitaireMessageCard } from "@/pages/chat/components/message/solitaire";
import { SphFeedMessageCard } from "@/pages/chat/components/message/sphfeed";
import { TextMessageBubble } from "@/pages/chat/components/message/text";
import { VideoMessageCard } from "@/pages/chat/components/message/video";
import { VoiceMessageCard } from "@/pages/chat/components/message/voice";

type MessageContentRendererProps = {
  isAgent: boolean;
  message: ChatMessage;
  onDownloadMessageFile?: (message: ChatMessage) => void;
  onOpenQuotedMessage?: (quoteMsgId: string) => void;
  onVoicePlaybackReady?: (
    message: ChatMessage,
    payload: { playbackUrl: string },
  ) => void;
};

export function MessageContentRenderer({
  isAgent,
  message,
  onDownloadMessageFile,
  onOpenQuotedMessage,
  onVoicePlaybackReady,
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
      return (
        <VoiceMessageCard
          content={message.content}
          isAgent={isAgent}
          onPlaybackReady={(payload) => onVoicePlaybackReady?.(message, payload)}
        />
      );
    case "image":
      return <ImageMessageCard content={message.content} />;
    case "video":
      return (
        <VideoMessageCard
          content={message.content}
          onDownloadClick={() => onDownloadMessageFile?.(message)}
        />
      );
    case "file":
      return (
        <FileMessageCard
          content={message.content}
          onDownloadClick={() => onDownloadMessageFile?.(message)}
        />
      );
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
    case "redpacket":
      return <RedPacketMessageCard content={message.content} />;
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

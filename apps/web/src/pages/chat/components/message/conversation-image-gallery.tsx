import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage, Message } from "@/pages/chat/chat-types";
import { ConversationImageGalleryContext } from "@/pages/chat/components/message/conversation-image-gallery-context";
import {
  ImagePreviewDialog,
  type ImageGalleryItem,
} from "@/pages/chat/components/message/image";

export type ConversationGalleryImage = ImageGalleryItem & {
  messageId: string;
};

export function collectConversationGalleryImages(
  messages: Message[],
): ConversationGalleryImage[] {
  const items: ConversationGalleryImage[] = [];

  for (const message of messages) {
    if (!isChatMessage(message) || message.content.type !== "image") {
      continue;
    }

    const imageUrl = message.content.imageUrl.trim();

    if (!imageUrl) {
      continue;
    }

    items.push({
      alt: message.content.alt,
      imageUrl,
      messageId: message.id,
      ocrEnabled: message.content.variant !== "emotion",
    });
  }

  return items;
}

export function ConversationImageGalleryProvider({
  children,
  messages,
}: {
  children: ReactNode;
  messages: Message[];
}) {
  const galleryItems = useMemo(
    () => collectConversationGalleryImages(messages),
    [messages],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = galleryItems[activeIndex];

  const openGallery = useCallback(
    (messageId: string) => {
      const index = galleryItems.findIndex((item) => item.messageId === messageId);

      if (index < 0) {
        return;
      }

      setActiveIndex(index);
      setIsOpen(true);
    },
    [galleryItems],
  );

  const contextValue = useMemo(
    () => ({
      openGallery,
    }),
    [openGallery],
  );

  return (
    <ConversationImageGalleryContext.Provider value={contextValue}>
      {children}
      {activeItem ? (
        <ImagePreviewDialog
          alt={activeItem.alt}
          galleryIndex={activeIndex}
          galleryItems={galleryItems}
          imageUrl={activeItem.imageUrl}
          ocrEnabled={activeItem.ocrEnabled}
          onGalleryIndexChange={setActiveIndex}
          onOpenChange={setIsOpen}
          open={isOpen}
        />
      ) : null}
    </ConversationImageGalleryContext.Provider>
  );
}

function isChatMessage(message: Message): message is ChatMessage {
  return message.role !== "system";
}

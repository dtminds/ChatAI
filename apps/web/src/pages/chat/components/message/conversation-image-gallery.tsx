import {
  useCallback,
  useEffect,
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
    if (!isChatMessage(message) || message.isRevoked) {
      continue;
    }

    const content = message.content;

    if (content?.type !== "image") {
      continue;
    }

    const imageUrl = content.imageUrl?.trim() ?? "";

    if (!imageUrl) {
      continue;
    }

    items.push({
      alt: content.alt ?? "",
      imageUrl,
      messageId: message.id,
      ocrEnabled: content.variant !== "emotion",
    });
  }

  return items;
}

export function clampConversationGalleryIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, length - 1));
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

  useEffect(() => {
    if (galleryItems.length === 0) {
      setIsOpen(false);
      setActiveIndex(0);
      return;
    }

    setActiveIndex((currentIndex) =>
      clampConversationGalleryIndex(currentIndex, galleryItems.length),
    );
  }, [galleryItems]);

  const safeActiveIndex = clampConversationGalleryIndex(
    activeIndex,
    galleryItems.length,
  );
  const activeItem = galleryItems[safeActiveIndex];

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
      {isOpen && activeItem ? (
        <ImagePreviewDialog
          alt={activeItem.alt}
          galleryIndex={safeActiveIndex}
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

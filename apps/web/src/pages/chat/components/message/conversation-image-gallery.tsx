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

export const GALLERY_RADIUS = 20;

export type ConversationGalleryImage = ImageGalleryItem & {
  messageId: string;
};

export type GallerySession = {
  activeMessageId: string;
  items: ConversationGalleryImage[];
};

export function toGalleryImage(message: Message): ConversationGalleryImage | null {
  if (!isChatMessage(message)) {
    return null;
  }

  const content = message.content;

  if (content?.type !== "image") {
    return null;
  }

  const imageUrl = content.imageUrl?.trim() ?? "";

  if (!imageUrl) {
    return null;
  }

  return {
    alt: content.alt ?? "",
    imageUrl,
    messageId: message.id,
    ocrEnabled: content.variant !== "emotion",
  };
}

export function buildGalleryWindow(
  messages: Message[],
  anchorMessageId: string,
  radius = GALLERY_RADIUS,
): GallerySession | null {
  const anchorIndex = messages.findIndex((message) => message.id === anchorMessageId);

  if (anchorIndex < 0) {
    return null;
  }

  const anchor = toGalleryImage(messages[anchorIndex]);

  if (!anchor) {
    return null;
  }

  const before: ConversationGalleryImage[] = [];

  for (let index = anchorIndex - 1; index >= 0 && before.length < radius; index -= 1) {
    const item = toGalleryImage(messages[index]);

    if (item) {
      before.unshift(item);
    }
  }

  const after: ConversationGalleryImage[] = [];

  for (
    let index = anchorIndex + 1;
    index < messages.length && after.length < radius;
    index += 1
  ) {
    const item = toGalleryImage(messages[index]);

    if (item) {
      after.push(item);
    }
  }

  return {
    activeMessageId: anchorMessageId,
    items: [...before, anchor, ...after],
  };
}

export function resolveGallerySessionIndex(session: GallerySession) {
  return session.items.findIndex((item) => item.messageId === session.activeMessageId);
}

export function ConversationImageGalleryProvider({
  children,
  conversationId,
  messages,
}: {
  children: ReactNode;
  conversationId: string;
  messages: Message[];
}) {
  const [session, setSession] = useState<GallerySession | null>(null);

  useEffect(() => {
    setSession(null);
  }, [conversationId]);

  const openGallery = useCallback(
    (messageId: string) => {
      const nextSession = buildGalleryWindow(messages, messageId, GALLERY_RADIUS);

      if (!nextSession) {
        return;
      }

      setSession(nextSession);
    },
    [messages],
  );

  const closeGallery = useCallback(() => {
    setSession(null);
  }, []);

  const handleGalleryIndexChange = useCallback((index: number) => {
    setSession((currentSession) => {
      if (!currentSession) {
        return currentSession;
      }

      const item = currentSession.items[index];

      if (!item) {
        return currentSession;
      }

      return {
        ...currentSession,
        activeMessageId: item.messageId,
      };
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      openGallery,
    }),
    [openGallery],
  );

  const activeIndex = session ? resolveGallerySessionIndex(session) : -1;
  const activeItem = activeIndex >= 0 ? session?.items[activeIndex] : null;

  return (
    <ConversationImageGalleryContext.Provider value={contextValue}>
      {children}
      {session && activeItem ? (
        <ImagePreviewDialog
          alt={activeItem.alt}
          galleryIndex={activeIndex}
          galleryItems={session.items}
          imageUrl={activeItem.imageUrl}
          ocrEnabled={activeItem.ocrEnabled}
          onGalleryIndexChange={handleGalleryIndexChange}
          onOpenChange={(open) => {
            if (!open) {
              closeGallery();
            }
          }}
          open
        />
      ) : null}
    </ConversationImageGalleryContext.Provider>
  );
}

function isChatMessage(message: Message): message is ChatMessage {
  return message.role !== "system";
}

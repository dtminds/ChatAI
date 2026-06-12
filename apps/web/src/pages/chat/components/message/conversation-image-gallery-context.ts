import { createContext, useContext } from "react";

type ConversationImageGalleryContextValue = {
  openGallery: (messageId: string) => void;
};

export const ConversationImageGalleryContext = 
  createContext<ConversationImageGalleryContextValue | null>(null);

export function useConversationImageGallery() {
  return useContext(ConversationImageGalleryContext);
}

export function clampConversationGalleryIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, length - 1));
}

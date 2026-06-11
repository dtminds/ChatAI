import { createContext, useContext } from "react";

type ConversationImageGalleryContextValue = {
  openGallery: (messageId: string) => void;
};

export const ConversationImageGalleryContext =
  createContext<ConversationImageGalleryContextValue | null>(null);

export function useConversationImageGallery() {
  return useContext(ConversationImageGalleryContext);
}

import { createContext, useContext } from "react";

type ConversationImageGalleryContextValue = {
  openGallery: (uiMessageKey: string) => void;
};

export const ConversationImageGalleryContext = 
  createContext<ConversationImageGalleryContextValue | null>(null);

export function useConversationImageGallery() {
  return useContext(ConversationImageGalleryContext);
}

import { DISABLE_SPH_COLLECTION } from "@/pages/chat/chat-constants";
import type { ChatMessage } from "@/pages/chat/chat-types";

export function canCollectMaterial(message: ChatMessage) {
  if (message.content.type === "image") {
    if (message.content.variant === "emotion") {
      return true;
    }

    return (
      message.content.downloadStatus === "finished" &&
      message.content.imageUrl.trim().length > 0
    );
  }

  if (message.content.type === "video") {
    return (
      message.role === "agent" &&
      message.content.downloadStatus === "finished" &&
      message.content.coverImageUrl.trim().length > 0 &&
      message.content.videoUrl.trim().length > 0
    );
  }

  return (
    message.content.type === "file" ||
    message.content.type === "mini-program" ||
    message.content.type === "h5" ||
    (!DISABLE_SPH_COLLECTION && message.content.type === "sphfeed")
  );
}

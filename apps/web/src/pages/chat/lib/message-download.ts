import type { ChatMessage } from "@/pages/chat/chat-types";
import { isSafeHttpOrRelativeUrl } from "@/pages/chat/lib/message-url-expiry";

export function openMessageDownloadUrl(message: ChatMessage, url: string) {
  if (!isSafeHttpOrRelativeUrl(url)) {
    return;
  }

  if (message.content.type === "video") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = message.content.type === "file" ? message.content.fileName : "";
  link.rel = "noopener noreferrer";
  link.target = "_blank";
  document.body.append(link);
  link.click();
  link.remove();
}

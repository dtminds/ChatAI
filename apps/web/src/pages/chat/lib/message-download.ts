import type { ChatMessage } from "@/pages/chat/chat-types";

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

function isSafeHttpOrRelativeUrl(url: string) {
  if (url.startsWith("/")) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

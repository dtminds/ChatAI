import type { ChatMessage } from "@/pages/chat/chat-types";
import {
  canUseExpiringUrl,
  isSafeHttpOrRelativeUrl,
} from "@/pages/chat/lib/message-url-expiry";

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

export function getMessageDownloadUrl(message: ChatMessage) {
  if (message.content.type === "file") {
    return message.content.fileUrl?.trim() ?? "";
  }

  if (message.content.type === "video") {
    return message.content.videoUrl?.trim() ?? "";
  }

  if (message.content.type === "image") {
    return message.content.imageUrl.trim();
  }

  return "";
}

export function isMessageDownloadUrlReady(message: ChatMessage, url: string) {
  if (message.content.type === "video") {
    return (
      message.content.downloadStatus === "finished" &&
      canUseExpiringUrl(url, message.content.fileUrlExpireTime)
    );
  }

  return (
    message.content.type === "file" &&
    message.content.downloadStatus === "finished" &&
    Boolean(url)
  );
}

type StartMessageFileDownloadOptions = {
  activeConversationId: string | undefined;
  downloadMessageFile: (input: {
    conversationId: string;
    msgInfoId: number;
  }) => Promise<unknown>;
  isMounted: () => boolean;
  onTransferError: () => void;
  openDownloadUrl?: (message: ChatMessage, url: string) => void;
  updateDownloadContent: (
    conversationId: string,
    uiMessageKey: string,
    contentPatch: {
      downloadStatus?: "ing" | "finished" | "failed";
      updatedAtMs?: number;
    },
  ) => void;
};

export function startMessageFileDownload(
  message: ChatMessage,
  options: StartMessageFileDownloadOptions,
) {
  if (
    message.content.type !== "file" &&
    message.content.type !== "video" &&
    message.content.type !== "image"
  ) {
    return;
  }

  const url = getMessageDownloadUrl(message);
  const openDownloadUrl = options.openDownloadUrl ?? openMessageDownloadUrl;

  if (isMessageDownloadUrlReady(message, url)) {
    openDownloadUrl(message, url);
    return;
  }

  if (
    !message.content.fileSerialNo ||
    !message.seq ||
    !options.activeConversationId ||
    message.conversationId !== options.activeConversationId
  ) {
    return;
  }

  options.updateDownloadContent(message.conversationId, message.uiMessageKey, {
    downloadStatus: "ing",
    updatedAtMs: Date.now(),
  });

  return options
    .downloadMessageFile({
      conversationId: message.conversationId,
      msgInfoId: message.seq,
    })
    .catch(() => {
      if (!options.isMounted()) {
        return;
      }

      options.updateDownloadContent(message.conversationId, message.uiMessageKey, {
        downloadStatus: "failed",
      });
      options.onTransferError();
    });
}

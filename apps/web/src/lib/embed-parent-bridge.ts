export const CHAT_EMBED_PARENT_CHANNEL = "smp-basement-chat-embed";

export type ChatEmbedLoadErrorCode =
  | "EMBED_HANDOFF_REQUIRED"
  | "EMBED_ACCESS_DENIED"
  | "EMBED_SSO_UNAVAILABLE";

type ChatEmbedParentMessage =
  | {
      code: ChatEmbedLoadErrorCode;
      type: "load-error";
    }
  | {
      fullscreen: boolean;
      path: string;
      type: "navigate";
    };

export function postChatEmbedParentMessage(message: ChatEmbedParentMessage) {
  window.parent.postMessage(
    {
      channel: CHAT_EMBED_PARENT_CHANNEL,
      ...message,
    },
    "*",
  );
}

export function postChatEmbedLoadError(code: ChatEmbedLoadErrorCode) {
  postChatEmbedParentMessage({ code, type: "load-error" });
}

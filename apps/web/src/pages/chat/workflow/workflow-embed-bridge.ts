import { withEmbedAuthHandoff } from "@/lib/embed-access-token";

export const SMP_BASEMENT_CHAT_EMBED_CHANNEL = "smp-basement-chat-embed";

export function postSmpBasementChatEmbedNavigate(path: string, fullscreen: boolean) {
  window.parent.postMessage(
    {
      channel: SMP_BASEMENT_CHAT_EMBED_CHANNEL,
      type: "navigate",
      path: withEmbedAuthHandoff(path),
      fullscreen,
    },
    "*",
  );
}

export function postSmpBasementChatEmbedLeaveEditor() {
  postSmpBasementChatEmbedNavigate("/embed/workflows", false);
}

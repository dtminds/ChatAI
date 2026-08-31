import {
  getEmbedAccessToken,
  withEmbedWorkflowHandoff,
} from "@/lib/embed-access-token";

export const SMP_BASEMENT_CHAT_EMBED_CHANNEL = "smp-basement-chat-embed";

export function postSmpBasementChatEmbedNavigate(path: string, fullscreen: boolean) {
  const token = getEmbedAccessToken();

  window.parent.postMessage(
    {
      channel: SMP_BASEMENT_CHAT_EMBED_CHANNEL,
      type: "navigate",
      path: withEmbedWorkflowHandoff(path),
      fullscreen,
      ...(token ? { token } : {}),
    },
    "*",
  );
}

export function postSmpBasementChatEmbedLeaveEditor() {
  postSmpBasementChatEmbedNavigate("/embed/workflows", false);
}

export function readSmpBasementChatEmbedToken(data: unknown) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as { channel?: unknown; token?: unknown };

  if (payload.channel !== SMP_BASEMENT_CHAT_EMBED_CHANNEL) {
    return null;
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  return token || null;
}

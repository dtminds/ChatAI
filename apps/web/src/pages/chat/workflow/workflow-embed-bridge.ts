import { postChatEmbedParentMessage } from "@/lib/embed-parent-bridge";

export function postSmpBasementChatEmbedNavigate(path: string, fullscreen: boolean) {
  postChatEmbedParentMessage({
    fullscreen,
    path,
    type: "navigate",
  });
}

export function postSmpBasementChatEmbedLeaveEditor() {
  postSmpBasementChatEmbedNavigate("/embed/workflows", false);
}

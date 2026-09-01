import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEmbedAuthHandoff, setEmbedAccessToken } from "@/lib/embed-access-token";
import { postChatEmbedLoadError } from "@/lib/embed-parent-bridge";
import {
  postSmpBasementChatEmbedLeaveEditor,
  postSmpBasementChatEmbedNavigate,
} from "@/pages/chat/workflow/workflow-embed-bridge";

describe("embed workflow parent bridge", () => {
  afterEach(() => {
    clearEmbedAuthHandoff();
    vi.restoreAllMocks();
  });

  it("notifies the parent to open an editor path in fullscreen", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postSmpBasementChatEmbedNavigate("/embed/workflows/1", true);

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        fullscreen: true,
        path: "/embed/workflows/1",
        type: "navigate",
      },
      "*",
    );
  });

  it("does not send the access token to the parent", () => {
    setEmbedAccessToken("handoff-token");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postSmpBasementChatEmbedNavigate("/embed/workflows/1", true);

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        fullscreen: true,
        path: "/embed/workflows/1",
        type: "navigate",
      },
      "*",
    );
  });

  it("notifies the parent to return to the list without fullscreen", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postSmpBasementChatEmbedLeaveEditor();

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        fullscreen: false,
        path: "/embed/workflows",
        type: "navigate",
      },
      "*",
    );
  });

  it("notifies the parent about a terminal load error without auth details", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postChatEmbedLoadError("EMBED_SSO_UNAVAILABLE");

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        code: "EMBED_SSO_UNAVAILABLE",
        type: "load-error",
      },
      "*",
    );
  });
});

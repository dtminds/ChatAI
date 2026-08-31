import { afterEach, describe, expect, it, vi } from "vitest";
import { clearEmbedAuthHandoff, setEmbedAccessToken } from "@/lib/embed-access-token";
import {
  postSmpBasementChatEmbedLeaveEditor,
  postSmpBasementChatEmbedNavigate,
  readSmpBasementChatEmbedToken,
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

  it("includes the current access token when notifying the parent", () => {
    setEmbedAccessToken("handoff-token");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postSmpBasementChatEmbedNavigate("/embed/workflows/1", true);

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        fullscreen: true,
        path: "/embed/workflows/1",
        token: "handoff-token",
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

  it("returns the list path with the current access token", () => {
    setEmbedAccessToken("handoff-token");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    postSmpBasementChatEmbedLeaveEditor();

    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: "smp-basement-chat-embed",
        fullscreen: false,
        path: "/embed/workflows",
        token: "handoff-token",
        type: "navigate",
      },
      "*",
    );
  });

  it("reads a token from a parent embed message", () => {
    expect(readSmpBasementChatEmbedToken({
      channel: "smp-basement-chat-embed",
      token: " parent-token ",
    })).toBe("parent-token");
    expect(readSmpBasementChatEmbedToken({
      channel: "other",
      token: "parent-token",
    })).toBeNull();
  });
});

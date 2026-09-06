import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findViewportAnchor,
  highlightViewportAnchor,
  MESSAGE_LOCATE_HIGHLIGHT_ATTR,
  MESSAGE_SCROLL_ANCHOR_ATTR,
  scrollToAndHighlightViewportAnchor,
} from "@/pages/chat/lib/scroll-anchor";

function createAnchoredViewport(anchorId: string) {
  const viewport = document.createElement("div");
  const anchor = document.createElement("div");
  anchor.setAttribute(MESSAGE_SCROLL_ANCHOR_ATTR, anchorId);
  viewport.append(anchor);
  document.body.append(viewport);
  return { anchor, viewport };
}

describe("scroll-anchor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("finds the viewport anchor by its scroll id", () => {
    const { anchor, viewport } = createAnchoredViewport("3");
    const other = document.createElement("div");
    other.setAttribute(MESSAGE_SCROLL_ANCHOR_ATTR, "4");
    viewport.append(other);

    expect(findViewportAnchor(viewport, "3")).toBe(anchor);
    expect(findViewportAnchor(viewport, "missing")).toBeNull();
  });

  it("highlights a located anchor after scrolling it into view", () => {
    const { anchor, viewport } = createAnchoredViewport("3");
    const scrollIntoView = vi.fn(() => {
      viewport.dispatchEvent(new Event("scroll"));
    });
    Object.defineProperty(anchor, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    scrollToAndHighlightViewportAnchor(viewport, anchor, {
      behavior: "smooth",
      block: "center",
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(anchor).not.toHaveAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR);

    vi.advanceTimersByTime(120);

    expect(anchor).toHaveAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR, "true");
  });

  it("restarts highlight when the same anchor is located again", () => {
    const { anchor } = createAnchoredViewport("3");

    highlightViewportAnchor(anchor);
    expect(anchor).toHaveAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR, "true");

    highlightViewportAnchor(anchor);
    expect(anchor).toHaveAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR, "true");

    vi.advanceTimersByTime(800);
    expect(anchor).not.toHaveAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR);
  });
});

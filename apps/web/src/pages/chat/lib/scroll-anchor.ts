export const MESSAGE_SCROLL_ANCHOR_ATTR = "data-scroll-anchor";
export const MESSAGE_LOCATE_HIGHLIGHT_ATTR = "data-message-locate-highlight";

const MESSAGE_LOCATE_HIGHLIGHT_DURATION_MS = 800;
const MESSAGE_SCROLL_SETTLE_DELAY_MS = 120;
const MESSAGE_SCROLL_MAX_WAIT_MS = 2_000;
const locateHighlightTimers = new WeakMap<HTMLElement, number>();
const pendingScrollHighlightCleanups = new WeakMap<HTMLDivElement, () => void>();

export function captureViewportAnchor(viewport: HTMLDivElement) {
  const viewportTop = viewport.getBoundingClientRect().top;
  const anchors = viewport.querySelectorAll<HTMLElement>(
    `[${MESSAGE_SCROLL_ANCHOR_ATTR}]`,
  );

  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    const id = anchor.getAttribute(MESSAGE_SCROLL_ANCHOR_ATTR);

    if (!id) {
      continue;
    }

    if (rect.bottom > viewportTop + 1) {
      return {
        id,
        offsetTop: rect.top - viewportTop,
      };
    }
  }

  return null;
}

export function findViewportAnchor(viewport: HTMLDivElement, anchorId: string) {
  const anchors = viewport.querySelectorAll<HTMLElement>(
    `[${MESSAGE_SCROLL_ANCHOR_ATTR}]`,
  );

  for (const anchor of anchors) {
    if (anchor.getAttribute(MESSAGE_SCROLL_ANCHOR_ATTR) === anchorId) {
      return anchor;
    }
  }

  return null;
}

export function highlightViewportAnchor(anchor: HTMLElement) {
  const previousTimer = locateHighlightTimers.get(anchor);

  if (previousTimer != null) {
    window.clearTimeout(previousTimer);
  }

  anchor.removeAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR);
  void anchor.offsetWidth;
  anchor.setAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR, "true");

  const timer = window.setTimeout(() => {
    anchor.removeAttribute(MESSAGE_LOCATE_HIGHLIGHT_ATTR);
    locateHighlightTimers.delete(anchor);
  }, MESSAGE_LOCATE_HIGHLIGHT_DURATION_MS);

  locateHighlightTimers.set(anchor, timer);
}

export function scrollToAndHighlightViewportAnchor(
  viewport: HTMLDivElement,
  anchor: HTMLElement,
  options: ScrollIntoViewOptions,
) {
  pendingScrollHighlightCleanups.get(viewport)?.();

  let settleTimer: number | undefined;
  let noScrollTimer: number | undefined;
  let maxWaitTimer: number | undefined;
  let isDisposed = false;

  const dispose = () => {
    if (isDisposed) {
      return;
    }

    isDisposed = true;
    viewport.removeEventListener("scroll", handleScroll);
    if (settleTimer != null) {
      window.clearTimeout(settleTimer);
    }
    if (noScrollTimer != null) {
      window.clearTimeout(noScrollTimer);
    }
    if (maxWaitTimer != null) {
      window.clearTimeout(maxWaitTimer);
    }
    pendingScrollHighlightCleanups.delete(viewport);
  };
  const finish = () => {
    dispose();
    if (anchor.isConnected) {
      highlightViewportAnchor(anchor);
    }
  };
  const handleScroll = () => {
    if (noScrollTimer != null) {
      window.clearTimeout(noScrollTimer);
      noScrollTimer = undefined;
    }
    if (settleTimer != null) {
      window.clearTimeout(settleTimer);
    }
    settleTimer = window.setTimeout(finish, MESSAGE_SCROLL_SETTLE_DELAY_MS);
  };

  viewport.addEventListener("scroll", handleScroll, { passive: true });
  pendingScrollHighlightCleanups.set(viewport, dispose);
  noScrollTimer = window.setTimeout(finish, MESSAGE_SCROLL_SETTLE_DELAY_MS);
  maxWaitTimer = window.setTimeout(finish, MESSAGE_SCROLL_MAX_WAIT_MS);

  anchor.scrollIntoView(options);
}

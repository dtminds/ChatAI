export const MESSAGE_SCROLL_ANCHOR_ATTR = "data-scroll-anchor";

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

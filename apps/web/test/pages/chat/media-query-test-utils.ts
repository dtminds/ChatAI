import { vi } from "vitest";

let originalMatchMedia: typeof window.matchMedia | undefined;

export function mockViewportMediaQuery({
  width,
}: {
  width: number;
}) {
  originalMatchMedia ??= window.matchMedia;
  window.matchMedia = vi.fn((query: string) => {
    const maxWidthMatch = /max-width:\s*(\d+)px/.exec(query);
    const minWidthMatch = /min-width:\s*(\d+)px/.exec(query);
    const isWidthQuery = Boolean(maxWidthMatch || minWidthMatch);
    const matchesMaxWidth = maxWidthMatch
      ? width <= Number(maxWidthMatch[1])
      : true;
    const matchesMinWidth = minWidthMatch
      ? width >= Number(minWidthMatch[1])
      : true;

    return {
      matches: isWidthQuery && matchesMaxWidth && matchesMinWidth,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

export function restoreViewportMediaQuery() {
  if (!originalMatchMedia) {
    return;
  }

  window.matchMedia = originalMatchMedia;
  originalMatchMedia = undefined;
}

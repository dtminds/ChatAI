import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";

let latestResizeObserver:
  | {
      callback: ResizeObserverCallback;
      disconnect: ReturnType<typeof vi.fn>;
      observe: ReturnType<typeof vi.fn>;
      unobserve: ReturnType<typeof vi.fn>;
    }
  | undefined;

function defineScrollMetric(
  element: HTMLElement,
  key: "clientHeight" | "scrollHeight",
  value: number,
) {
  Object.defineProperty(element, key, {
    configurable: true,
    get: () => value,
  });
}

function createResizeObserverEntry(target: Element): ResizeObserverEntry {
  return { target } as unknown as ResizeObserverEntry;
}

function ScrollRestorationHarness({
  activeConversationId,
  messageCount,
}: {
  activeConversationId: string;
  messageCount: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { handleMessageViewportScroll } = useMessageScrollRestoration({
    activeConversationId,
    activeHistoryStatus: "idle",
    hasMoreHistory: false,
    isHistoryLoading: false,
    loadOlderMessages: async () => undefined,
    messageCount,
    messageListBottomRef: bottomRef,
    messageViewportRef: viewportRef,
  });

  return (
    <div
      ref={viewportRef}
      data-testid="viewport"
      onScroll={handleMessageViewportScroll}
    >
      <div data-testid="content">
        <div ref={bottomRef} data-testid="bottom" />
      </div>
    </div>
  );
}

describe("useMessageScrollRestoration", () => {
  it("keeps the viewport pinned to the bottom while message content settles", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const { getByTestId } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");
    const content = getByTestId("content");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    await act(async () => {
      latestResizeObserver?.callback(
        [createResizeObserverEntry(content)],
        latestResizeObserver as unknown as ResizeObserver,
      );
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(400);
  });

  it("does not pull the viewport back down after the user scrolls upward", async () => {
    const { getByTestId } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");
    const content = getByTestId("content");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    await act(async () => {
      viewport.scrollTop = 120;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      latestResizeObserver?.callback(
        [createResizeObserverEntry(content)],
        latestResizeObserver as unknown as ResizeObserver,
      );
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
    });

    expect(viewport.scrollTop).toBe(120);
  });
});

class ResizeObserverTestDouble {
  callback: ResizeObserverCallback;
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    latestResizeObserver = this;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  configurable: true,
  value: ResizeObserverTestDouble,
});

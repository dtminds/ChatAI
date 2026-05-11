import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessageScrollRestoration } from "@/pages/chat/hooks/use-message-scroll-restoration";

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

function ScrollRestorationHarness({
  activeConversationId,
  isConversationLoading = false,
  messageCount,
}: {
  activeConversationId: string;
  isConversationLoading?: boolean;
  messageCount: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { handleMessageViewportScroll, isConversationSettling } =
    useMessageScrollRestoration({
    activeConversationId,
    activeHistoryStatus: "idle",
    hasMoreHistory: false,
    isConversationLoading,
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
      <div data-testid="settling-state">
        {isConversationSettling ? "settling" : "ready"}
      </div>
      <div data-testid="content">
        <div ref={bottomRef} data-testid="bottom" />
      </div>
    </div>
  );
}

describe("useMessageScrollRestoration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for conversation content to settle before scrolling to the bottom once", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        isConversationLoading
        messageCount={0}
      />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    expect(getByTestId("settling-state")).toHaveTextContent("settling");

    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />);

    expect(getByTestId("settling-state")).toHaveTextContent("settling");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(999);
    });

    expect(getByTestId("settling-state")).toHaveTextContent("settling");
    expect(viewport.scrollTop).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(getByTestId("settling-state")).toHaveTextContent("ready");
    expect(scrollIntoView).toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(400);
  });

  it("clears stale settling timers when switching conversations", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        isConversationLoading
        messageCount={0}
      />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    rerender(
      <ScrollRestorationHarness
        activeConversationId="conv-b"
        isConversationLoading
        messageCount={0}
      />,
    );
    rerender(<ScrollRestorationHarness activeConversationId="conv-b" messageCount={2} />);
    defineScrollMetric(viewport, "scrollHeight", 600);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(getByTestId("settling-state")).toHaveTextContent("settling");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(viewport.scrollTop).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(getByTestId("settling-state")).toHaveTextContent("ready");
    expect(viewport.scrollTop).toBe(600);
  });

  it("does not hide the current conversation again when later messages arrive", async () => {
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, "scrollIntoView");
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        isConversationLoading
        messageCount={0}
      />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    defineScrollMetric(viewport, "scrollHeight", 520);
    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={3} />);

    expect(getByTestId("settling-state")).toHaveTextContent("ready");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(viewport.scrollTop).toBe(520);
  });

  it("does not pull the viewport back down after the user scrolls upward", async () => {
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        isConversationLoading
        messageCount={0}
      />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);

    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    await act(async () => {
      viewport.scrollTop = 120;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
      vi.advanceTimersByTime(1000);
    });

    expect(viewport.scrollTop).toBe(120);
  });
});

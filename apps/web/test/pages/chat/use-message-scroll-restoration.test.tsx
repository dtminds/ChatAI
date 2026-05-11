import { act, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
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
  hasMoreHistory = false,
  loadOlderMessages = async () => undefined,
  messageCount,
  children,
}: {
  activeConversationId: string;
  hasMoreHistory?: boolean;
  loadOlderMessages?: () => Promise<void>;
  messageCount: number;
  children?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const { handleMessageViewportScroll } = useMessageScrollRestoration({
    activeConversationId,
    activeHistoryStatus: "idle",
    hasMoreHistory,
    isHistoryLoading: false,
    loadOlderMessages,
    messageCount,
    messageViewportRef: viewportRef,
  });

  return (
    <div
      ref={viewportRef}
      data-testid="viewport"
      onScroll={handleMessageViewportScroll}
    >
      <div data-testid="content">{children}</div>
    </div>
  );
}

describe("useMessageScrollRestoration", () => {
  it("keeps the reverse list pinned to the visual bottom at scrollTop zero", () => {
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = -180;

    rerender(<ScrollRestorationHarness activeConversationId="conv-b" messageCount={2} />);

    expect(viewport.scrollTop).toBe(0);
  });

  it("does not move the reverse viewport when media above the visual bottom changes height", () => {
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    expect(viewport.scrollTop).toBe(0);

    defineScrollMetric(viewport, "scrollHeight", 640);
    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />);

    expect(viewport.scrollTop).toBe(0);
  });

  it("does not pull the reverse viewport back down after the user scrolls upward", () => {
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = -120;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));

    defineScrollMetric(viewport, "scrollHeight", 520);
    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={3} />);

    expect(viewport.scrollTop).toBe(-120);
  });

  it("keeps the user-scrolled reverse viewport position across later messages", () => {
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness activeConversationId="conv-a" messageCount={2} />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = -120;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));

    defineScrollMetric(viewport, "scrollHeight", 520);
    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={3} />);

    defineScrollMetric(viewport, "scrollHeight", 640);
    rerender(<ScrollRestorationHarness activeConversationId="conv-a" messageCount={4} />);

    expect(viewport.scrollTop).toBe(-120);
  });

  it("keeps the reverse viewport offset when older messages are restored without a matched anchor", async () => {
    let resolveLoadOlderMessages: (() => void) | undefined;
    const loadOlderMessages = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoadOlderMessages = resolve;
        }),
    );
    const { getByTestId, rerender } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        hasMoreHistory
        loadOlderMessages={loadOlderMessages}
        messageCount={2}
      >
        <div data-scroll-anchor="msg-existing">Existing</div>
      </ScrollRestorationHarness>,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = -298;

    await act(async () => {
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    defineScrollMetric(viewport, "scrollHeight", 520);
    rerender(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        hasMoreHistory
        loadOlderMessages={loadOlderMessages}
        messageCount={4}
      />,
    );

    expect(viewport.scrollTop).toBe(-298);

    await act(async () => {
      resolveLoadOlderMessages?.();
    });
  });

  it("loads older messages near the visual top of the reverse list", async () => {
    const loadOlderMessages = vi.fn(async () => undefined);
    const { getByTestId } = render(
      <ScrollRestorationHarness
        activeConversationId="conv-a"
        hasMoreHistory
        loadOlderMessages={loadOlderMessages}
        messageCount={2}
      />,
    );
    const viewport = getByTestId("viewport");

    defineScrollMetric(viewport, "clientHeight", 100);
    defineScrollMetric(viewport, "scrollHeight", 400);
    viewport.scrollTop = -298;

    await act(async () => {
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
  });
});

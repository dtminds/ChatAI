import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConversationRevealTimer } from "@/pages/chat/hooks/use-conversation-reveal-timer";
import type { Conversation } from "@/pages/chat/chat-types";

function RevealTimerHarness({
  conversations,
}: {
  conversations: Conversation[];
}) {
  useConversationRevealTimer(conversations);

  return null;
}

function createConversation(id: string, createdAtMs: number): Conversation {
  return {
    accountId: "account-1",
    createdAtMs,
    customerAvatarUrl: "",
    customerId: `customer-${id}`,
    customerName: id,
    id,
    isVerified: false,
    mode: "single",
    preview: "",
    priority: "medium",
    quietFor: "",
    unread: 0,
    updatedAt: "",
    updatedAtMs: createdAtMs,
  };
}

describe("useConversationRevealTimer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not reset the timer when polling refreshes conversations with the same reveal target", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T08:00:00.000Z"));
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    const createdAtMs = Date.now() - 60_000;
    const firstConversations = [createConversation("pending", createdAtMs)];
    const refreshedConversations = [createConversation("pending", createdAtMs)];
    const { rerender } = render(
      <RevealTimerHarness conversations={firstConversations} />,
    );

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    rerender(<RevealTimerHarness conversations={refreshedConversations} />);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });

  it("re-renders when the next reveal target expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T08:00:00.000Z"));
    const createdAtMs = Date.now() - 179_000;
    const { container } = render(
      <RevealTimerHarness conversations={[createConversation("pending", createdAtMs)]} />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(container).toBeEmptyDOMElement();
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConversationTicketReminder } from "@/pages/chat/tickets/use-conversation-ticket-reminder";

const api = vi.hoisted(() => ({
  getConversationTicketActiveCount: vi.fn(),
}));

vi.mock("@/pages/chat/tickets/api/tickets-service", () => api);

describe("useConversationTicketReminder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.getConversationTicketActiveCount
      .mockReset()
      .mockResolvedValue({ activeCount: 2 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits six seconds and cancels the previous conversation request", async () => {
    const { result, rerender } = renderHook(
      ({ conversationId }) => useConversationTicketReminder({
        conversationId,
        enabled: true,
        isPanelOpen: false,
      }),
      { initialProps: { conversationId: "301" } },
    );

    await act(() => vi.advanceTimersByTimeAsync(5_999));
    expect(api.getConversationTicketActiveCount).not.toHaveBeenCalled();

    rerender({ conversationId: "302" });
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(api.getConversationTicketActiveCount).toHaveBeenCalledTimes(1);
    expect(api.getConversationTicketActiveCount).toHaveBeenCalledWith("302");
    expect(result.current).toBe(2);
  });

  it("hides the reminder while open and refreshes immediately after the panel closes", async () => {
    const { result, rerender } = renderHook(
      ({ isPanelOpen }) => useConversationTicketReminder({
        conversationId: "301",
        enabled: true,
        isPanelOpen,
      }),
      { initialProps: { isPanelOpen: false } },
    );

    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(result.current).toBe(2);

    rerender({ isPanelOpen: true });
    expect(result.current).toBeUndefined();

    api.getConversationTicketActiveCount.mockResolvedValueOnce({ activeCount: 4 });
    await act(async () => {
      rerender({ isPanelOpen: false });
      await Promise.resolve();
    });

    expect(api.getConversationTicketActiveCount).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(4);
  });

  it("cancels the delayed request when the panel opens", async () => {
    const { rerender } = renderHook(
      ({ isPanelOpen }) => useConversationTicketReminder({
        conversationId: "301",
        enabled: true,
        isPanelOpen,
      }),
      { initialProps: { isPanelOpen: false } },
    );

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    rerender({ isPanelOpen: true });
    await act(() => vi.advanceTimersByTimeAsync(6_000));

    expect(api.getConversationTicketActiveCount).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ isPanelOpen: false });
      await Promise.resolve();
    });

    expect(api.getConversationTicketActiveCount).toHaveBeenCalledTimes(1);
    expect(api.getConversationTicketActiveCount).toHaveBeenCalledWith("301");
  });

  it("does not schedule a request when reminders are hidden", async () => {
    renderHook(() => useConversationTicketReminder({
      conversationId: "301",
      enabled: false,
      isPanelOpen: false,
    }));

    await act(() => vi.advanceTimersByTimeAsync(12_000));
    expect(api.getConversationTicketActiveCount).not.toHaveBeenCalled();
  });

  it("keeps the delay when switching away from an open panel", async () => {
    const { rerender } = renderHook(
      ({ conversationId, isPanelOpen }) => useConversationTicketReminder({
        conversationId,
        enabled: true,
        isPanelOpen,
      }),
      {
        initialProps: {
          conversationId: "301",
          isPanelOpen: true,
        },
      },
    );

    rerender({ conversationId: "302", isPanelOpen: true });
    rerender({ conversationId: "302", isPanelOpen: false });
    await act(() => vi.advanceTimersByTimeAsync(5_999));
    expect(api.getConversationTicketActiveCount).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.getConversationTicketActiveCount).toHaveBeenCalledWith("302");
  });
});

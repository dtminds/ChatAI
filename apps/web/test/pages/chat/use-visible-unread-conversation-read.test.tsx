import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVisibleUnreadConversationRead } from "@/pages/chat/hooks/use-visible-unread-conversation-read";

describe("useVisibleUnreadConversationRead", () => {
  it("honors a forced read request while unread state is stale", async () => {
    const markConversationRead = vi.fn().mockResolvedValue(undefined);
    const messageViewportRef = { current: null };

    const { result } = renderHook(() =>
      useVisibleUnreadConversationRead({
        activeConversationId: "conv-001",
        activeMessages: [],
        activeView: "chat",
        canUseConversationActions: true,
        isConversationLoading: true,
        markConversationRead,
        messageViewportRef,
        unreadCount: 0,
      }),
    );

    await result.current({ force: true });

    expect(markConversationRead).toHaveBeenCalledWith("conv-001");
  });
});

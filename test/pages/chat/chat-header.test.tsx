import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHeader } from "@/pages/chat/components/chat-header";

describe("ChatHeader", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
  });

  it("toggles dark mode from the header action", async () => {
    const user = userEvent.setup();

    render(
      <ChatHeader
        activeClaimStatus="idle"
        activeMessageSeq={12}
        isClaimedByCurrentUser={false}
        isClaimedByOther={false}
        onClaimConversation={vi.fn()}
      />,
    );

    const themeButton = screen.getByRole("button", { name: "切换深色模式" });

    await user.click(themeButton);
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("dark");

    await user.click(screen.getByRole("button", { name: "切换浅色模式" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("light");
  });

  it("restores the saved dark mode preference", () => {
    window.localStorage.setItem("chat-ai-theme", "dark");

    render(
      <ChatHeader
        activeClaimStatus="idle"
        activeMessageSeq={12}
        isClaimedByCurrentUser={false}
        isClaimedByOther={false}
        onClaimConversation={vi.fn()}
      />,
    );

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "切换浅色模式" })).toBeInTheDocument();
  });
});

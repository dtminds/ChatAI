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
        activeMessageSeq={12}
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
        activeMessageSeq={12}
      />,
    );

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "切换浅色模式" })).toBeInTheDocument();
  });

  it("still toggles the theme when localStorage is unavailable", async () => {
    const user = userEvent.setup();
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(
      <ChatHeader
        activeMessageSeq={12}
      />,
    );

    await user.click(screen.getByRole("button", { name: "切换深色模式" }));

    expect(document.documentElement).toHaveClass("dark");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});

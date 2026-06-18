import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHeader } from "@/pages/chat/components/chat-header";
import type { Conversation } from "@/pages/chat/chat-types";

const conversation: Conversation = {
  accountId: "account-1",
  custodyMode: "semi",
  customerAvatarUrl: "https://example.com/customer.png",
  customerId: "customer-1",
  customerName: "测试客户",
  id: "conversation-1",
  mode: "single",
  preview: "请帮我看一下",
  priority: "medium",
  quietFor: "22天没聊了",
  unread: 3,
  updatedAt: "2026-05-07 09:00:00",
};

describe("ChatHeader", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    window.localStorage.clear();
    setSystemColorScheme(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects a persisted light or dark theme from the segmented control", async () => {
    const user = userEvent.setup();

    render(
      <ChatHeader />,
    );

    await user.click(screen.getByRole("radio", { name: "深色模式" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "浅色模式" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("light");
  });

  it("follows the system color scheme option", async () => {
    const user = userEvent.setup();
    const mediaQuery = setSystemColorScheme(true);
    window.localStorage.setItem("chat-ai-theme", "light");

    render(<ChatHeader />);

    await user.click(screen.getByRole("radio", { name: "跟随系统" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("chat-ai-theme")).toBe("system");

    mediaQuery.setMatches(false);
    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });

  it("does not show internal sync cursor details in the header", () => {
    render(
      <ChatHeader
        activeConversation={conversation}
      />,
    );

    expect(screen.getByText(conversation.customerName)).toBeInTheDocument();
    expect(screen.queryByText(/消息游标/)).not.toBeInTheDocument();
    expect(screen.queryByText(/22天没聊了/)).not.toBeInTheDocument();
  });

  it("renders the original conversation name as secondary text", () => {
    render(
      <ChatHeader
        activeConversation={{
          ...conversation,
          contactOriginalName: "微信昵称：客户原始昵称",
          customerName: "客户备注",
        }}
      />,
    );

    expect(screen.getByText("客户备注")).toBeInTheDocument();
    expect(screen.getByText("微信昵称：客户原始昵称")).toBeInTheDocument();
  });

  it("does not read browser storage or media queries while rendering", () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    const matchMediaSpy = vi.spyOn(window, "matchMedia");

    renderToString(
      <ChatHeader />,
    );

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });

  it("restores the saved system mode preference", async () => {
    window.localStorage.setItem("chat-ai-theme", "system");
    setSystemColorScheme(true);

    render(
      <ChatHeader />,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
      expect(screen.getByRole("radio", { name: "跟随系统" })).toHaveAttribute(
        "data-state",
        "on",
      );
    });
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
      <ChatHeader />,
    );

    await user.click(screen.getByRole("radio", { name: "深色模式" }));

    expect(document.documentElement).toHaveClass("dark");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it("opens a confirmation dialog before enabling smart reply auto generation", async () => {
    const user = userEvent.setup();

    render(<ChatHeader activeConversation={conversation} />);

    expect(screen.getByRole("switch", { name: "话术自动生成" })).not.toBeChecked();

    await user.click(screen.getByRole("switch", { name: "话术自动生成" }));

    const dialog = screen.getByRole("dialog", { name: "是否确认开启话术自动生成？" });

    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("确认开启后，所有活跃会话都会自动生成推荐话术");
    expect(dialog).toHaveTextContent("（AI全自动托管状态下不会自动生成）");

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog", { name: "是否确认开启话术自动生成？" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "话术自动生成" })).not.toBeChecked();
  });

  it("enables smart reply auto generation after confirmation", async () => {
    const user = userEvent.setup();

    render(<ChatHeader activeConversation={conversation} />);

    await user.click(screen.getByRole("switch", { name: "话术自动生成" }));
    await user.click(screen.getByRole("button", { name: "确认开启" }));

    expect(screen.queryByRole("dialog", { name: "是否确认开启话术自动生成？" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "话术自动生成" })).toBeChecked();
  });

  it("turns off smart reply auto generation without a confirmation dialog", async () => {
    const user = userEvent.setup();

    render(<ChatHeader activeConversation={conversation} />);

    await user.click(screen.getByRole("switch", { name: "话术自动生成" }));
    await user.click(screen.getByRole("button", { name: "确认开启" }));
    await user.click(screen.getByRole("switch", { name: "话术自动生成" }));

    expect(screen.queryByRole("dialog", { name: "是否确认开启话术自动生成？" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "话术自动生成" })).not.toBeChecked();
  });
});

function setSystemColorScheme(matches: boolean) {
  let currentMatches = matches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() {
      return currentMatches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.add(listener);
      }
    }),
    removeEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
      if (event === "change") {
        listeners.delete(listener);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches;
      listeners.forEach((listener) => {
        listener({ matches: nextMatches } as MediaQueryListEvent);
      });
    },
  };

  window.matchMedia = vi.fn().mockReturnValue(mediaQuery);

  return mediaQuery;
}

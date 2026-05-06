import { useLayoutEffect, useState } from "react";
import {
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/pages/chat/chat-types";

const THEME_STORAGE_KEY = "chat-ai-theme";
type ThemePreference = "dark" | "light";

type ChatHeaderProps = {
  activeConversation?: Conversation;
  activeMessageSeq: number;
};

export function ChatHeader({
  activeConversation,
  activeMessageSeq,
}: ChatHeaderProps) {
  const [isDarkMode, setIsDarkMode] = useState(getInitialThemePreference);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  const handleThemeToggle = () => {
    const shouldUseDarkMode = !isDarkMode;

    writeThemePreference(shouldUseDarkMode ? "dark" : "light");
    setIsDarkMode(shouldUseDarkMode);
  };

  return (
    <div className="flex min-h-[69px] items-center border-b border-divider px-5 py-3">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[17px] font-semibold text-foreground">
              {activeConversation?.customerName ?? "请选择会话"}
            </p>
            <span className="text-sm font-medium text-success">
              @微信
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            消息游标 {activeMessageSeq} · {activeConversation?.quietFor ?? "实时同步"}
          </p>
        </div>

        <Button
          aria-label={isDarkMode ? "切换浅色模式" : "切换深色模式"}
          className="size-9 rounded-lg p-0 shadow-none"
          onClick={handleThemeToggle}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={isDarkMode ? Sun02Icon : Moon02Icon}
            size={16}
            strokeWidth={1.8}
          />
        </Button>
      </div>
    </div>
  );
}

function getInitialThemePreference() {
  const savedTheme = readThemePreference();

  return savedTheme === "dark" ||
    (savedTheme !== "light" && document.documentElement.classList.contains("dark"));
}

function readThemePreference(): ThemePreference | undefined {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    return savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : undefined;
  } catch {
    return undefined;
  }
}

function writeThemePreference(theme: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates without storage.
  }
}

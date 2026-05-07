import { useLayoutEffect, useState } from "react";
import {
  ComputerIcon,
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import type { Conversation } from "@/pages/chat/chat-types";

const THEME_STORAGE_KEY = "chat-ai-theme";
const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";
type ThemePreference = "dark" | "light" | "system";

type ChatHeaderProps = {
  activeConversation?: Conversation;
};

export function ChatHeader({ activeConversation }: ChatHeaderProps) {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [isSystemDarkMode, setIsSystemDarkMode] = useState(false);
  const isDarkMode =
    themePreference === "dark" ||
    (themePreference === "system" && isSystemDarkMode);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
  }, [isDarkMode]);

  useLayoutEffect(() => {
    setThemePreference(getInitialThemePreference());

    const mediaQuery = getDarkModeMediaQuery();
    if (!mediaQuery) {
      return;
    }
    setIsSystemDarkMode(mediaQuery.matches);

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setIsSystemDarkMode(event.matches);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const handleThemePreferenceChange = (nextThemePreference: string) => {
    if (!isThemePreference(nextThemePreference)) {
      return;
    }

    writeThemePreference(nextThemePreference);
    setThemePreference(nextThemePreference);
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
        </div>

        <SegmentedControl
          aria-label="选择主题模式"
          onValueChange={handleThemePreferenceChange}
          type="single"
          value={themePreference}
        >
          <SegmentedControlItem aria-label="浅色模式" value="light">
            <HugeiconsIcon
              color="currentColor"
              icon={Sun02Icon}
              size={16}
              strokeWidth={1.8}
            />
          </SegmentedControlItem>
          <SegmentedControlItem aria-label="跟随系统" value="system">
            <HugeiconsIcon
              color="currentColor"
              icon={ComputerIcon}
              size={16}
              strokeWidth={1.8}
            />
          </SegmentedControlItem>
          <SegmentedControlItem aria-label="深色模式" value="dark">
            <HugeiconsIcon
              color="currentColor"
              icon={Moon02Icon}
              size={16}
              strokeWidth={1.8}
            />
          </SegmentedControlItem>
        </SegmentedControl>
      </div>
    </div>
  );
}

function getInitialThemePreference(): ThemePreference {
  return readThemePreference() ?? "system";
}

function getDarkModeMediaQuery() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_MODE_QUERY)
    : undefined;
}

function readThemePreference(): ThemePreference | undefined {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isThemePreference(savedTheme)
      ? savedTheme
      : undefined;
  } catch {
    return undefined;
  }
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function writeThemePreference(theme: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates without storage.
  }
}

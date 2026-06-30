import { useLayoutEffect, useState } from "react";
import {
  ModernTvIcon,
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import {
  applyThemePreference,
  getDarkModeMediaQuery,
  getInitialThemePreference,
  isThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";
import type { Conversation } from "@/pages/chat/chat-types";

type ChatHeaderProps = {
  activeConversation?: Conversation;
};

export function ChatHeader({ activeConversation }: ChatHeaderProps) {
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [isSystemDarkMode, setIsSystemDarkMode] = useState(false);

  useLayoutEffect(() => {
    applyThemePreference(themePreference, isSystemDarkMode);
  }, [isSystemDarkMode, themePreference]);

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
          </div>
          {activeConversation?.groupOriginalName || activeConversation?.contactOriginalName ? (
            <p className="truncate text-[12px] text-muted-foreground">
              {activeConversation?.groupOriginalName ?? activeConversation?.contactOriginalName}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center">
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
            <SegmentedControlItem aria-label="深色模式" value="dark">
              <HugeiconsIcon
                color="currentColor"
                icon={Moon02Icon}
                size={16}
                strokeWidth={1.8}
              />
            </SegmentedControlItem>
            <SegmentedControlItem aria-label="跟随系统" value="system">
              <HugeiconsIcon
                color="currentColor"
                icon={ModernTvIcon}
                size={16}
                strokeWidth={1.8}
              />
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>
    </div>
  );
}

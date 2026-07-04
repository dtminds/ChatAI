import { useLayoutEffect, useState } from "react";
import {
  ArrowLeft01Icon,
  ModernTvIcon,
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
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
import { NewMessageSoundControl } from "@/pages/chat/components/new-message-sound-control";
import type { Conversation } from "@/pages/chat/chat-types";

type ChatHeaderProps = {
  activeConversation?: Conversation;
  onBack?: () => void;
};

export function ChatHeader({ activeConversation, onBack }: ChatHeaderProps) {
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
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <Button
              aria-label="返回会话列表"
              className="size-9 shrink-0 rounded-[10px] p-0 shadow-none"
              onClick={onBack}
              size="icon"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                aria-hidden="true"
                color="currentColor"
                icon={ArrowLeft01Icon}
                size={18}
                strokeWidth={1.8}
              />
            </Button>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[17px] font-semibold text-foreground">
                {activeConversation?.customerName ?? "请选择会话"}
              </p>
            </div>
            {activeConversation?.groupOriginalName ||
            activeConversation?.contactOriginalName ? (
              <p className="truncate text-[12px] text-muted-foreground">
                {activeConversation?.groupOriginalName ??
                  activeConversation?.contactOriginalName}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <NewMessageSoundControl />
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

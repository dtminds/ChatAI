import { useLayoutEffect, useState } from "react";
import {
  ArrowLeft01Icon,
  InformationCircleIcon,
  ModernTvIcon,
  Moon02Icon,
  SidebarRightIcon,
  Sun02Icon,
  TeamWorkIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
  isMobileLayout?: boolean;
  onBack?: () => void;
  onOpenSidebar?: () => void;
};

export function ChatHeader({
  activeConversation,
  isMobileLayout = false,
  onBack,
  onOpenSidebar,
}: ChatHeaderProps) {
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
  const isDarkThemeActive =
    themePreference === "dark" ||
    (themePreference === "system" && isSystemDarkMode);
  const mobileThemeToggleLabel = isDarkThemeActive ? "切换浅色模式" : "切换深色模式";

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
            <div className="flex min-w-0 items-center gap-2">
              <p className="min-w-0 truncate text-[17px] font-semibold text-foreground">
                {activeConversation?.customerName ?? "请选择会话"}
              </p>
              {activeConversation?.mode === "group" &&
              activeConversation.isShadowGroup ? (
                <ReceptionAccountNotice />
              ) : null}
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
          {isMobileLayout ? null : <NewMessageSoundControl />}
          {isMobileLayout ? (
            <>
              <Button
                aria-label={mobileThemeToggleLabel}
                className="size-9 shrink-0 rounded-[10px] p-0 text-muted-foreground shadow-none hover:text-foreground"
                onClick={() => {
                  handleThemePreferenceChange(isDarkThemeActive ? "light" : "dark");
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  color="currentColor"
                  icon={isDarkThemeActive ? Sun02Icon : Moon02Icon}
                  size={16}
                  strokeWidth={1.8}
                />
              </Button>
              {onOpenSidebar ? (
                <Button
                  aria-label="打开侧边栏"
                  className="size-9 shrink-0 rounded-[10px] p-0 text-muted-foreground shadow-none hover:text-foreground"
                  onClick={onOpenSidebar}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    color="currentColor"
                    icon={SidebarRightIcon}
                    size={16}
                    strokeWidth={1.8}
                  />
                </Button>
              ) : null}
            </>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}

function ReceptionAccountNotice() {
  return (
    <HoverCard closeDelay={100} openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          aria-label="查看接待号注意事项"
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning outline-none transition-colors hover:bg-warning/15 focus-visible:ring-4 focus-visible:ring-ring/20"
          type="button"
        >
          <HugeiconsIcon
            aria-hidden="true"
            color="currentColor"
            icon={TeamWorkIcon}
            size={15}
            strokeWidth={1.9}
          />
          <span>接待号</span>
          <HugeiconsIcon
            aria-hidden="true"
            className="text-warning"
            color="currentColor"
            icon={InformationCircleIcon}
            size={14}
            strokeWidth={1.9}
          />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[380px] max-w-[calc(100vw-2rem)] rounded-[8px] p-4"
        side="bottom"
        sideOffset={8}
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">接待号注意事项</p>
          <p className="text-xs leading-5 text-muted-foreground">
            受接口能力限制，接待号区别于开通号，在使用上会有一定约束，在此特殊说明：
          </p>
          <ol className="space-y-2 pl-5 text-xs leading-5 text-foreground">
            <li className="list-decimal">
              接待号无法在工作台撤回已发送的消息，需使用客户端撤回
            </li>
            <li className="list-decimal">
              发送的消息中包含引用或@内容时工作台回显可能异常，但不影响客户侧效果
            </li>
            <li className="list-decimal">
              如因网络抖动等原因导致消息发送失败，不支持一键重发，需手动重发
            </li>
          </ol>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

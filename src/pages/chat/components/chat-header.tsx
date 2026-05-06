import { startTransition, useState } from "react";
import {
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/pages/chat/chat-types";

const THEME_STORAGE_KEY = "chat-ai-theme";

type ChatHeaderProps = {
  activeClaimStatus: "idle" | "claiming";
  activeConversation?: Conversation;
  activeMessageSeq: number;
  isClaimedByCurrentUser: boolean;
  isClaimedByOther: boolean;
  onClaimConversation: () => void | Promise<void>;
};

export function ChatHeader({
  activeClaimStatus,
  activeConversation,
  activeMessageSeq,
  isClaimedByCurrentUser,
  isClaimedByOther,
  onClaimConversation,
}: ChatHeaderProps) {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const shouldUseDarkMode =
      savedTheme === "dark" ||
      (savedTheme !== "light" && document.documentElement.classList.contains("dark"));

    document.documentElement.classList.toggle("dark", shouldUseDarkMode);

    return shouldUseDarkMode;
  });

  const handleThemeToggle = () => {
    const shouldUseDarkMode = !isDarkMode;

    document.documentElement.classList.toggle("dark", shouldUseDarkMode);
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      shouldUseDarkMode ? "dark" : "light",
    );
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

        <div className="flex items-center gap-2">
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
          <div className="hidden items-center gap-2 md:flex">
          <Button
            className="h-9 rounded-lg px-3 text-[13px] shadow-none"
            disabled
            variant="outline"
          >
            查看历史
          </Button>
          <Button
            className="h-9 rounded-lg px-3 text-[13px] shadow-none"
            disabled={
              !activeConversation ||
              isClaimedByCurrentUser ||
              isClaimedByOther ||
              activeClaimStatus === "claiming"
            }
            onClick={() => {
              startTransition(() => {
                void onClaimConversation();
              });
            }}
          >
            {isClaimedByCurrentUser
              ? "已领取"
              : activeClaimStatus === "claiming"
                ? "领取中..."
                : "领取会话"}
          </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

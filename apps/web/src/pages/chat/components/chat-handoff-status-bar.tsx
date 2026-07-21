import {
  Gps02Icon,
  ModernTvIssueIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ChatHandoffStatusBar({
  canMarkHandled,
  isPending,
  onMarkHandled,
  onViewMessage,
}: {
  canMarkHandled: boolean;
  isPending: boolean;
  onMarkHandled: () => void;
  onViewMessage: () => void;
}) {
  return (
    <div
      className="absolute inset-x-3 top-2 z-10 flex min-h-9 items-center justify-between gap-3 rounded-full border border-destructive/25 bg-destructive-muted/70 py-1 pl-3 pr-1.5 shadow-[0_4px_14px_var(--shadow-soft)] backdrop-blur-sm sm:inset-x-4 sm:pl-3.5"
      data-testid="chat-handoff-status-bar"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
        <HugeiconsIcon
          className="shrink-0"
          icon={ModernTvIssueIcon}
          size={15}
          strokeWidth={1.8}
        />
        <span className="shrink-0 font-medium">接管提醒</span>
        <span className="hidden truncate text-destructive/70 md:inline">
          部分消息触发转人工处理
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          aria-label="定位消息"
          className="h-6 rounded-full border-destructive/25 bg-background/75 px-2.5 text-xs text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
          onClick={onViewMessage}
          size="sm"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon icon={Gps02Icon} size={14} strokeWidth={1.8} />
          定位消息
        </Button>
        <Button
          aria-label="标记已处理"
          className="h-6 rounded-full border-destructive/25 bg-background/75 px-2.5 text-xs text-destructive shadow-none hover:bg-destructive/10 hover:text-destructive"
          disabled={!canMarkHandled || isPending}
          onClick={onMarkHandled}
          size="sm"
          type="button"
          variant="outline"
        >
          {isPending ? <Spinner className="size-3.5" /> : null}
          标记已处理
        </Button>
      </div>
    </div>
  );
}

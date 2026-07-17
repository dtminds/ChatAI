import {
  CheckmarkCircle02Icon,
  ViewIcon,
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
      className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-warning/20 bg-warning-muted/55 px-3 py-2 sm:flex-nowrap sm:px-5"
      data-testid="chat-handoff-status-bar"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-warning">
        <HugeiconsIcon
          className="shrink-0"
          icon={CheckmarkCircle02Icon}
          size={17}
          strokeWidth={1.8}
        />
        <span className="font-medium">待人工处理</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          AI 已将会话转交人工处理
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          aria-label="查看触发消息"
          className="h-7 px-2.5"
          onClick={onViewMessage}
          size="sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon icon={ViewIcon} size={15} strokeWidth={1.8} />
          查看消息
        </Button>
        <Button
          aria-label="标记接管提醒已处理"
          className="h-7 px-2.5"
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

import { startTransition, useEffect, useRef, useState } from "react";
import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Account } from "@/pages/chat/chat-types";

export function AccountSidebarItem({
  account,
  currentEmployeeId,
  isActive,
  onClick,
  onTakeOverAccount,
  takeoverStatus,
}: {
  account: Account;
  currentEmployeeId?: string;
  isActive: boolean;
  onClick: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatus: "idle" | "taking-over";
}) {
  const closePopoverTimerRef = useRef<number | null>(null);
  const [isTakeoverPopoverOpen, setIsTakeoverPopoverOpen] = useState(false);
  const isOffline = account.loginStatus === "offline";
  const isTakenOverByCurrentUser =
    !!account.takenOverEmployeeId && account.takenOverEmployeeId === currentEmployeeId;
  const statusLabel = isOffline ? "离线" : isTakenOverByCurrentUser ? "接管中" : "未接管";
  const canTakeOver = !isOffline && !isTakenOverByCurrentUser && takeoverStatus !== "taking-over";
  const shouldShowUnreadBadge = isTakenOverByCurrentUser && !!account.unreadCount;
  const statusBadge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[10px] font-medium leading-none",
        isOffline && "text-muted-foreground",
        !isOffline && isTakenOverByCurrentUser && "text-success",
        !isOffline && !isTakenOverByCurrentUser && "text-warning",
      )}
    >
      <span
        data-testid="account-status-dot"
        className={cn(
          "size-1.5 rounded-full",
          isOffline && "bg-muted-foreground/50",
          !isOffline && isTakenOverByCurrentUser && "bg-success",
          !isOffline && !isTakenOverByCurrentUser && "bg-warning"
        )}
      />
      <span>{takeoverStatus === "taking-over" ? "接管中" : statusLabel}</span>
    </span>
  );
  const clearClosePopoverTimer = () => {
    if (closePopoverTimerRef.current !== null) {
      window.clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
  };
  const openTakeoverPopover = () => {
    clearClosePopoverTimer();
    setIsTakeoverPopoverOpen(true);
  };
  const closeTakeoverPopover = () => {
    clearClosePopoverTimer();
    closePopoverTimerRef.current = window.setTimeout(() => {
      setIsTakeoverPopoverOpen(false);
      closePopoverTimerRef.current = null;
    }, 120);
  };
  const closeTakeoverPopoverImmediately = () => {
    clearClosePopoverTimer();
    setIsTakeoverPopoverOpen(false);
  };
  const handleTakeoverTriggerKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      openTakeoverPopover();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTakeoverPopoverImmediately();
    }
  };

  useEffect(() => clearClosePopoverTimer, []);

  return (
    <div
      className={cn(
        "relative flex w-full items-start gap-2 rounded-[16px] border px-2.5 py-2 text-left transition-colors",
        isActive
          ? "border-border bg-surface"
          : "border-transparent bg-transparent hover:bg-surface-hover",
      )}
      title={account.name}
    >
      <div
        className="relative mt-0.5"
        data-testid={`account-avatar-wrap-${account.id}`}
      >
        <Avatar className="size-10">
          <AvatarImage alt={account.name} src={account.avatarUrl} />
          <AvatarFallback>{account.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        {shouldShowUnreadBadge ? (
          <span
            aria-label={`${account.name} 未读消息 ${account.unreadCount}`}
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {account.unreadCount}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <button
            className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClick}
            type="button"
          >
            {account.name}
          </button>
          {canTakeOver ? (
            <Popover
              onOpenChange={setIsTakeoverPopoverOpen}
              open={isTakeoverPopoverOpen}
            >
              <PopoverTrigger asChild>
                <button
                  aria-label={`${account.name} ${statusLabel}`}
                  className="inline-flex cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  onBlur={closeTakeoverPopover}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={handleTakeoverTriggerKeyDown}
                  onMouseEnter={openTakeoverPopover}
                  onMouseLeave={closeTakeoverPopover}
                  type="button"
                >
                  {statusBadge}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[220px]"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    closeTakeoverPopover();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                onFocus={openTakeoverPopover}
                onEscapeKeyDown={closeTakeoverPopoverImmediately}
                onMouseEnter={openTakeoverPopover}
                onMouseLeave={closeTakeoverPopover}
                side="bottom"
              >
                <p className="text-[12px] leading-5 text-muted-foreground">
                  当前账号未被你接管，你将无法：
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] leading-5 text-muted-foreground">
                  <li>使用该账号发送消息</li>
                  <li>标记消息已读状态</li>
                </ul>
                <Button
                  className="mt-3 h-8 w-full rounded-[10px] text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    startTransition(() => {
                      void onTakeOverAccount?.(account.id);
                    });
                  }}
                  size="sm"
                  type="button"
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={UserCheck01Icon}
                    size={14}
                    strokeWidth={1.8}
                  />
                  <span>接管账号</span>
                </Button>
              </PopoverContent>
            </Popover>
          ) : (
            statusBadge
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            className="min-w-0 flex-1 truncate text-left text-[12px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClick}
            type="button"
          >
            {account.operator}
          </button>
        </div>
      </div>
    </div>
  );
}

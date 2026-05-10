import { startTransition, useEffect, useRef, useState } from "react";
import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Account } from "@/pages/chat/chat-types";

export function AccountSidebarItem({
  account,
  currentEmployeeId,
  isActive,
  onClick,
  onTakeOverAccount,
  takeoverStatus,
  variant = "default",
}: {
  account: Account;
  currentEmployeeId?: string;
  isActive: boolean;
  onClick: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatus: "idle" | "taking-over";
  variant?: "default" | "compact";
}) {
  const closePopoverTimerRef = useRef<number | null>(null);
  const [isTakeoverPopoverOpen, setIsTakeoverPopoverOpen] = useState(false);
  const isOffline = account.loginStatus === "offline";
  const isTakenOverByCurrentUser =
    !!account.takenOverEmployeeId && account.takenOverEmployeeId === currentEmployeeId;
  const statusLabel = isOffline ? "离线" : isTakenOverByCurrentUser ? "接管中" : "未接管";
  const canTakeOver = !isOffline && !isTakenOverByCurrentUser && takeoverStatus !== "taking-over";
  const shouldShowUnreadBadge = isTakenOverByCurrentUser && !!account.unreadCount;
  const compactStatusLabel =
    takeoverStatus === "taking-over"
      ? "接管中"
      : isOffline
        ? "离线"
        : isTakenOverByCurrentUser
          ? "已接管"
          : "未接管";
  const statusBadge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full text-[10px] font-medium leading-none",
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
  const compactStatusBadge = (
    <AvatarBadge
      aria-label={`${account.name} 状态 ${compactStatusLabel}`}
      className={cn(
        "size-2.5",
        isOffline && "bg-muted-foreground/50",
        !isOffline && isTakenOverByCurrentUser && "bg-success",
        !isOffline && !isTakenOverByCurrentUser && "bg-warning",
      )}
      data-testid={`account-compact-status-${account.id}`}
    />
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
  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onClick();
  };

  useEffect(() => clearClosePopoverTimer, []);

  if (variant === "compact") {
    const compactButton = (
      <button
        aria-label={`选择 ${account.name}`}
        className="relative flex size-8 items-center justify-center rounded-[8px] bg-transparent transition-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
        data-testid={`account-sidebar-item-${account.id}`}
        onBlur={closeTakeoverPopover}
        onClick={onClick}
        onFocus={canTakeOver ? openTakeoverPopover : undefined}
        onKeyDown={handleCardKeyDown}
        onMouseEnter={canTakeOver ? openTakeoverPopover : undefined}
        onMouseLeave={canTakeOver ? closeTakeoverPopover : undefined}
        type="button"
      >
        <Avatar className="size-8 rounded-[8px]">
          <AvatarImage alt={account.name} src={account.avatarUrl} />
          <AvatarFallback className="rounded-[8px] bg-primary text-primary-foreground">
            {account.name.slice(0, 1)}
          </AvatarFallback>
          {compactStatusBadge}
        </Avatar>
        {shouldShowUnreadBadge ? (
          <span
            aria-label={`${account.name} 未读消息 ${account.unreadCount}`}
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {account.unreadCount}
          </span>
        ) : null}
      </button>
    );

    if (!canTakeOver) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{compactButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <span>{account.name}</span>
              <span className="ml-2 text-background/70">{compactStatusLabel}</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Popover
        onOpenChange={setIsTakeoverPopoverOpen}
        open={isTakeoverPopoverOpen}
      >
        <PopoverAnchor asChild>{compactButton}</PopoverAnchor>
        {canTakeOver ? (
          <PopoverContent
            align="start"
            className="w-[240px]"
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
            side="right"
            sideOffset={2}
          >
            <div className="mb-2 min-w-0">
              <p className="truncate text-[13px] font-semibold leading-5 text-foreground">
                {account.name}
              </p>
            </div>
            <p className="text-[13px] font-medium leading-5 text-warning">
              当前账号未被你接管，你将无法
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
        ) : null}
      </Popover>
    );
  }

  return (
    <Popover
      onOpenChange={setIsTakeoverPopoverOpen}
      open={isTakeoverPopoverOpen}
    >
      <PopoverAnchor asChild>
        <button
          aria-label={`选择 ${account.name}`}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          data-testid={`account-sidebar-item-${account.id}`}
          onBlur={closeTakeoverPopover}
          onClick={onClick}
          onFocus={canTakeOver ? openTakeoverPopover : undefined}
          onKeyDown={handleCardKeyDown}
          onMouseEnter={canTakeOver ? openTakeoverPopover : undefined}
          onMouseLeave={canTakeOver ? closeTakeoverPopover : undefined}
          title={account.name}
          type="button"
        >
          <div
            className="relative"
            data-testid={`account-avatar-wrap-${account.id}`}
          >
            <Avatar className="size-9">
              <AvatarImage alt={account.name} src={account.avatarUrl} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {account.name.slice(0, 1)}
              </AvatarFallback>
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
            <div className="flex items-center">
              <span
                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold"
              >
                {account.name}
              </span>
            </div>
            <div
              className="mt-1 flex items-center"
              data-testid={`account-sidebar-item-status-row-${account.id}`}
            >
              {statusBadge}
            </div>
          </div>
        </button>
      </PopoverAnchor>
      {canTakeOver ? (
        <PopoverContent
          align="start"
          className="w-[240px]"
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
          side="right"
          sideOffset={2}
        >
          <p className="text-[13px] font-medium leading-5 text-warning">
            当前账号未被你接管，你将无法
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
      ) : null}
    </Popover>
  );
}

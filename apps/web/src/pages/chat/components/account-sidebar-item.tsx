import { useEffect, useRef, useState } from "react";
import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Spinner } from "@/components/ui/spinner";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { AvatarUnreadCountBadge } from "@/pages/chat/components/unread-count-badge";
import { cn } from "@/lib/utils";
import { isExpiredAccountSeat } from "@/pages/chat/lib/workbench-permissions";
import type { Account } from "@/pages/chat/chat-types";

export function AccountSidebarItem({
  account,
  currentEmployeeId,
  canTakeOverAccount = true,
  isActive,
  onClick,
  onTakeOverAccount,
  takeoverStatus,
  variant = "default",
}: {
  account: Account;
  canTakeOverAccount?: boolean;
  currentEmployeeId?: string;
  isActive: boolean;
  onClick: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatus: "idle" | "taking-over";
  variant?: "default" | "compact";
}) {
  const closePopoverTimerRef = useRef<number | null>(null);
  const [isTakeoverPopoverOpen, setIsTakeoverPopoverOpen] = useState(false);
  const [isTakeoverConfirmOpen, setIsTakeoverConfirmOpen] = useState(false);
  const [isTakeoverConfirmPending, setIsTakeoverConfirmPending] = useState(false);
  const isMountedRef = useRef(true);
  const isExpired = isExpiredAccountSeat(account);
  const isOffline = account.loginStatus === "offline";
  const isTakenOverByCurrentUser =
    !!account.takenOverEmployeeId && account.takenOverEmployeeId === currentEmployeeId;
  const isTakingOver = takeoverStatus === "taking-over";
  const statusLabel = isExpired
    ? "席位已失效"
    : isOffline
      ? "离线"
      : isTakenOverByCurrentUser
        ? "接管中"
        : "未接管";
  const canShowTakeoverPopover = !isExpired && !isOffline && !isTakenOverByCurrentUser;
  const canTakeOver = canTakeOverAccount && canShowTakeoverPopover && !isTakingOver;
  const shouldShowUnreadCount = !isExpired && (account.unreadCount ?? 0) > 0;
  const compactStatusLabel =
    isExpired
      ? "席位已失效"
      : isTakingOver
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
        (isExpired || isOffline) && "text-muted-foreground",
        !isExpired && !isOffline && isTakenOverByCurrentUser && "text-success",
        !isExpired && !isOffline && !isTakenOverByCurrentUser && "text-warning",
      )}
    >
      <span
        data-testid="account-status-dot"
        className={cn(
          "size-1.5 rounded-full",
          (isExpired || isOffline) && "bg-muted-foreground/50",
          !isExpired && !isOffline && isTakenOverByCurrentUser && "bg-success",
          !isExpired && !isOffline && !isTakenOverByCurrentUser && "bg-warning"
        )}
      />
      <span>{statusLabel}</span>
    </span>
  );
  const compactStatusBadge = (
    <AvatarBadge
      aria-label={`${account.name} 状态 ${compactStatusLabel}`}
      className={cn(
        "size-2 ring-1",
        (isExpired || isOffline) && "bg-muted-foreground/50",
        !isExpired && !isOffline && isTakenOverByCurrentUser && "bg-success",
        !isExpired && !isOffline && !isTakenOverByCurrentUser && "bg-warning",
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
  const handleTakeoverConfirmOpenChange = (open: boolean) => {
    if (isTakeoverConfirmPending && !open) {
      return;
    }

    setIsTakeoverConfirmOpen(open);
  };
  const handleConfirmTakeover = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();

    if (isTakeoverConfirmPending) {
      return;
    }

    setIsTakeoverConfirmPending(true);

    try {
      await onTakeOverAccount?.(account.id);
    } finally {
      if (isMountedRef.current) {
        setIsTakeoverConfirmPending(false);
        setIsTakeoverConfirmOpen(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      clearClosePopoverTimer();
      isMountedRef.current = false;
    };
  }, []);

  if (variant === "compact") {
    const compactButton = (
      <button
        aria-label={`选择 ${account.name}`}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-[8px] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "bg-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        data-testid={`account-sidebar-item-${account.id}`}
        onBlur={closeTakeoverPopover}
        onClick={onClick}
        onFocus={canShowTakeoverPopover ? openTakeoverPopover : undefined}
        onKeyDown={handleCardKeyDown}
        onMouseEnter={canShowTakeoverPopover ? openTakeoverPopover : undefined}
        onMouseLeave={canShowTakeoverPopover ? closeTakeoverPopover : undefined}
        type="button"
      >
        <Avatar className="size-7 rounded-[8px]">
          <AvatarImage
            alt={account.name}
            className={cn("transition-opacity", !isActive && "opacity-45")}
            src={account.avatarUrl}
          />
          <AvatarFallback
            className={cn(
              "rounded-[8px] bg-primary text-primary-foreground transition-opacity",
              !isActive && "opacity-45",
            )}
          >
            {account.name.slice(0, 1)}
          </AvatarFallback>
          {compactStatusBadge}
        </Avatar>
        {shouldShowUnreadCount ? (
          <AccountUnreadBadge account={account} className="right-0 top-0" />
        ) : null}
      </button>
    );

    if (!canShowTakeoverPopover) {
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
        {canShowTakeoverPopover ? (
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
            {canTakeOverAccount ? (
              <>
                <p className="text-[13px] font-medium leading-5 text-warning">
                  当前账号未被你接管，你将无法
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] leading-5 text-muted-foreground">
                  <li>使用该账号发送消息</li>
                  <li>标记消息已读状态</li>
                </ul>
              </>
            ) : (
              <p className="text-[13px] font-medium leading-5 text-muted-foreground">
                当前账号无接管权限
              </p>
            )}
            <Button
              aria-busy={isTakingOver}
              className="mt-3 h-8 w-full rounded-[10px] text-xs"
              disabled={!canTakeOver}
              onClick={(event) => {
                event.stopPropagation();
                if (!canTakeOver) {
                  return;
                }

                setIsTakeoverConfirmOpen(true);
              }}
              size="sm"
              type="button"
            >
              {isTakingOver ? (
                <Spinner variant="classic" size={14} className="text-current" />
              ) : (
                <HugeiconsIcon
                  color="currentColor"
                  icon={UserCheck01Icon}
                  size={14}
                  strokeWidth={1.8}
                />
              )}
              <span>{isTakingOver ? "接管中" : "接管账号"}</span>
            </Button>
          </PopoverContent>
        ) : null}
        <AlertDialog
          onOpenChange={handleTakeoverConfirmOpenChange}
          open={isTakeoverConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>是否确认接管：{account.name}</AlertDialogTitle>
              <AlertDialogDescription>
                接管后，将由你负责处理对话，其他子账号将无权发送消息
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isTakeoverConfirmPending}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                aria-busy={isTakeoverConfirmPending}
                disabled={isTakeoverConfirmPending}
                onClick={handleConfirmTakeover}
                variant="default"
              >
                {isTakeoverConfirmPending ? (
                  <Spinner variant="classic" size={16} className="text-current" />
                ) : null}
                <span>{isTakeoverConfirmPending ? "接管中" : "确认接管"}</span>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
          onFocus={canShowTakeoverPopover ? openTakeoverPopover : undefined}
          onKeyDown={handleCardKeyDown}
          onMouseEnter={canShowTakeoverPopover ? openTakeoverPopover : undefined}
          onMouseLeave={canShowTakeoverPopover ? closeTakeoverPopover : undefined}
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
            {shouldShowUnreadCount ? <AccountUnreadBadge account={account} /> : null}
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
      {canShowTakeoverPopover ? (
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
          {canTakeOverAccount ? (
            <>
              <p className="text-[13px] font-medium leading-5 text-warning">
                当前账号未被你接管，你将无法
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] leading-5 text-muted-foreground">
                <li>使用该账号发送消息</li>
                <li>标记消息已读状态</li>
              </ul>
            </>
          ) : (
            <p className="text-[13px] font-medium leading-5 text-muted-foreground">
              当前账号无接管权限
            </p>
          )}
          <Button
            aria-busy={isTakingOver}
            className="mt-3 h-8 w-full rounded-[10px] text-xs"
            disabled={!canTakeOver}
            onClick={(event) => {
              event.stopPropagation();
              if (!canTakeOver) {
                return;
              }

              setIsTakeoverConfirmOpen(true);
            }}
            size="sm"
            type="button"
          >
            {isTakingOver ? (
              <Spinner variant="classic" size={14} className="text-current" />
            ) : (
              <HugeiconsIcon
                color="currentColor"
                icon={UserCheck01Icon}
                size={14}
                strokeWidth={1.8}
              />
            )}
            <span>{isTakingOver ? "接管中" : "接管账号"}</span>
          </Button>
        </PopoverContent>
      ) : null}
      <AlertDialog
        onOpenChange={handleTakeoverConfirmOpenChange}
        open={isTakeoverConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>是否确认接管：{account.name}</AlertDialogTitle>
            <AlertDialogDescription>
              接管后，将由你负责处理对话，其他子账号将无权发送消息
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTakeoverConfirmPending}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={isTakeoverConfirmPending}
              disabled={isTakeoverConfirmPending}
              onClick={handleConfirmTakeover}
              variant="default"
            >
              {isTakeoverConfirmPending ? (
                <Spinner variant="classic" size={16} className="text-current" />
              ) : null}
              <span>{isTakeoverConfirmPending ? "接管中" : "确认接管"}</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
  );
}

function AccountUnreadBadge({
  account,
  className,
}: {
  account: Account;
  className?: string;
}) {
  const unreadCount = account.unreadCount ?? 0;

  return (
    <AvatarUnreadCountBadge
      ariaLabel={`${account.name} 有 ${unreadCount} 条未读消息`}
      className={className}
      count={unreadCount}
      testId={`account-unread-count-${account.id}`}
    />
  );
}

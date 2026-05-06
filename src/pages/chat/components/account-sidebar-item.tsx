import { startTransition } from "react";
import { UserCheck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const isOffline = account.loginStatus === "offline";
  const isTakenOverByCurrentUser =
    !!account.takenOverEmployeeId && account.takenOverEmployeeId === currentEmployeeId;
  const statusLabel = isOffline ? "离线" : isTakenOverByCurrentUser ? "已接管" : "未接管";
  const canTakeOver = !isOffline && !isTakenOverByCurrentUser && takeoverStatus !== "taking-over";
  const statusBadge = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[10px] font-medium leading-none",
        isOffline
          ? "bg-surface-muted text-muted-foreground"
          : "bg-success/10 text-success",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          isOffline ? "bg-muted-foreground/50" : "bg-success",
        )}
      />
      <span>{takeoverStatus === "taking-over" ? "接管中" : statusLabel}</span>
    </span>
  );

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
      <Avatar className="mt-0.5 size-10">
        <AvatarImage alt={account.name} src={account.avatarUrl} />
        <AvatarFallback>{account.name.slice(0, 1)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <button
            className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClick}
            type="button"
          >
            {account.name}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                aria-label={`${account.name} ${statusLabel}`}
                className="inline-flex cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                role="button"
                tabIndex={0}
              >
                {statusBadge}
              </span>
            </DropdownMenuTrigger>
            {canTakeOver ? (
              <DropdownMenuContent align="end" className="w-[120px]">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    startTransition(() => {
                      void onTakeOverAccount?.(account.id);
                    });
                  }}
                >
                  <HugeiconsIcon
                    color="currentColor"
                    icon={UserCheck01Icon}
                    size={14}
                    strokeWidth={1.8}
                  />
                  <span>接管账号</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            ) : null}
          </DropdownMenu>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            className="min-w-0 flex-1 truncate text-left text-[12px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            onClick={onClick}
            type="button"
          >
            {account.operator}
          </button>
          {account.unreadCount ? (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              {account.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

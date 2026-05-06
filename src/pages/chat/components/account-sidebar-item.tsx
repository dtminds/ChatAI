import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Account } from "@/pages/chat/chat-types";

export function AccountSidebarItem({
  account,
  isActive,
  onClick,
}: {
  account: Account;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "relative flex w-full items-start gap-2 rounded-[16px] border px-2.5 py-2 text-left transition-colors",
        isActive
          ? "border-border bg-surface"
          : "border-transparent bg-transparent hover:bg-surface-hover",
      )}
      onClick={onClick}
      title={account.name}
      type="button"
    >
      <Avatar className="mt-0.5 size-10">
        <AvatarImage alt={account.name} src={account.avatarUrl} />
        <AvatarFallback>{account.name.slice(0, 1)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {account.name}
          </p>
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 text-[10px] leading-none",
              account.loginStatus === "offline"
                ? "text-muted-foreground"
                : "text-success",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                account.loginStatus === "offline"
                  ? "bg-muted-foreground/50"
                  : "bg-success",
              )}
            />
            <span>{account.loginStatus === "offline" ? "离线" : "在线"}</span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] text-muted-foreground">
            {account.operator}
          </p>
          {account.unreadCount ? (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
              {account.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

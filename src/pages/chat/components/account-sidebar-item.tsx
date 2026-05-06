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
          ? "border-[#e7ebf0] bg-white"
          : "border-transparent bg-transparent hover:bg-white/70",
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
              account.loginStatus === "offline" ? "text-[#98A2B3]" : "text-[#28B266]",
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                account.loginStatus === "offline" ? "bg-[#C7CED8]" : "bg-[#28B266]",
              )}
            />
            <span>{account.loginStatus === "offline" ? "离线" : "在线"}</span>
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="truncate text-[12px] text-[#6e7887]">
            {account.operator}
          </p>
          {account.unreadCount ? (
            <span className="rounded-full bg-[#ff4d4f] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {account.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

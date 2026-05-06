import { startTransition } from "react";
import {
  Chat01Icon,
  CustomerService02Icon,
  Menu11Icon,
  Notification02Icon,
  Task01Icon,
  UserGroup03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account } from "@/pages/chat/chat-types";

const railItems = [
  { label: "工作台", icon: Menu11Icon },
  { label: "聊天", icon: Chat01Icon },
  { label: "客户", icon: UserGroup03Icon },
  { label: "任务", icon: Task01Icon },
];

type AccountRailProps = {
  accounts: Account[];
  activeAccountId?: string;
  pollIntervalMs: number;
  isPollError: boolean;
  onSelectAccount: (accountId: string) => void | Promise<void>;
};

export function AccountRail({
  accounts,
  activeAccountId,
  pollIntervalMs,
  isPollError,
  onSelectAccount,
}: AccountRailProps) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-[#F7F8F9] px-3 py-4">
      <div className="mb-3 flex items-center px-1">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <HugeiconsIcon
            icon={CustomerService02Icon}
            size={18}
            strokeWidth={1.7}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 px-1">
        {railItems.map((item) => {
          const isActive = item.label === "聊天";

          return (
            <button
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[20px] px-3 py-3 text-[12px] font-medium transition-colors",
                isActive
                  ? "border border-[#dfe4ea] bg-white text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.05)]"
                  : "border border-transparent text-[#6b7a90] hover:bg-white/70 hover:text-foreground",
              )}
              key={item.label}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={item.icon}
                size={16}
                strokeWidth={1.8}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="my-4 h-px bg-[#EEEFF0]" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;

            return (
              <AccountSidebarItem
                account={account}
                isActive={isActive}
                key={account.id}
                onClick={() => {
                  startTransition(() => {
                    void onSelectAccount(account.id);
                  });
                }}
              />
            );
          })}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-1 px-1 pt-3 text-[10px] text-[#7c889a]">
        <HugeiconsIcon
          color="currentColor"
          icon={Notification02Icon}
          size={14}
          strokeWidth={1.8}
        />
        <span>{Math.floor(pollIntervalMs / 1000)}s</span>
        {isPollError ? <span className="text-[#d54b4b]">轮询异常</span> : null}
      </div>
    </section>
  );
}

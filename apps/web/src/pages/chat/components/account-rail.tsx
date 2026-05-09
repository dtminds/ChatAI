import { startTransition } from "react";
import {
  Chat01Icon,
  CustomerService02Icon,
  LogoutSquare01Icon,
  Menu11Icon,
  MoreVerticalIcon,
  Settings03Icon,
  Task01Icon,
  UserGroup03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import type { Account, EmployeeProfile } from "@/pages/chat/chat-types";

const railItems = [
  { label: "工作台", icon: Menu11Icon },
  { label: "聊天", icon: Chat01Icon },
  { label: "客户", icon: UserGroup03Icon },
  { label: "任务", icon: Task01Icon },
];

type AccountRailProps = {
  accounts: Account[];
  activeAccountId?: string;
  currentEmployee?: EmployeeProfile;
  currentEmployeeId?: string;
  onLogout?: () => void | Promise<void>;
  onSelectAccount: (accountId: string) => void | Promise<void>;
  onOpenSettings?: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatusByAccountId?: Record<string, "idle" | "taking-over">;
};

export function AccountRail({
  accounts,
  activeAccountId,
  currentEmployee,
  currentEmployeeId,
  onLogout,
  onOpenSettings,
  onSelectAccount,
  onTakeOverAccount,
  takeoverStatusByAccountId = {},
}: AccountRailProps) {
  const signedInAccount =
    accounts.find((account) => account.id === activeAccountId) ?? accounts[0];
  const signedInName =
    currentEmployee?.displayName || signedInAccount?.operator || signedInAccount?.name || "未登录";
  const signedInAccountName = signedInAccount?.name ?? "未选择账号";

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground">
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
                  ? "border border-sidebar-border bg-background text-foreground shadow-[0_2px_8px_var(--shadow-soft)]"
                  : "border border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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

      <div className="my-4 h-px bg-divider" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;

            return (
              <AccountSidebarItem
                account={account}
                currentEmployeeId={currentEmployeeId}
                isActive={isActive}
                key={account.id}
                onClick={() => {
                  startTransition(() => {
                    void onSelectAccount(account.id);
                  });
                }}
                onTakeOverAccount={onTakeOverAccount}
                takeoverStatus={takeoverStatusByAccountId[account.id] ?? "idle"}
              />
            );
          })}
        </div>
      </ScrollArea>

      <div className="pt-3" data-testid="account-rail-footer">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="打开账号菜单"
              className="h-13 w-full justify-start gap-2 rounded-[10px] px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              type="button"
              variant="ghost"
            >
              <Avatar
                aria-label={`${signedInName} 登录头像`}
                className="size-8 shrink-0 rounded-lg bg-surface shadow-[0_4px_12px_var(--shadow-soft)]"
              >
                <AvatarFallback className="rounded-lg text-sm">
                  {signedInName.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span
                  className="truncate font-medium"
                  data-testid="account-rail-footer-name"
                >
                  {signedInName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {signedInAccountName}
                </span>
              </div>
              <HugeiconsIcon
                color="currentColor"
                data-testid="account-rail-settings-icon"
                icon={MoreVerticalIcon}
                size={18}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg p-1 shadow-[0_16px_36px_var(--shadow-medium)] outline-none"
            side="right"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div
                className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"
                data-testid="account-settings-profile"
              >
                <Avatar
                  aria-label={`${signedInName} 账号头像`}
                  className="size-6 shrink-0 rounded-lg bg-surface shadow-[0_4px_12px_var(--shadow-soft)]"
                >
                  <AvatarFallback className="rounded-lg text-sm">
                    {signedInName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left text-[12px] leading-tight">
                  <span
                    className="truncate font-medium"
                    data-testid="account-settings-profile-name"
                  >
                    {signedInName}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <div className="space-y-1 py-1">
              <DropdownMenuItem
                className="h-8 gap-2 rounded-[8px] px-2.5 text-[13px] font-normal"
                onSelect={() => {
                  onOpenSettings?.();
                }}
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={Settings03Icon}
                  size={16}
                />
                <span>设置</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="h-8 gap-2 rounded-[8px] px-2.5 text-[13px] font-normal"
                onSelect={() => {
                  void onLogout?.();
                }}
              >
                <HugeiconsIcon
                  color="currentColor"
                  icon={LogoutSquare01Icon}
                  size={16}
                />
                <span>退出登录</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}

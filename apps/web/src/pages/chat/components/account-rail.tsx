import { startTransition, type PointerEvent as ReactPointerEvent } from "react";
import {
  Chat01Icon,
  ChartBreakoutCircleIcon,
  LayoutAlignLeftIcon,
  LogoutSquare01Icon,
  Menu11Icon,
  MoreVerticalIcon,
  PanelLeftIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  isCollapsed?: boolean;
  currentEmployee?: EmployeeProfile;
  currentEmployeeId?: string;
  onCollapseChange?: (isCollapsed: boolean) => void;
  onLogout?: () => void | Promise<void>;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectAccount: (accountId: string) => void | Promise<void>;
  onOpenSettings?: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatusByAccountId?: Record<string, "idle" | "taking-over">;
};

const userNameSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

function getFirstGrapheme(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return userNameSegmenter?.segment(trimmedValue)[Symbol.iterator]().next().value?.segment ?? [
    ...trimmedValue,
  ][0] ?? "";
}

export function AccountRail({
  accounts,
  activeAccountId,
  isCollapsed = false,
  currentEmployee,
  currentEmployeeId,
  onCollapseChange,
  onLogout,
  onOpenSettings,
  onResizeStart,
  onSelectAccount,
  onTakeOverAccount,
  takeoverStatusByAccountId = {},
}: AccountRailProps) {
  const signedInName = currentEmployee?.displayName.trim() || "未登录";
  const signedInAvatarFallback = getFirstGrapheme(signedInName);
  const toggleLabel = isCollapsed ? "展开侧栏" : "折叠侧栏";
  const toggleIcon = isCollapsed ? PanelLeftIcon : LayoutAlignLeftIcon;
  const accountMenuContent = (
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
            className="size-6 shrink-0 rounded-full bg-surface shadow-[0_4px_12px_var(--shadow-soft)]"
          >
            <AvatarFallback className="rounded-full bg-primary text-sm text-primary-foreground">
              {signedInAvatarFallback}
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
  );

  if (isCollapsed) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center bg-sidebar px-2 py-4 text-sidebar-foreground">
        <Button
          aria-label={toggleLabel}
          aria-pressed={isCollapsed}
          className="mb-4 size-9 rounded-[10px] p-0 text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => onCollapseChange?.(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={toggleIcon}
            size={18}
            strokeWidth={1.9}
          />
        </Button>

        <TooltipProvider>
          <nav
            aria-label="侧栏导航"
            className="flex flex-col items-center gap-2"
          >
            {railItems.map((item) => {
              const isActive = item.label === "聊天";

              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={item.label}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-[8px] text-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
                        isActive &&
                          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                      )}
                      type="button"
                    >
                      <HugeiconsIcon
                        color="currentColor"
                        icon={item.icon}
                        size={18}
                        strokeWidth={1.8}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>

        <div className="my-4 h-px w-8 bg-divider" />

        <ScrollArea className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-2 py-1">
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
                  variant="compact"
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
                className="size-9 rounded-[10px] p-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                type="button"
                variant="ghost"
              >
                <Avatar
                  aria-label={`${signedInName} 登录头像`}
                  className="size-7 shrink-0 rounded-full bg-surface shadow-[0_4px_12px_var(--shadow-soft)]"
                >
                  <AvatarFallback className="rounded-full bg-primary text-sm text-primary-foreground">
                    <span data-testid="account-rail-footer-avatar-fallback">
                      {signedInAvatarFallback}
                    </span>
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            {accountMenuContent}
          </DropdownMenu>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex h-full min-h-0 flex-col bg-sidebar px-3 py-4 text-sidebar-foreground">
      <div className="mb-3 flex items-center justify-between px-1">
        <div
          className="grid h-8.5 min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 px-3 text-neutral-strong"
          data-testid="account-rail-logo"
        >
          <span className="relative flex size-[18px] items-center justify-center overflow-visible">
            <HugeiconsIcon
              className="absolute"
              color="currentColor"
              icon={ChartBreakoutCircleIcon}
              size={24}
              strokeWidth={2}
            />
          </span>
          <span className="text-[15px] font-semibold leading-none">ChatAI</span>
        </div>
        <Button
          aria-label={toggleLabel}
          aria-pressed={isCollapsed}
          className="size-8 rounded-[8px] p-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => onCollapseChange?.(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            color="currentColor"
            icon={toggleIcon}
            size={18}
            strokeWidth={1.8}
          />
        </Button>
      </div>

      <div className="flex flex-col gap-1 px-1">
        {railItems.map((item) => {
          const isActive = item.label === "聊天";

          return (
            <button
              className={cn(
                "flex h-8.5 w-full items-center gap-2 rounded-[8px] px-3 text-[14px] text-foreground transition-colors",
                isActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              key={item.label}
              type="button"
            >
              <HugeiconsIcon
                color="currentColor"
                icon={item.icon}
                size={18}
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
                className="size-8 shrink-0 rounded-full bg-surface shadow-[0_4px_12px_var(--shadow-soft)]"
              >
                <AvatarFallback className="rounded-full bg-primary text-sm text-primary-foreground">
                  <span data-testid="account-rail-footer-avatar-fallback">
                    {signedInAvatarFallback}
                  </span>
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span
                  className="truncate font-medium"
                  data-testid="account-rail-footer-name"
                >
                  {signedInName}
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
          {accountMenuContent}
        </DropdownMenu>
      </div>

      <button
        aria-label="调整账号侧栏宽度"
        className="absolute inset-y-0 right-0 w-2 cursor-col-resize bg-transparent"
        onPointerDown={onResizeStart}
        type="button"
      />
    </section>
  );
}

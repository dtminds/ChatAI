import {
  startTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AiIdeaIcon,
  ChatIcon,
  ChartBreakoutCircleIcon,
  LayoutAlignLeftIcon,
  DashboardCircleIcon,
  PanelLeftIcon,
  Notification01Icon,
  UserSquareIcon,
  AiChat02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NavLink, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
import { SignedInAccountMenu } from "@/pages/chat/components/signed-in-account-menu";
import type { Account, EmployeeProfile } from "@/pages/chat/chat-types";

const railItems = [
  { label: "工作台", icon: DashboardCircleIcon, devOnly: true },
  { label: "聊天", icon: ChatIcon },
  { label: "客户", icon: UserSquareIcon },
  { label: "洞察", icon: AiIdeaIcon, to: "/chat/insights", badge: "Beta" },
  { label: "智能体", icon: AiChat02Icon, to: "/chat/ai-hosting" },
  { label: "任务", icon: Notification01Icon, devOnly: true },
];

const visibleRailItems = import.meta.env.DEV
  ? railItems
  : railItems.filter((item) => !item.devOnly);

const collapsedNavItemClassName =
  "inline-flex size-9 items-center justify-center rounded-[8px] text-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25 [&_svg]:shrink-0";

function isRouteItemActive(pathname: string, to?: string) {
  if (!to) {
    return false;
  }

  return pathname === to || pathname.startsWith(`${to}/`);
}

type AccountRailProps = {
  accounts: Account[];
  activeAccountId?: string;
  activeNavItem?: string;
  isCollapsed?: boolean;
  currentEmployee?: EmployeeProfile;
  currentEmployeeId?: string;
  canTakeOverAccount?: boolean;
  onCollapseChange?: (isCollapsed: boolean) => void;
  onLogout?: () => void | Promise<void>;
  onNavItemSelect?: (label: string) => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectAccount: (accountId: string) => void | Promise<void>;
  onOpenSettings?: () => void;
  onTakeOverAccount?: (accountId: string) => void | Promise<void>;
  takeoverStatusByAccountId?: Record<string, "idle" | "taking-over">;
};

export function AccountRail({
  accounts,
  activeAccountId,
  activeNavItem = "聊天",
  canTakeOverAccount = true,
  isCollapsed = false,
  currentEmployee,
  currentEmployeeId,
  onCollapseChange,
  onLogout,
  onNavItemSelect,
  onOpenSettings,
  onResizeStart,
  onSelectAccount,
  onTakeOverAccount,
  takeoverStatusByAccountId = {},
}: AccountRailProps) {
  const location = useLocation();
  const toggleLabel = isCollapsed ? "展开侧栏" : "折叠侧栏";
  const toggleIcon = isCollapsed ? PanelLeftIcon : LayoutAlignLeftIcon;

  if (isCollapsed) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center bg-sidebar px-2 py-4 text-sidebar-foreground">
        {onCollapseChange ? (
          <Button
            aria-label={toggleLabel}
            aria-pressed={isCollapsed}
            className="mb-4 size-9 rounded-[10px] p-0 text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => onCollapseChange(false)}
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
        ) : (
          <div
            aria-hidden="true"
            className="mb-4 flex size-9 items-center justify-center rounded-[10px] text-sidebar-foreground"
          >
            <HugeiconsIcon
              color="currentColor"
              icon={toggleIcon}
              size={18}
              strokeWidth={1.9}
            />
          </div>
        )}

        <TooltipProvider>
          <nav
            aria-label="侧栏导航"
            className="flex flex-col items-center gap-2"
          >
            {visibleRailItems.map((item) => {
              const isActive = item.label === activeNavItem;
              const isRouteActive = isRouteItemActive(location.pathname, item.to);
              const itemContent = (
                <HugeiconsIcon
                  color="currentColor"
                  icon={item.icon}
                  size={18}
                  strokeWidth={1.6}
                />
              );

              return (
                <Tooltip key={item.label}>
                  <TooltipTrigger asChild>
                    {item.to ? (
                      <NavLink
                        aria-label={item.label}
                        className={cn(
                          collapsedNavItemClassName,
                          (isActive || isRouteActive) &&
                            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                        to={item.to}
                      >
                        {itemContent}
                      </NavLink>
                    ) : (
                      <button
                        aria-label={item.label}
                        className={cn(
                          collapsedNavItemClassName,
                          isActive &&
                            "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                        onClick={() => onNavItemSelect?.(item.label)}
                        type="button"
                      >
                        {itemContent}
                      </button>
                    )}
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
                  canTakeOverAccount={canTakeOverAccount}
                  variant="compact"
                />
              );
            })}
          </div>
        </ScrollArea>

        <div className="pt-3" data-testid="account-rail-footer">
          <SignedInAccountMenu
            displayName={currentEmployee?.displayName}
            onLogout={onLogout}
            onOpenSettings={onOpenSettings}
            variant="compact"
          />
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
        {visibleRailItems.map((item) => {
          const isActive = item.label === activeNavItem;
          const itemContent = (
            <>
              <HugeiconsIcon
                color="currentColor"
                icon={item.icon}
                size={16}
                strokeWidth={1.6}
              />
              <span className="min-w-0 truncate">{item.label}</span>
              {item.badge ? (
                <Badge
                  aria-hidden="true"
                  className="ml-auto h-5 shrink-0 rounded-[5px] px-1.5 py-0 text-[10px] leading-none"
                >
                  {item.badge}
                </Badge>
              ) : null}
            </>
          );

          return item.to ? (
            <NavLink
              className={({ isActive: isRouteActive }) =>
                cn(
                  "flex h-8.5 w-full items-center gap-2 rounded-[8px] px-3 text-[14px] text-foreground transition-colors",
                  isActive || isRouteActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )
              }
              key={item.label}
              to={item.to}
            >
              {itemContent}
            </NavLink>
          ) : (
            <button
              className={cn(
                "flex h-8.5 w-full items-center gap-2 rounded-[8px] px-3 text-[14px] text-foreground transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              key={item.label}
              onClick={() => onNavItemSelect?.(item.label)}
              type="button"
            >
              {itemContent}
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
                canTakeOverAccount={canTakeOverAccount}
              />
            );
          })}
        </div>
      </ScrollArea>

      <div className="pt-3" data-testid="account-rail-footer">
        <SignedInAccountMenu
          displayName={currentEmployee?.displayName}
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
        />
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

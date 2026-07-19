import {
  startTransition,
  useLayoutEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AiIdeaIcon,
  ChatIcon,
  ChartBreakoutCircleIcon,
  LayoutAlignLeftIcon,
  LogoutSquare01Icon,
  DashboardCircleIcon,
  ModernTvIcon,
  MoreVerticalIcon,
  Moon02Icon,
  PaintBoardIcon,
  PanelLeftIcon,
  Ramadhan01Icon,
  Settings03Icon,
  Notification01Icon,
  Sun02Icon,
  UserSquareIcon,
  AiChat02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NavLink, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type AppearanceThemeId,
  appearanceThemes,
  applyAppearanceTheme,
  getInitialAppearanceTheme,
  isAppearanceThemeId,
  writeAppearanceTheme,
} from "@/lib/appearance-theme";
import {
  applyThemePreference,
  getDarkModeMediaQuery,
  getInitialThemePreference,
  isThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme-preference";
import { cn } from "@/lib/utils";
import { AccountSidebarItem } from "@/pages/chat/components/account-sidebar-item";
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

const themeModeOptions = [
  { value: "light", label: "浅色", icon: Sun02Icon },
  { value: "dark", label: "深色", icon: Moon02Icon },
  { value: "system", label: "跟随系统", icon: ModernTvIcon },
] as const;

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
  const [appearanceTheme, setAppearanceTheme] =
    useState<AppearanceThemeId>("default");
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isThemeColorMenuOpen, setIsThemeColorMenuOpen] = useState(false);
  const [isAppearanceModeMenuOpen, setIsAppearanceModeMenuOpen] = useState(false);
  const signedInName = currentEmployee?.displayName.trim() || "未登录";
  const signedInAvatarFallback = getFirstGrapheme(signedInName);
  const toggleLabel = isCollapsed ? "展开侧栏" : "折叠侧栏";
  const toggleIcon = isCollapsed ? PanelLeftIcon : LayoutAlignLeftIcon;
  const activeThemeMode =
    themeModeOptions.find((option) => option.value === themePreference) ??
    themeModeOptions[2];

  useLayoutEffect(() => {
    const initialTheme = getInitialAppearanceTheme();

    applyAppearanceTheme(initialTheme);
    setAppearanceTheme(initialTheme);
  }, []);

  useLayoutEffect(() => {
    const initialThemePreference = getInitialThemePreference();
    const mediaQuery = getDarkModeMediaQuery();

    applyThemePreference(initialThemePreference, mediaQuery?.matches ?? false);
    setThemePreference(initialThemePreference);
  }, []);

  const handleAppearanceThemeChange = (nextTheme: string) => {
    if (!isAppearanceThemeId(nextTheme)) {
      return;
    }

    applyAppearanceTheme(nextTheme);
    writeAppearanceTheme(nextTheme);
    setAppearanceTheme(nextTheme);
  };

  const handleThemePreferenceChange = (nextThemePreference: string) => {
    if (!isThemePreference(nextThemePreference)) {
      return;
    }

    applyThemePreference(
      nextThemePreference,
      getDarkModeMediaQuery()?.matches ?? false,
    );
    writeThemePreference(nextThemePreference);
    setThemePreference(nextThemePreference);
  };

  const handleAccountMenuOpenChange = (isOpen: boolean) => {
    setIsAccountMenuOpen(isOpen);

    if (!isOpen) {
      setIsThemeColorMenuOpen(false);
      setIsAppearanceModeMenuOpen(false);
    }
  };

  const accountMenuContent = (
    <DropdownMenuContent
      align="start"
      className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-lg p-1 shadow-[0_16px_36px_var(--shadow-medium)] outline-none"
      side="top"
      sideOffset={8}
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

      <div className="flex flex-col gap-1 py-1">
        <DropdownMenuSub
          onOpenChange={setIsThemeColorMenuOpen}
          open={isThemeColorMenuOpen}
        >
          <DropdownMenuSubTrigger
            onClick={() => setIsThemeColorMenuOpen(true)}
          >
            <HugeiconsIcon
              aria-hidden="true"
              color="currentColor"
              icon={PaintBoardIcon}
              size={16}
              strokeWidth={1.8}
            />
            <span className="min-w-0 flex-1 truncate">主题颜色</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-52 overflow-y-auto">
            <DropdownMenuRadioGroup
              onValueChange={handleAppearanceThemeChange}
              value={appearanceTheme}
            >
              {appearanceThemes.map((theme) => (
                <DropdownMenuRadioItem
                  className="gap-2"
                  key={theme.id}
                  onSelect={(event) => event.preventDefault()}
                  value={theme.id}
                >
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 -space-x-1"
                  >
                    {theme.previewColors.map((color) => (
                      <span
                        className="size-3 rounded-full ring-1 ring-background"
                        key={`${theme.id}-${color}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{theme.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub
          onOpenChange={setIsAppearanceModeMenuOpen}
          open={isAppearanceModeMenuOpen}
        >
          <DropdownMenuSubTrigger
            onClick={() => setIsAppearanceModeMenuOpen(true)}
          >
            <HugeiconsIcon
              aria-hidden="true"
              color="currentColor"
              icon={Ramadhan01Icon}
              size={16}
              strokeWidth={1.8}
            />
            <span className="min-w-0 flex-1 truncate">外观模式</span>
            <HugeiconsIcon
              aria-label={`当前外观模式：${activeThemeMode.label}`}
              className="mr-1 text-muted-foreground"
              color="currentColor"
              icon={activeThemeMode.icon}
              size={16}
              strokeWidth={1.8}
            />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup
              onValueChange={handleThemePreferenceChange}
              value={themePreference}
            >
              {themeModeOptions.map((option) => (
                <DropdownMenuRadioItem
                  className="gap-2"
                  key={option.value}
                  onSelect={(event) => event.preventDefault()}
                  value={option.value}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    color="currentColor"
                    icon={option.icon}
                    size={16}
                    strokeWidth={1.8}
                  />
                  <span>{option.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </div>

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
          <DropdownMenu
            onOpenChange={handleAccountMenuOpenChange}
            open={isAccountMenuOpen}
          >
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
        <DropdownMenu
          onOpenChange={handleAccountMenuOpenChange}
          open={isAccountMenuOpen}
        >
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

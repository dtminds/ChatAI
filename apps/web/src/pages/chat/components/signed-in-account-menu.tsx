import { useLayoutEffect, useState } from "react";
import {
  LogoutSquare01Icon,
  ModernTvIcon,
  MoreVerticalIcon,
  Moon02Icon,
  PaintBoardIcon,
  Ramadhan01Icon,
  Settings03Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { logout } from "@/pages/auth/auth-service";
import { notifyAuthSessionChanged } from "@/pages/auth/auth-tokens";
import { useAuthStore } from "@/store/auth-store";

const themeModeOptions = [
  { value: "light", label: "浅色", icon: Sun02Icon },
  { value: "dark", label: "深色", icon: Moon02Icon },
  { value: "system", label: "跟随系统", icon: ModernTvIcon },
] as const;

const userNameSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

type SignedInAccountMenuProps = {
  className?: string;
  displayName?: string;
  onLogout?: () => void | Promise<void>;
  onOpenSettings?: () => void;
  variant?: "compact" | "expanded";
};

export function SignedInAccountMenu({
  className,
  displayName,
  onLogout,
  onOpenSettings,
  variant = "expanded",
}: SignedInAccountMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const authDisplayName = useAuthStore((state) => state.subUser?.displayName);
  const [appearanceTheme, setAppearanceTheme] =
    useState<AppearanceThemeId>("default");
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isThemeColorMenuOpen, setIsThemeColorMenuOpen] = useState(false);
  const [isAppearanceModeMenuOpen, setIsAppearanceModeMenuOpen] = useState(false);
  const signedInName = displayName?.trim() || authDisplayName?.trim() || "未登录";
  const signedInAvatarFallback = getFirstGrapheme(signedInName);
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

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }

    if (location.pathname.startsWith("/chat/settings")) {
      return;
    }

    navigate("/chat/settings");
  };

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }

    try {
      await logout();
    } finally {
      notifyAuthSessionChanged();
    }
  };

  return (
    <DropdownMenu
      onOpenChange={handleAccountMenuOpenChange}
      open={isAccountMenuOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="打开账号菜单"
          className={cn(
            variant === "compact"
              ? "size-9 rounded-[10px] p-0"
              : "h-13 w-full justify-start gap-2 rounded-[10px] px-2",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground",
            className,
          )}
          type="button"
          variant="ghost"
        >
          <Avatar
            aria-label={`${signedInName} 登录头像`}
            className={cn(
              "shrink-0 rounded-full bg-surface shadow-[0_4px_12px_var(--shadow-soft)]",
              variant === "compact" ? "size-7" : "size-8",
            )}
          >
            <AvatarFallback className="rounded-full bg-primary text-sm text-primary-foreground">
              <span data-testid="account-rail-footer-avatar-fallback">
                {signedInAvatarFallback}
              </span>
            </AvatarFallback>
          </Avatar>
          {variant === "expanded" ? (
            <>
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
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

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
              indicatorClassName="opacity-30"
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
              indicatorClassName="opacity-30"
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
            onSelect={handleOpenSettings}
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
              void handleLogout();
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
  );
}

function getFirstGrapheme(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  return userNameSegmenter?.segment(trimmedValue)[Symbol.iterator]().next().value?.segment ?? [
    ...trimmedValue,
  ][0] ?? "";
}

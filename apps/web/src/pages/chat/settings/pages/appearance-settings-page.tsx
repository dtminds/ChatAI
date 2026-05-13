import {
  CheckmarkCircle02Icon,
  ModernTvIcon,
  Moon02Icon,
  Sun02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLayoutEffect, useState } from "react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import {
  type AppearanceThemeId,
  appearanceThemes,
  applyAppearanceTheme,
  getInitialAppearanceTheme,
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
import {
  PageHeader,
} from "@/pages/chat/settings/shared";

const themeModeOptions = [
  { value: "light", label: "浅色", icon: Sun02Icon },
  { value: "dark", label: "深色", icon: Moon02Icon },
  { value: "system", label: "跟随系统", icon: ModernTvIcon },
] as const;

export function AppearanceSettingsPage() {
  const [appearanceTheme, setAppearanceTheme] =
    useState<AppearanceThemeId>("default");
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const [isSystemDarkMode, setIsSystemDarkMode] = useState(false);

  useLayoutEffect(() => {
    const initialTheme = getInitialAppearanceTheme();

    applyAppearanceTheme(initialTheme);
    setAppearanceTheme(initialTheme);
  }, []);

  useLayoutEffect(() => {
    applyThemePreference(themePreference, isSystemDarkMode);
  }, [isSystemDarkMode, themePreference]);

  useLayoutEffect(() => {
    setThemePreference(getInitialThemePreference());

    const mediaQuery = getDarkModeMediaQuery();
    if (!mediaQuery) {
      return;
    }

    setIsSystemDarkMode(mediaQuery.matches);

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setIsSystemDarkMode(event.matches);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const handleAppearanceThemeChange = (nextTheme: AppearanceThemeId) => {
    applyAppearanceTheme(nextTheme);
    writeAppearanceTheme(nextTheme);
    setAppearanceTheme(nextTheme);
  };

  const handleThemePreferenceChange = (nextThemePreference: string) => {
    if (!isThemePreference(nextThemePreference)) {
      return;
    }

    writeThemePreference(nextThemePreference);
    setThemePreference(nextThemePreference);
  };

  return (
    <>
      <PageHeader
        description="选择你偏好的颜色主题和外观模式"
        eyebrow="THEME"
        title="外观"
      />

      <section aria-labelledby="appearance-mode-title" className="mb-6">
        <h2 id="appearance-mode-title" className="text-base font-semibold text-foreground">
          外观模式
        </h2>
        <SegmentedControl
          aria-label="选择外观模式"
          className="mt-3 h-9 rounded-full p-1"
          onValueChange={handleThemePreferenceChange}
          type="single"
          value={themePreference}
        >
          {themeModeOptions.map((option) => (
            <SegmentedControlItem
              aria-label={`${option.label}模式`}
              className="h-7 w-auto min-w-20 gap-1.5 rounded-full px-3 text-xs font-medium data-[state=on]:bg-foreground data-[state=on]:text-background"
              key={option.value}
              value={option.value}
            >
              <HugeiconsIcon
                color="currentColor"
                icon={option.icon}
                size={15}
                strokeWidth={1.8}
              />
              <span>{option.label}</span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </section>

      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">
          颜色主题
        </h2>
      </div>

      <section aria-label="外观主题" className="grid gap-3 lg:grid-cols-2">
        {appearanceThemes.map((theme) => {
          const isActive = theme.id === appearanceTheme;

          return (
            <button
              aria-label={`${theme.name} ${theme.description}`}
              aria-pressed={isActive}
              className={cn(
                "flex min-h-24 items-start justify-between gap-4 rounded-[10px] border border-border p-4 text-left transition-colors hover:border-primary/40",
                isActive && "border-primary/60 bg-primary/10",
              )}
              key={theme.id}
              onClick={() => handleAppearanceThemeChange(theme.id)}
              type="button"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="flex shrink-0 -space-x-2 pt-0.5">
                  {theme.previewColors.map((color, index) => (
                    <Avatar
                      className="size-6 rounded-full ring-2 ring-background"
                      key={`${theme.id}-${color}`}
                    >
                      <AvatarFallback
                        className="rounded-full"
                        style={{ backgroundColor: color }}
                      >
                        <span className="sr-only">
                          {theme.name} 预览色 {index + 1}
                        </span>
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    {theme.name}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                    {theme.description}
                  </span>
                </span>
              </span>
              {isActive ? (
                <HugeiconsIcon
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  color="currentColor"
                  icon={CheckmarkCircle02Icon}
                  size={20}
                  strokeWidth={1.8}
                />
              ) : null}
            </button>
          );
        })}
      </section>
    </>
  );
}

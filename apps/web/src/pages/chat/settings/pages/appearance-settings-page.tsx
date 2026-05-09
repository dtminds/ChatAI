import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLayoutEffect, useState } from "react";

import { cn } from "@/lib/utils";
import {
  type AppearanceThemeId,
  appearanceThemes,
  applyAppearanceTheme,
  getInitialAppearanceTheme,
  writeAppearanceTheme,
} from "@/lib/appearance-theme";
import {
  PageHeader,
} from "@/pages/chat/settings/shared";

export function AppearanceSettingsPage() {
  const [appearanceTheme, setAppearanceTheme] =
    useState<AppearanceThemeId>("default");

  useLayoutEffect(() => {
    const initialTheme = getInitialAppearanceTheme();

    applyAppearanceTheme(initialTheme);
    setAppearanceTheme(initialTheme);
  }, []);

  const handleAppearanceThemeChange = (nextTheme: AppearanceThemeId) => {
    applyAppearanceTheme(nextTheme);
    writeAppearanceTheme(nextTheme);
    setAppearanceTheme(nextTheme);
  };

  return (
    <>
      <PageHeader
        description="选择工作台整体配色。明暗模式仍可在聊天页顶部单独切换。"
        eyebrow="PREFERENCE"
        title="外观"
      />

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
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {theme.name}
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                  {theme.description}
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

      <section className="mt-5 rounded-[10px] border border-border p-5">
        <h2 className="text-base font-semibold text-foreground">工作台密度</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["舒适", "标准", "紧凑"].map((density) => (
            <button
              className="rounded-[10px] border border-border px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              key={density}
              type="button"
            >
              {density}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

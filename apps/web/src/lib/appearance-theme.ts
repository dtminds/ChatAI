export const APPEARANCE_THEME_STORAGE_KEY = "chat-ai-appearance-theme";

export const appearanceThemes = [
  {
    description: "更轻、更克制的 SaaS 风格。",
    id: "default",
    name: "现代简约",
  },
  {
    description: "绿色主色，适合健康和增长类语境。",
    id: "green",
    name: "Green",
  },
  {
    description: "暖色 Claude 风格。",
    id: "claude",
    name: "Claude",
  },
  {
    description: "咖啡色调，弱光下更温暖。",
    id: "caffeine",
    name: "Caffeine",
  },
  {
    description: "暖橙主色，适合更有活力的工作台。",
    id: "orange",
    name: "Orange",
  },
  {
    description: "玫瑰红主色，整体更柔和醒目。",
    id: "rose",
    name: "Rose",
  },
  {
    description: "Slack 风格的协作配色。",
    id: "slack",
    name: "Slack",
  },
  {
    description: "Supabase 风格的开发者绿色。",
    id: "supabase",
    name: "Supabase",
  },
  {
    description: "日落暖色，界面氛围更强。",
    id: "sunset",
    name: "Sunset",
  },
  {
    description: "自然绿和大地色，观感更有机。",
    id: "nature",
    name: "Nature",
  },
] as const;

export type AppearanceThemeId = (typeof appearanceThemes)[number]["id"];

const appearanceThemeIds = new Set<string>(
  appearanceThemes.map((theme) => theme.id),
);

export function applyAppearanceTheme(themeId: AppearanceThemeId) {
  document.documentElement.dataset.appearanceTheme = themeId;
}

export function getInitialAppearanceTheme(): AppearanceThemeId {
  return readAppearanceTheme() ?? "default";
}

export function isAppearanceThemeId(value: unknown): value is AppearanceThemeId {
  return typeof value === "string" && appearanceThemeIds.has(value);
}

export function readAppearanceTheme(): AppearanceThemeId | undefined {
  try {
    const savedTheme = window.localStorage.getItem(APPEARANCE_THEME_STORAGE_KEY);

    return isAppearanceThemeId(savedTheme) ? savedTheme : undefined;
  } catch {
    return undefined;
  }
}

export function writeAppearanceTheme(themeId: AppearanceThemeId) {
  try {
    window.localStorage.setItem(APPEARANCE_THEME_STORAGE_KEY, themeId);
  } catch {
    // Appearance persistence is best-effort; the applied theme still updates.
  }
}

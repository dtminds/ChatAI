export const APPEARANCE_THEME_STORAGE_KEY = "chat-ai-appearance-theme";

export const appearanceThemes = [
  {
    description: "更轻、更克制的 SaaS 风格。",
    id: "default",
    name: "现代简约",
    previewColors: [
      "oklch(0.62 0.19 259.76)",
      "oklch(0.97 0 0)",
      "oklch(0.2 0 0)",
    ],
  },
  {
    description: "绿色主色，适合健康和增长类语境。",
    id: "green",
    name: "Green",
    previewColors: [
      "oklch(0.723 0.219 149.579)",
      "oklch(0.696 0.17 162.48)",
      "oklch(0.527 0.154 150.069)",
    ],
  },
  {
    description: "暖色 Claude 风格。",
    id: "claude",
    name: "Claude",
    previewColors: [
      "oklch(0.62 0.14 39.04)",
      "oklch(0.92 0.01 92.99)",
      "oklch(0.27 0 106.64)",
    ],
  },
  {
    description: "咖啡色调，弱光下更温暖。",
    id: "caffeine",
    name: "Caffeine",
    previewColors: [
      "oklch(0.4341 0.0392 41.9938)",
      "oklch(0.92 0.0651 74.3695)",
      "oklch(0.9247 0.0524 66.1732)",
    ],
  },
  {
    description: "暖橙主色，适合更有活力的工作台。",
    id: "orange",
    name: "Orange",
    previewColors: [
      "oklch(0.705 0.213 47.604)",
      "oklch(0.967 0.001 286.375)",
      "oklch(0.646 0.222 41.116)",
    ],
  },
  {
    description: "玫瑰红主色，整体更柔和醒目。",
    id: "rose",
    name: "Rose",
    previewColors: [
      "oklch(0.645 0.246 16.439)",
      "oklch(0.967 0.001 286.375)",
      "oklch(0.969 0.015 12.422)",
    ],
  },
  {
    description: "Slack 风格的协作配色。",
    id: "slack",
    name: "Slack",
    previewColors: [
      "oklch(0.37 0.14 323.23)",
      "oklch(0.88 0.02 323.34)",
      "oklch(0.58 0.14 327.21)",
    ],
  },
  {
    description: "Supabase 风格的开发者绿色。",
    id: "supabase",
    name: "Supabase",
    previewColors: [
      "oklch(0.8348 0.1302 160.908)",
      "oklch(0.4365 0.1044 156.7556)",
      "oklch(0.8003 0.1821 151.711)",
    ],
  },
  {
    description: "日落暖色，界面氛围更强。",
    id: "sunset",
    name: "Sunset",
    previewColors: [
      "oklch(0.7357 0.1641 34.7091)",
      "oklch(0.8278 0.1131 57.9984)",
      "oklch(0.2569 0.0169 352.4042)",
    ],
  },
  {
    description: "自然绿和大地色，观感更有机。",
    id: "nature",
    name: "Nature",
    previewColors: [
      "oklch(0.52 0.13 144.17)",
      "oklch(0.9 0.05 146.04)",
      "oklch(0.3 0.04 30.2)",
    ],
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

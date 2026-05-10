export const THEME_STORAGE_KEY = "chat-ai-theme";
export const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "dark" | "light" | "system";

export function applyThemePreference(
  themePreference: ThemePreference,
  isSystemDarkMode: boolean,
) {
  const isDarkMode =
    themePreference === "dark" ||
    (themePreference === "system" && isSystemDarkMode);

  document.documentElement.classList.toggle("dark", isDarkMode);
}

export function getInitialThemePreference(): ThemePreference {
  return readThemePreference() ?? "system";
}

export function getDarkModeMediaQuery() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_MODE_QUERY)
    : undefined;
}

export function readThemePreference(): ThemePreference | undefined {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    return isThemePreference(savedTheme)
      ? savedTheme
      : undefined;
  } catch {
    return undefined;
  }
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function writeThemePreference(theme: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best-effort; the UI state still updates without storage.
  }
}

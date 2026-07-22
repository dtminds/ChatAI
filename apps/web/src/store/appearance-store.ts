import { create } from "zustand";
import {
  APPEARANCE_THEME_STORAGE_KEY,
  type AppearanceThemeId,
  applyAppearanceTheme,
  getInitialAppearanceTheme,
  isAppearanceThemeId,
  writeAppearanceTheme,
} from "@/lib/appearance-theme";
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  applyThemePreference,
  getDarkModeMediaQuery,
  getInitialThemePreference,
  isThemePreference,
  writeThemePreference,
} from "@/lib/theme-preference";

type AppearanceState = {
  appearanceTheme: AppearanceThemeId;
  isSystemDarkMode: boolean;
  setAppearanceTheme: (appearanceTheme: AppearanceThemeId) => void;
  setThemePreference: (themePreference: ThemePreference) => void;
  themePreference: ThemePreference;
};

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  appearanceTheme: "default",
  isSystemDarkMode: false,
  setAppearanceTheme(appearanceTheme) {
    applyAppearanceTheme(appearanceTheme);
    writeAppearanceTheme(appearanceTheme);
    set({ appearanceTheme });
  },
  setThemePreference(themePreference) {
    applyThemePreference(themePreference, get().isSystemDarkMode);
    writeThemePreference(themePreference);
    set({ themePreference });
  },
  themePreference: "system",
}));

let activeSubscriberCount = 0;
let darkModeMediaQuery: MediaQueryList | undefined;

export function subscribeAppearancePreferences() {
  if (activeSubscriberCount === 0) {
    const appearanceTheme = getInitialAppearanceTheme();
    const themePreference = getInitialThemePreference();
    darkModeMediaQuery = getDarkModeMediaQuery();
    const isSystemDarkMode = darkModeMediaQuery?.matches ?? false;

    applyAppearanceTheme(appearanceTheme);
    applyThemePreference(themePreference, isSystemDarkMode);
    useAppearanceStore.setState({
      appearanceTheme,
      isSystemDarkMode,
      themePreference,
    });

    darkModeMediaQuery?.addEventListener("change", handleSystemThemeChange);
    window.addEventListener("storage", handlePreferenceStorageChange);
  }

  activeSubscriberCount += 1;

  return () => {
    activeSubscriberCount -= 1;

    if (activeSubscriberCount > 0) {
      return;
    }

    darkModeMediaQuery?.removeEventListener("change", handleSystemThemeChange);
    darkModeMediaQuery = undefined;
    window.removeEventListener("storage", handlePreferenceStorageChange);
  };
}

function handleSystemThemeChange(event: MediaQueryListEvent) {
  const themePreference = useAppearanceStore.getState().themePreference;

  applyThemePreference(themePreference, event.matches);
  useAppearanceStore.setState({ isSystemDarkMode: event.matches });
}

function handlePreferenceStorageChange(event: StorageEvent) {
  if (event.key === APPEARANCE_THEME_STORAGE_KEY) {
    const appearanceTheme = isAppearanceThemeId(event.newValue)
      ? event.newValue
      : "default";

    applyAppearanceTheme(appearanceTheme);
    useAppearanceStore.setState({ appearanceTheme });
    return;
  }

  if (event.key === THEME_STORAGE_KEY) {
    const themePreference = isThemePreference(event.newValue)
      ? event.newValue
      : "system";
    const isSystemDarkMode = useAppearanceStore.getState().isSystemDarkMode;

    applyThemePreference(themePreference, isSystemDarkMode);
    useAppearanceStore.setState({ themePreference });
  }
}

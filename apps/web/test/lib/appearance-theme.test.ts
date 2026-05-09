import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_THEME_STORAGE_KEY,
  applyAppearanceTheme,
  getInitialAppearanceTheme,
  isAppearanceThemeId,
  writeAppearanceTheme,
} from "@/lib/appearance-theme";

describe("appearance theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.appearanceTheme;
  });

  it("validates supported appearance theme ids", () => {
    expect(isAppearanceThemeId("default")).toBe(true);
    expect(isAppearanceThemeId("modern-minimal")).toBe(false);
    expect(isAppearanceThemeId("green")).toBe(true);
    expect(isAppearanceThemeId("claude")).toBe(true);
    expect(isAppearanceThemeId("caffeine")).toBe(true);
    expect(isAppearanceThemeId("orange")).toBe(true);
    expect(isAppearanceThemeId("rose")).toBe(true);
    expect(isAppearanceThemeId("slack")).toBe(true);
    expect(isAppearanceThemeId("supabase")).toBe(true);
    expect(isAppearanceThemeId("sunset")).toBe(true);
    expect(isAppearanceThemeId("nature")).toBe(true);
    expect(isAppearanceThemeId("unknown")).toBe(false);
  });

  it("reads the saved theme and falls back to default", () => {
    expect(getInitialAppearanceTheme()).toBe("default");

    window.localStorage.setItem(APPEARANCE_THEME_STORAGE_KEY, "green");

    expect(getInitialAppearanceTheme()).toBe("green");

    window.localStorage.setItem(APPEARANCE_THEME_STORAGE_KEY, "modern-minimal");

    expect(getInitialAppearanceTheme()).toBe("default");
  });

  it("applies and persists an appearance theme", () => {
    applyAppearanceTheme("green");
    writeAppearanceTheme("green");

    expect(document.documentElement).toHaveAttribute(
      "data-appearance-theme",
      "green",
    );
    expect(window.localStorage.getItem(APPEARANCE_THEME_STORAGE_KEY)).toBe(
      "green",
    );
  });

  it("still applies when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(getInitialAppearanceTheme()).toBe("default");

    applyAppearanceTheme("caffeine");
    writeAppearanceTheme("caffeine");

    expect(document.documentElement).toHaveAttribute(
      "data-appearance-theme",
      "caffeine",
    );
  });
});

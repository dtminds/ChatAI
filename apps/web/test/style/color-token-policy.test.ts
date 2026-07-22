import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const themeCss = readFileSync(join(sourceRoot, "styles/index.css"), "utf8");
const allowedFiles = new Set([
  "pages/chat/ai-hosting/ai-hosting-palette.ts",
  "pages/chat/lib/chat-agent-hosting-palette.ts",
  "pages/chat/insights/insights-chart-palette.ts",
  "pages/chat/mock-data.ts",
  "pages/chat/components/quick-reply/quick-reply-title-palette.ts",
]);
const checkedExtensions = /\.tsx?$/;
const appearanceThemeBlocks = [
  ...themeCss.matchAll(
    /html(?:\.dark)?\[data-appearance-theme="[^"]+"\]\s*\{[\s\S]*?\n\}/g,
  ),
].map((match) => match[0]);
const rootThemeBlock = themeCss.match(/:root\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
const darkThemeBlock = themeCss.match(/\.dark\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
const hardcodedColorPatterns = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\b(?:rgb|rgba|hsl|hsla)\((?!var\(--)/g,
  /\b(?:bg|text|border|ring|shadow|from|via|to)-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\((?!var\(--))/g,
];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    return checkedExtensions.test(entry) ? [absolutePath] : [];
  });
}

function collectColorViolations() {
  return collectSourceFiles(sourceRoot).flatMap((filePath) => {
    const relativePath = relative(sourceRoot, filePath);

    if (allowedFiles.has(relativePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    return lines.flatMap((line, index) => {
      const matches = hardcodedColorPatterns.flatMap((pattern) => [
        ...line.matchAll(pattern),
      ]);

      return matches.map((match) => ({
        line: index + 1,
        match: match[0],
        path: relativePath,
      }));
    });
  });
}

describe("color token policy", () => {
  test("keeps component UI colors out of TypeScript source", () => {
    expect(collectColorViolations()).toEqual([]);
  });

  test("keeps the modern minimal baseline for default theme tokens", () => {
    expect(themeCss).toContain("--background: oklch(1 0 0);");
    expect(themeCss).toContain("--foreground: oklch(0.2 0 0);");
    expect(themeCss).toContain("--neutral-strong: oklch(0.18 0 0);");
    expect(themeCss).toContain("--neutral-strong-foreground: oklch(1 0 0);");
    expect(themeCss).toContain("--card: oklch(1 0 0);");
    expect(themeCss).toContain("--card-foreground: oklch(0.32 0 0);");
    expect(themeCss).toContain("--secondary: oklch(0.97 0 0);");
    expect(themeCss).toContain("--secondary-foreground: oklch(0.45 0.03 257.68);");
    expect(themeCss).toContain("--muted: oklch(0.98 0 0);");
    expect(themeCss).toContain("--background: oklch(0.2 0 0);");
    expect(themeCss).toContain("--foreground: oklch(0.92 0 0);");
    expect(themeCss).toContain("--neutral-strong: oklch(0.92 0 0);");
    expect(themeCss).toContain("--neutral-strong-foreground: oklch(0.18 0 0);");
    expect(themeCss).toContain("--card: oklch(0.27 0 0);");
    expect(themeCss).toContain("--secondary: oklch(0.27 0 0);");
    expect(themeCss).toContain("--muted: oklch(0.27 0 0);");
  });

  test("does not keep custom avatar gradient theme tokens", () => {
    expect(themeCss).not.toContain("--avatar-start");
    expect(themeCss).not.toContain("--avatar-end");
  });

  test("keeps generic and Chinese font fallbacks in the sans stack", () => {
    expect(themeCss).toContain("ui-sans-serif");
    expect(themeCss).toContain("system-ui");
    expect(themeCss).toContain("sans-serif");
    expect(themeCss).not.toContain("\"ui-sans-serif\"");
    expect(themeCss).not.toContain("\"system-ui\"");
    expect(themeCss).not.toContain("\"sans-serif\"");
    expect(themeCss).toContain("\"PingFang SC\"");
    expect(themeCss).toContain("\"Hiragino Sans GB\"");
    expect(themeCss).toContain("\"Microsoft YaHei\"");
  });

  test("exposes shadcn sidebar theme tokens", () => {
    expect(themeCss).toContain("--sidebar: oklch(0.98 0 0);");
    expect(themeCss).toContain("--sidebar-foreground: oklch(0.14 0 0);");
    expect(themeCss).toContain("--sidebar-primary: oklch(0.2 0 0);");
    expect(themeCss).toContain("--sidebar-accent: oklch(0.955 0 0);");
    expect(themeCss).toContain("--sidebar-border: oklch(0.92 0 0);");
    expect(themeCss).toContain("--color-sidebar: var(--sidebar);");
    expect(themeCss).toContain("--color-sidebar-accent: var(--sidebar-accent);");
  });

  test("uses blue only for primary, ring, info, and avatar", () => {
    expect(themeCss).toContain("--primary: oklch(0.62 0.19 259.76);");
    expect(themeCss).toContain("--primary-foreground: oklch(1 0 0);");
    expect(themeCss).toContain("--ring: oklch(0.62 0.19 259.76);");
    expect(themeCss).toContain("--info: var(--primary);");
    expect(themeCss).not.toContain("--info-muted");
    expect(themeCss).not.toContain("--color-info-muted");
  });

  test("keeps surface aliases mapped to shadcn tokens without custom state tokens", () => {
    expect(themeCss).toContain("--surface-hover: var(--accent);");
    expect(themeCss).toContain("--divider: color-mix(in oklch, var(--border) 62%, transparent);");
    expect(themeCss).toContain("--divider: color-mix(in oklch, var(--border) 72%, transparent);");
    expect(themeCss).not.toContain("--surface-active");
    expect(themeCss).not.toContain("--surface-selected");
    expect(themeCss).not.toContain("--color-surface-active");
    expect(themeCss).not.toContain("--color-surface-selected");
  });

  test("separates muted surfaces from cards in dark themes that previously collapsed", () => {
    const nestedSurface =
      "--surface-muted: color-mix(in oklch, var(--card) 94%, var(--foreground));";
    const affectedThemeSelectors = ["green", "slack", "sunset", "nature"];

    expect(rootThemeBlock).toContain("--surface-muted: var(--muted);");
    expect(darkThemeBlock).toContain(nestedSurface);

    for (const themeId of affectedThemeSelectors) {
      const block = themeCss.match(
        new RegExp(
          `html\\.dark\\[data-appearance-theme="${themeId}"\\]\\s*\\{[\\s\\S]*?\\n\\}`,
        ),
      )?.[0];

      expect(block).toContain(nestedSurface);
    }
  });

  test("exposes workbench conversation state tokens", () => {
    expect(themeCss).toContain("--conversation-active: linear-gradient(");
    expect(themeCss).toContain("111deg,");
    expect(themeCss).toContain("oklch(0.6079 0.1899 257.09) 0%,");
    expect(themeCss).toContain("oklch(0.6926 0.1605 258.85) 100%");
    expect(themeCss).toContain("--conversation-active-foreground: oklch(1 0 0);");
    expect(themeCss).toContain("--conversation-active-muted-foreground:");
    expect(themeCss).toContain("--conversation-active-icon: oklch(0.9 0.08 259.76);");
    expect(themeCss).toContain("--conversation-hover: var(--surface-hover);");
    expect(themeCss).toContain("--color-conversation-active: var(--conversation-active);");
    expect(themeCss).toContain("--color-conversation-active-foreground: var(--conversation-active-foreground);");
    expect(themeCss).toContain("--color-conversation-active-muted-foreground: var(--conversation-active-muted-foreground);");
    expect(themeCss).toContain("--color-conversation-active-icon: var(--conversation-active-icon);");
    expect(themeCss).toContain("--color-conversation-hover: var(--conversation-hover);");
    expect(themeCss).toContain("--color-neutral-strong: var(--neutral-strong);");
    expect(themeCss).toContain("--color-neutral-strong-foreground: var(--neutral-strong-foreground);");
    expect(themeCss).not.toContain("--message-agent");
    expect(themeCss).not.toContain("--message-customer");
    expect(themeCss).not.toContain("--color-message-agent");
    expect(themeCss).not.toContain("--color-message-customer");
  });

  test("defines workbench conversation tokens for every appearance theme", () => {
    expect(appearanceThemeBlocks).toHaveLength(18);

    for (const block of appearanceThemeBlocks) {
      expect(block).toContain("--conversation-active: linear-gradient(");
      expect(block).toContain("--conversation-active-foreground:");
      expect(block).toContain("--conversation-active-muted-foreground:");
      expect(block).toContain("--conversation-active-icon:");
      expect(block).toContain("--conversation-hover: var(--surface-hover);");
    }
  });
});

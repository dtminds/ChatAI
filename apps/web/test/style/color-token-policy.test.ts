import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const themeCss = readFileSync(join(sourceRoot, "styles/index.css"), "utf8");
const allowedFiles = new Set(["pages/chat/mock-data.ts", "styles/index.css"]);
const checkedExtensions = /\.(css|ts|tsx)$/;
const hardcodedColorPatterns = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\b(?:rgb|rgba|hsl|hsla)\(/g,
  /\b(?:bg|text|border|ring|shadow|from|via|to)-\[[^\]]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/g,
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
  test("keeps source UI colors behind theme tokens", () => {
    expect(collectColorViolations()).toEqual([]);
  });

  test("keeps the modern minimal baseline for default theme tokens", () => {
    expect(themeCss).toContain("--background: oklch(1 0 0);");
    expect(themeCss).toContain("--foreground: oklch(0.32 0 0);");
    expect(themeCss).toContain("--card: oklch(1 0 0);");
    expect(themeCss).toContain("--card-foreground: oklch(0.32 0 0);");
    expect(themeCss).toContain("--secondary: oklch(0.97 0 0);");
    expect(themeCss).toContain("--secondary-foreground: oklch(0.45 0.03 257.68);");
    expect(themeCss).toContain("--muted: oklch(0.98 0 0);");
    expect(themeCss).toContain("--background: oklch(0.2 0 0);");
    expect(themeCss).toContain("--foreground: oklch(0.92 0 0);");
    expect(themeCss).toContain("--card: oklch(0.27 0 0);");
    expect(themeCss).toContain("--secondary: oklch(0.27 0 0);");
    expect(themeCss).toContain("--muted: oklch(0.27 0 0);");
  });

  test("does not keep custom avatar gradient theme tokens", () => {
    expect(themeCss).not.toContain("--avatar-start");
    expect(themeCss).not.toContain("--avatar-end");
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
    expect(themeCss).not.toContain("--message-agent");
    expect(themeCss).not.toContain("--message-customer");
    expect(themeCss).not.toContain("--color-message-agent");
    expect(themeCss).not.toContain("--color-message-customer");
  });
});

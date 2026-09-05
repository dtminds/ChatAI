import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const allowedFiles = new Set([
  "pages/chat/ai-hosting/ai-hosting-palette.ts",
  "pages/chat/lib/chat-agent-hosting-palette.ts",
  "pages/chat/insights/insights-chart-palette.ts",
  "pages/chat/mock-data.ts",
  "pages/chat/components/quick-reply/quick-reply-title-palette.ts",
]);
const checkedExtensions = /\.tsx?$/;
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










});

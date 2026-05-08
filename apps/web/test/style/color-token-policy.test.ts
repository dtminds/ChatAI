import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const sourceRoot = join(process.cwd(), "src");
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
});

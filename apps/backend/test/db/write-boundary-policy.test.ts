import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { WRITABLE_TABLES } from "../../src/db/writable-tables.js";

const sourceRoot = join(process.cwd(), "src");
const sourceExtensions = /\.ts$/;
const writeCallPattern =
  /\.(?:insertInto|updateTable|deleteFrom)\(\s*["'](xy_wap_embed_[^"']+)["']/g;
const kyselyEntrypointAllowedFiles = new Set(["db/mysql.ts"]);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    return sourceExtensions.test(entry) ? [absolutePath] : [];
  });
}

function collectDbWriteViolations() {
  const writableTables = new Set<string>(WRITABLE_TABLES);

  return collectSourceFiles(sourceRoot).flatMap((filePath) => {
    const relativePath = relative(sourceRoot, filePath);
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    return lines.flatMap((line, index) => {
      const matches = [...line.matchAll(writeCallPattern)];

      return matches
        .map((match) => match[1])
        .filter((table) => !writableTables.has(table))
        .map((table) => ({
          line: index + 1,
          path: relativePath,
          table,
        }));
    });
  });
}

function collectKyselyEntrypointViolations() {
  return collectSourceFiles(sourceRoot).flatMap((filePath) => {
    const relativePath = relative(sourceRoot, filePath);

    if (kyselyEntrypointAllowedFiles.has(relativePath)) {
      return [];
    }

    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    return lines.flatMap((line, index) => {
      if (!line.includes("mysql2") && !line.includes("new Kysely")) {
        return [];
      }

      return [{ line: index + 1, path: relativePath, source: line.trim() }];
    });
  });
}

describe("database write boundary policy", () => {
  it("keeps xy_wap_embed writes inside the Node-owned table whitelist", () => {
    expect(collectDbWriteViolations()).toEqual([]);
  });

  it("keeps MySQL/Kysely construction behind the db plugin entrypoint", () => {
    expect(collectKyselyEntrypointViolations()).toEqual([]);
  });
});

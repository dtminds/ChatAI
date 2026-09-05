import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

function check(http: string, backend = "export {};", helper = "export {};") {
  const root = mkdtempSync(path.join(tmpdir(), "http-boundary-"));
  directories.push(root);
  const app = path.join(root, "apps/backend");
  const files: Record<string, string> = {
    "apps/backend/tsconfig.json": JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", paths: {
      "@chatai/insights/worker": ["../../packages/insights/src/worker.ts"],
    } }, include: ["src/**/*.ts"] }),
    "apps/backend/src/app.ts": backend,
    "packages/insights/src/http.ts": http,
    "packages/insights/src/helper.ts": helper,
    "packages/insights/src/worker.ts": "export const runtime = 1;",
    "packages/insights/src/llm-provider.ts": "export class Provider {}",
    "packages/user-memory/src/http.ts": "export {};",
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  mkdirSync(path.join(app, "scripts"));
  copyFileSync(path.resolve("scripts/verify-package-import-boundaries.mjs"), path.join(app, "scripts/check.mjs"));
  symlinkSync(path.resolve("node_modules"), path.join(app, "node_modules"), "dir");
  return spawnSync(process.execPath, [path.join(app, "scripts/check.mjs")], { encoding: "utf8" });
}

it("allows type-only references without loading worker implementations", () => {
  expect(check('export type { Provider } from "./llm-provider.js";').status).toBe(0);
});

it("rejects a transitive HTTP re-export of a provider", () => {
  const result = check('export * from "./helper.js";', undefined, 'export * from "./llm-provider.js";');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("llm-provider.ts");
});

it("rejects Backend worker imports including dynamic imports", () => {
  const result = check("export {};", 'void import("@chatai/insights/worker");');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("@chatai/insights/worker");
});

it("rejects unresolved local edges instead of silently skipping them", () => {
  const result = check('export * from "./missing.js";');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("unresolved ./missing.js");
});

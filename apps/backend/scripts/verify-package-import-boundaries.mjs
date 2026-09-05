import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = path.join(backendRoot, "src");
const forbidden = ["@chatai/insights", "@chatai/user-memory"];
const violations = [];

walk(sourceRoot);

if (violations.length > 0) {
  throw new Error([
    "Backend HTTP production imports must use package subpath entries:",
    ...violations.sort().map((file) => `- ${file}`),
  ].join("\n"));
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;

    const source = fs.readFileSync(filePath, "utf8");
    for (const packageName of forbidden) {
      const pattern = new RegExp(`(?:from|export\\s+(?:type\\s+)?\\*)\\s*[\\"']${packageName}[\\"']`);
      if (pattern.test(source)) {
        violations.push(path.relative(process.cwd(), filePath));
      }
    }
  }
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(packageRoot, "../..");
const entry = path.join(packageRoot, "src/index.ts");

const configPath = ts.findConfigFile(packageRoot, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("Backend Worker tsconfig.json was not found");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) throw new Error(formatDiagnostic(configFile.error));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot);
if (config.errors.length > 0) {
  throw new Error(config.errors.map(formatDiagnostic).join("\n"));
}

const program = ts.createProgram({
  options: { ...config.options, noEmit: true },
  rootNames: [entry],
});
const forbidden = new Set();

for (const sourceFile of program.getSourceFiles()) {
  const sourcePath = normalizePath(sourceFile.fileName);
  const relative = path.relative(repoRoot, sourcePath).replaceAll(path.sep, "/");

  if (relative.startsWith("apps/backend/")) {
    forbidden.add(relative);
  }
  if (relative.startsWith("apps/workflow-worker/") || relative.startsWith("packages/workflow-")) {
    forbidden.add(relative);
  }

  collectForbiddenSpecifiers(sourceFile, forbidden);
}

if (forbidden.size > 0) {
  throw new Error([
    "Backend Worker production import graph contains forbidden Backend or Workflow dependencies:",
    ...[...forbidden].sort().map((item) => `- ${item}`),
  ].join("\n"));
}

function collectForbiddenSpecifiers(sourceFile, output) {
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      if (
        specifier === "@chatai/backend" ||
        specifier === "@chatai/workflow-engine" ||
        specifier === "@chatai/workflow-runtime" ||
        specifier === "@chatai/workflow-worker"
      ) {
        output.add(specifier);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function normalizePath(filePath) {
  return fs.realpathSync(filePath);
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

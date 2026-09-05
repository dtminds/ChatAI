import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const backendRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = path.resolve(backendRoot, "../..");
const configFile = ts.readConfigFile(path.join(backendRoot, "tsconfig.json"), ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, backendRoot);
if (config.errors.length) throw new Error(config.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, "\n")).join("\n"));
const entries = [
  ...config.fileNames,
  path.join(repoRoot, "packages/insights/src/http.ts"),
  path.join(repoRoot, "packages/user-memory/src/http.ts"),
];
const visited = new Set();
const violations = new Set();
const forbidden = /packages\/(?:insights|user-memory)\/src\/(?:index|worker|insights-worker|insights-worker-runtime|insights-worker\.repository|insights-worker-observability|llm-provider|current-analysis-output-reader|worker-feature-config-mapper|user-memory-provider|user-memory-worker|user-memory-worker-runtime|user-memory-worker-observability)\.ts$/;

for (const entry of entries) walk(entry);
if (violations.size) throw new Error(`HTTP import boundary violations:\n${[...violations].sort().join("\n")}`);
console.log(`HTTP runtime import graph verified (${visited.size} modules)`);

function walk(file) {
  file = fs.realpathSync(file);
  if (visited.has(file)) return;
  visited.add(file);
  const relative = path.relative(repoRoot, file).split(path.sep).join("/");
  if (forbidden.test(relative)) violations.add(relative);
  // Inspect emitted imports: type-only edges do not load Worker implementations.
  const emitted = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { ...config.options, declaration: false, declarationMap: false, sourceMap: false },
    fileName: file,
  }).outputText;
  const source = ts.createSourceFile(file, emitted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      if (/^@chatai\/(insights|user-memory)(\/worker)?$/.test(name)) violations.add(`${relative}: ${name}`);
      const resolved = ts.resolveModuleName(name, file, config.options, ts.sys).resolvedModule;
      if (resolved && !resolved.resolvedFileName.includes("node_modules") && !resolved.resolvedFileName.endsWith(".d.ts")) walk(resolved.resolvedFileName);
      else if (!resolved && (name.startsWith(".") || name.startsWith("@chatai/"))) violations.add(`${relative}: unresolved ${name}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

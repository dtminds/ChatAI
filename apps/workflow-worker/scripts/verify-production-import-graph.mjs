import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultEntry = path.join(packageRoot, "src/index.ts");

export function verifyProductionImportGraph(entry = defaultEntry) {
  const configPath = ts.findConfigFile(packageRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) throw new Error("Workflow Worker tsconfig.json was not found");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(formatDiagnostic(configFile.error));
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, packageRoot);
  if (config.errors.length > 0) {
    throw new Error(config.errors.map(formatDiagnostic).join("\n"));
  }

  const program = ts.createProgram({
    options: { ...config.options, noEmit: true },
    rootNames: [path.resolve(entry)],
  });
  const forbiddenFiles = new Set();
  const forbiddenSpecifiers = new Set();
  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = normalizePath(sourceFile.fileName);
    if (!isInsidePackage(sourcePath)) continue;
    if (isForbiddenPath(sourcePath)) {
      forbiddenFiles.add(path.relative(packageRoot, sourcePath));
    }
    collectForbiddenSpecifiers(sourceFile, forbiddenSpecifiers);
  }
  if (forbiddenFiles.size === 0 && forbiddenSpecifiers.size === 0) return;

  throw new Error([
    "Workflow Worker production import graph contains test-only or Fake dependencies:",
    ...[...forbiddenFiles, ...forbiddenSpecifiers].sort().map(item => `- ${item}`),
  ].join("\n"));
}

function collectForbiddenSpecifiers(sourceFile, output) {
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      && isForbiddenSpecifier(node.moduleSpecifier.text)) {
      output.add(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function isForbiddenPath(filePath) {
  const segments = path.relative(packageRoot, filePath).split(path.sep);
  return (segments[0] === "test" && segments[1] === "support")
    || segments.some(isFakeSegment);
}

function isForbiddenSpecifier(specifier) {
  const segments = specifier.replaceAll("\\", "/").split("/");
  return segments.some(isFakeSegment)
    || segments.some((segment, index) => segment === "test" && segments[index + 1] === "support");
}

function isFakeSegment(segment) {
  return /(^|[-_.])fake([-_.]|$)/i.test(segment);
}

function isInsidePackage(filePath) {
  const relativePath = path.relative(packageRoot, filePath);
  return relativePath !== "" && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

function normalizePath(filePath) {
  return fs.realpathSync(filePath);
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function parseEntryArgument(argv) {
  const index = argv.indexOf("--entry");
  if (index === -1) return defaultEntry;
  const value = argv[index + 1];
  if (!value) throw new Error("--entry requires a file path");
  return path.resolve(packageRoot, value);
}

if (process.argv[1]
  && normalizePath(process.argv[1]) === normalizePath(fileURLToPath(import.meta.url))) {
  try {
    verifyProductionImportGraph(parseEntryArgument(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

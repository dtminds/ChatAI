#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { parse: parseEnv } = require("dotenv");

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(appDir, "src/db/schema.ts");
const envFile = path.join(appDir, ".env.local");
const configFile = path.join(appDir, "scripts/codegen-db.config.json");
const codegenBin = path.join(appDir, "node_modules/.bin/kysely-codegen");

function parseTablePatterns(args) {
  return args.flatMap((arg) => {
    if (arg === "--") {
      return [];
    }

    return arg
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });
}

function readConfiguredTables() {
  if (!existsSync(configFile)) {
    return [];
  }

  const config = JSON.parse(readFileSync(configFile, "utf8"));

  if (!Array.isArray(config.tables)) {
    throw new Error(`${configFile} must contain a "tables" array`);
  }

  return config.tables.map((table) => {
    if (typeof table !== "string") {
      throw new Error(`${configFile} tables must be strings`);
    }

    return table.trim();
  }).filter(Boolean);
}

const cliTables = parseTablePatterns(process.argv.slice(2));
const tables = cliTables.length > 0 ? cliTables : readConfiguredTables();

if (tables.length === 0) {
  console.error(`No tables configured. Add table patterns to ${configFile}.`);
  console.error("Temporary override: pnpm backend:db:codegen -- qywx_account qywx_message");
  process.exit(1);
}

const invalidTable = tables.find((table) => !/^[A-Za-z0-9_.$*?-]+$/.test(table));

if (invalidTable) {
  console.error(`Invalid table name or pattern: ${invalidTable}`);
  process.exit(1);
}

function getDatabaseUrl() {
  if (!existsSync(envFile)) {
    throw new Error(`DATABASE_URL is missing. Create ${envFile} first.`);
  }

  const env = parseEnv(readFileSync(envFile, "utf8"));

  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is missing in ${envFile}`);
  }

  return env.DATABASE_URL;
}

function appendDatabaseAlias(output) {
  if (!output.includes("export interface DB")) {
    return output;
  }

  return `${output.trimEnd()}\n\nexport type Database = DB;\n`;
}

const databaseUrl = getDatabaseUrl();
const includePattern = tables.length === 1 ? tables[0] : `{${tables.join(",")}}`;
const result = spawnSync(
  codegenBin,
  [
    "--url",
    databaseUrl,
    "--out-file",
    outFile,
    "--dialect",
    "mysql",
    "--include-pattern",
    includePattern,
    "--type-only-imports",
    "true",
    "--log-level",
    "info",
  ],
  { cwd: appDir, stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

writeFileSync(outFile, appendDatabaseAlias(readFileSync(outFile, "utf8")));
console.log(`Generated ${tables.length} configured table${tables.length === 1 ? "" : "s"}: ${tables.join(", ")}`);

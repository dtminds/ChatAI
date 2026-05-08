#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { Kysely, MysqlDialect } = require("kysely");
const { parse: parseEnv } = require("dotenv");
const mysql = require("mysql2");
const { serializeFromMetadata } = require("kysely-codegen/dist/generator/generator/generate.js");
const { MysqlDialect: CodegenMysqlDialect } = require("kysely-codegen/dist/generator/dialects/mysql/mysql-dialect.js");
const { Logger } = require("kysely-codegen/dist/generator/logger/logger.js");
const { DatabaseMetadata } = require("kysely-codegen/dist/introspector/metadata/database-metadata.js");
const { EnumCollection } = require("kysely-codegen/dist/introspector/enum-collection.js");
const { TableMatcher } = require("kysely-codegen/dist/introspector/table-matcher.js");

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(appDir, "src/db/schema.ts");
const envFile = path.join(appDir, ".env.local");
const configFile = path.join(appDir, "scripts/codegen-db.config.json");

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
const db = new Kysely({
  dialect: new MysqlDialect({
    pool: mysql.createPool(databaseUrl),
  }),
});

try {
  const allTables = await db.introspection.getTables();
  const matchers = tables.map((table) => new TableMatcher(table));
  const matchedTables = allTables.filter((table) =>
    matchers.some((matcher) => matcher.match(table.schema, table.name)),
  );

  if (matchedTables.length === 0) {
    console.error(`No tables matched: ${tables.join(", ")}`);
    process.exit(1);
  }

  const metadata = new DatabaseMetadata({
    enums: new EnumCollection(),
    tables: matchedTables,
  });
  const output = appendDatabaseAlias(
    serializeFromMetadata({
      dialect: new CodegenMysqlDialect(),
      logger: new Logger("info"),
      metadata,
      startTime: performance.now(),
      typeOnlyImports: true,
    }),
  );

  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, output);
  console.log(
    `Generated ${matchedTables.length} table${matchedTables.length === 1 ? "" : "s"}: ${matchedTables
      .map((table) => table.name)
      .join(", ")}`,
  );
} finally {
  await db.destroy();
}

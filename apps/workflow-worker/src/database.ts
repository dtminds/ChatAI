import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import type { Database } from "@chatai/database";

export function createWorkflowDatabase(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    bigNumberStrings: true,
    connectionLimit: 30,
    connectTimeout: 3_000,
    queueLimit: 200,
    supportBigNumbers: true,
    timezone: "+08:00",
    waitForConnections: true,
  });
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
}

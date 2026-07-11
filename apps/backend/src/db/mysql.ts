import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import type { Database } from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    bigNumberStrings: true,
    // MySQL DATETIME values are stored and read as Asia/Shanghai wall-clock time.
    timezone: "+08:00",
    supportBigNumbers: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 200,
    connectTimeout: 3000,
  });

  return new Kysely<Database>({
    dialect: new MysqlDialect({ pool }),
  });
}

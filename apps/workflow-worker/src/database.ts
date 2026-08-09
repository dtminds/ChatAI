import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import type { WorkflowDatabase } from "@chatai/workflow-runtime";

export function createWorkflowDatabase(databaseUrl: string) {
  const pool = mysql.createPool({
    uri: databaseUrl,
    bigNumberStrings: true,
    connectionLimit: 10,
    connectTimeout: 3_000,
    queueLimit: 200,
    supportBigNumbers: true,
    timezone: "+08:00",
    waitForConnections: true,
  });
  return new Kysely<WorkflowDatabase>({ dialect: new MysqlDialect({ pool }) });
}

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";
import {
  MysqlWorkflowRuntimeRepository,
  MysqlWorkflowLlmTestAttemptRepository,
  type WorkflowDatabase,
} from "../src/index.js";
import { runWorkflowRuntimeRepositoryContract } from "./support/runtime-repository-contract.js";
import { runWorkflowLlmTestAttemptRepositoryContract } from "./support/llm-test-attempt-repository-contract.js";

const WORKFLOW_TABLE_PATTERN = /CREATE TABLE IF NOT EXISTS (xy_wap_embed_workflow_[a-z_]+)[\s\S]*?\n\) COMMENT='[^']*';/g;

describe("MySQL workflow runtime repository contract", () => {
  const databaseName = `chatai_workflow_contract_${process.pid}_${randomBytes(6).toString("hex")}`;
  const connectionOptions = readMysqlTestConnectionOptions();
  const adminPool = mysql.createPool({
    ...connectionOptions,
    bigNumberStrings: true,
    connectionLimit: 2,
    supportBigNumbers: true,
    timezone: "+08:00",
  });
  let database: Kysely<WorkflowDatabase> | undefined;
  let workflowPool: ReturnType<typeof mysql.createPool> | undefined;
  let workflowTableNames: string[] = [];

  beforeAll(async () => {
    await adminPool.promise().query("SET GLOBAL time_zone = '+08:00'");
    await adminPool.promise().query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    workflowPool = mysql.createPool({
      ...connectionOptions,
      database: databaseName,
      bigNumberStrings: true,
      connectionLimit: 10,
      supportBigNumbers: true,
      timezone: "+08:00",
    });
    database = new Kysely<WorkflowDatabase>({
      dialect: new MysqlDialect({ pool: workflowPool }),
    });

    const schemaSql = await readFile(
      new URL("../../../docs/db/schema.sql", import.meta.url),
      "utf8",
    );
    const workflowTables = [...schemaSql.matchAll(WORKFLOW_TABLE_PATTERN)];
    if (workflowTables.length === 0) {
      throw new Error("No Workflow CREATE TABLE statements found in docs/db/schema.sql");
    }
    workflowTableNames = workflowTables.map((match) => match[1]!);
    for (const match of workflowTables) {
      await workflowPool.promise().query(match[0]);
    }
  });

  beforeEach(async () => {
    if (!database || !workflowPool) throw new Error("MySQL contract database is not initialized");
    for (const tableName of [...workflowTableNames].reverse()) {
      await workflowPool.promise().query(`TRUNCATE TABLE \`${tableName}\``);
    }
    await database.insertInto("xy_wap_embed_workflow_definition").values({
      biz_status: 1,
      client_request_id: null,
      description: "",
      draft_json: "{}",
      draft_schema_version: 1,
      draft_version: 1,
      id: "31",
      name: "Repository contract",
      op_sub_uid: "1",
      published_revision: 1,
      runtime_status: "active",
      status_reason: null,
      uid: 9,
      validated_draft_version: 1,
      workflow_type: 1,
    }).executeTakeFirstOrThrow();
  });

  afterAll(async () => {
    if (database) await database.destroy();
    await adminPool.promise().query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await adminPool.promise().end();
  });

  runWorkflowRuntimeRepositoryContract(() => {
    if (!database) throw new Error("MySQL contract database is not initialized");
    const contractDatabase = database;
    const repository = new MysqlWorkflowRuntimeRepository(contractDatabase);
    return {
      repository,
      async setRunStatus(runId, status) {
        await contractDatabase.updateTable("xy_wap_embed_workflow_run")
          .set({ status })
          .where("uid", "=", 9)
          .where("id", "=", runId)
          .executeTakeFirstOrThrow();
      },
      async setWorkflowRuntimeStatus(status, transitionedAt = new Date("2099-01-01T00:00:00.000Z")) {
        await contractDatabase.transaction().execute(async transaction => {
          await transaction.updateTable("xy_wap_embed_workflow_definition")
            .set({ runtime_status: status })
            .where("uid", "=", 9)
            .where("id", "=", "31")
            .executeTakeFirstOrThrow();
          await new MysqlWorkflowRuntimeRepository(transaction).transitionInferenceJobs({
            transitionedAt,
            transition: status === "paused" ? "pause" : status === "active" ? "resume" : "cancel",
            uid: 9,
            workflowIds: ["31"],
          });
        });
      },
    };
  });

  describe("LLM test Attempt repository", () => {
    runWorkflowLlmTestAttemptRepositoryContract(() => {
      if (!database) throw new Error("MySQL contract database is not initialized");
      return new MysqlWorkflowLlmTestAttemptRepository(database);
    });
  });
});

function readMysqlTestConnectionOptions() {
  return {
    host: readRequiredEnv("WORKFLOW_TEST_MYSQL_HOST"),
    password: readRequiredEnv("WORKFLOW_TEST_MYSQL_PASSWORD"),
    port: Number(readRequiredEnv("WORKFLOW_TEST_MYSQL_PORT")),
    user: readRequiredEnv("WORKFLOW_TEST_MYSQL_USER"),
  };
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the MySQL Repository Contract`);
  return value;
}

import {
  WorkflowExecutionNodeSchema,
  WorkflowInferenceMessageListRequestSchema,
  WorkflowInferenceMessageListResultSchema,
  WorkflowJsonObjectSchema,
} from "@chatai/contracts";
import { Value } from "@sinclair/typebox/value";
import { sql, type Kysely, type Selectable } from "kysely";
import type { WorkflowDatabase, WorkflowLlmTestAttemptTable } from "./db.js";
import type {
  WorkflowLlmTestAttemptRecord,
  WorkflowLlmTestAttemptRepository,
} from "./types.js";

const TABLE = "xy_wap_embed_workflow_llm_test_attempt" as const;

export class MysqlWorkflowLlmTestAttemptRepository implements WorkflowLlmTestAttemptRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async createLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["createLlmTestAttempt"]>[0]) {
    const inserted = await this.db.insertInto(TABLE).values({
      attempt: 0,
      completed_at: null,
      contract_version: input.contractVersion,
      create_time: input.createdAt,
      deadline_at: input.deadlineAt,
      error_code: null,
      error_message: null,
      execution_key: input.executionKey,
      expires_at: input.expiresAt,
      input_values_json: JSON.stringify(input.inputValues),
      lease_expires_at: null,
      lease_owner: null,
      node_id: input.node.id,
      node_snapshot_json: JSON.stringify(input.node),
      op_sub_uid: input.opSubUserId,
      output_json: null,
      payload_json: JSON.stringify(input.payload),
      result_json: null,
      started_at: null,
      status: "running",
      uid: input.uid,
      workflow_id: input.workflowId,
    }).executeTakeFirstOrThrow();
    if (inserted.insertId === undefined) throw new Error("LLM test Attempt insert did not return an ID");
    const row = await this.db.selectFrom(TABLE).selectAll()
      .where("id", "=", inserted.insertId).executeTakeFirstOrThrow();
    return mapAttempt(row);
  }

  async findLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["findLlmTestAttempt"]>[0]) {
    const row = await this.db.selectFrom(TABLE).selectAll()
      .where("id", "=", input.attemptId)
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .executeTakeFirst();
    return row ? mapAttempt(row) : null;
  }

  async claimLlmTestAttemptBatch(input: Parameters<WorkflowLlmTestAttemptRepository["claimLlmTestAttemptBatch"]>[0]) {
    if (input.limit <= 0) return [];
    return this.db.transaction().execute(async trx => {
      const rows = await trx.selectFrom(TABLE).selectAll()
        .where("status", "=", "running")
        .where("deadline_at", ">", input.now)
        .where("expires_at", ">", input.now)
        .where(eb => eb.or([
          eb("started_at", "is", null),
          eb("lease_expires_at", "<=", input.now),
        ]))
        .orderBy("id", "asc")
        .limit(input.limit)
        .forUpdate()
        .skipLocked()
        .execute();
      if (rows.length === 0) return [];
      const ids = rows.map(row => row.id);
      await trx.updateTable(TABLE).set({
        attempt: eb => eb("attempt", "+", 1),
        lease_expires_at: input.leaseExpiresAt,
        lease_owner: input.leaseOwner,
        started_at: sql`COALESCE(started_at, ${input.now})`,
      }).where("id", "in", ids).where("status", "=", "running").execute();
      const claimed = await trx.selectFrom(TABLE).selectAll()
        .where("id", "in", ids)
        .where("lease_owner", "=", input.leaseOwner)
        .execute();
      return claimed.map(mapAttempt);
    });
  }

  async renewLlmTestAttemptLease(input: Parameters<WorkflowLlmTestAttemptRepository["renewLlmTestAttemptLease"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({ lease_expires_at: input.leaseExpiresAt })
      .where("id", "=", input.attemptId).where("status", "=", "running")
      .where("lease_owner", "=", input.leaseOwner).executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async completeLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["completeLlmTestAttempt"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({
      completed_at: input.completedAt,
      lease_expires_at: null,
      lease_owner: null,
      output_json: JSON.stringify(input.output),
      result_json: JSON.stringify(input.result),
      status: "succeeded",
    }).where("id", "=", input.attemptId).where("status", "=", "running")
      .where("lease_owner", "=", input.leaseOwner).executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async failLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["failLlmTestAttempt"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({
      completed_at: input.failedAt,
      error_code: input.errorCode.slice(0, 128),
      error_message: input.errorMessage.slice(0, 512),
      lease_expires_at: null,
      lease_owner: null,
      status: input.status,
    }).where("id", "=", input.attemptId).where("status", "=", "running")
      .where("lease_owner", "=", input.leaseOwner).executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async cancelLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["cancelLlmTestAttempt"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({
      completed_at: input.cancelledAt,
      lease_expires_at: null,
      lease_owner: null,
      status: "cancelled",
    }).where("id", "=", input.attemptId).where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId).where("status", "=", "running")
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async cleanupExpiredLlmTestAttempts(input: Parameters<WorkflowLlmTestAttemptRepository["cleanupExpiredLlmTestAttempts"]>[0]) {
    if (input.limit <= 0) return 0;
    const rows = await this.db.selectFrom(TABLE).select("id")
      .where("expires_at", "<=", input.now).orderBy("id", "asc").limit(input.limit).execute();
    if (rows.length === 0) return 0;
    const result = await this.db.deleteFrom(TABLE).where("id", "in", rows.map(row => row.id)).executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  async expireTimedOutLlmTestAttempts(input: Parameters<WorkflowLlmTestAttemptRepository["expireTimedOutLlmTestAttempts"]>[0]) {
    if (input.limit <= 0) return 0;
    return this.db.transaction().execute(async trx => {
      const rows = await trx.selectFrom(TABLE).select("id")
        .where("status", "=", "running").where("deadline_at", "<=", input.now)
        .orderBy("id", "asc").limit(input.limit).forUpdate().skipLocked().execute();
      if (rows.length === 0) return 0;
      const result = await trx.updateTable(TABLE).set({
        completed_at: input.now,
        error_code: "WORKFLOW_LLM_TEST_TIMEOUT",
        error_message: "试运行超时",
        lease_expires_at: null,
        lease_owner: null,
        status: "timed_out",
      }).where("id", "in", rows.map(row => row.id)).where("status", "=", "running")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    });
  }

  async expireLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["expireLlmTestAttempt"]>[0]) {
    const result = await this.db.updateTable(TABLE).set({
      completed_at: input.now,
      error_code: "WORKFLOW_LLM_TEST_TIMEOUT",
      error_message: "试运行超时",
      lease_expires_at: null,
      lease_owner: null,
      status: "timed_out",
    }).where("id", "=", input.attemptId)
      .where("uid", "=", input.uid)
      .where("workflow_id", "=", input.workflowId)
      .where("status", "=", "running")
      .where("deadline_at", "<=", input.now)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }
}

export class InMemoryWorkflowLlmTestAttemptRepository implements WorkflowLlmTestAttemptRepository {
  readonly attempts: WorkflowLlmTestAttemptRecord[] = [];
  private nextId = 1n;

  async createLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["createLlmTestAttempt"]>[0]) {
    const record: WorkflowLlmTestAttemptRecord = {
      attempt: 0,
      completedAt: null,
      contractVersion: input.contractVersion,
      createdAt: input.createdAt,
      deadlineAt: input.deadlineAt,
      errorCode: null,
      errorMessage: null,
      executionKey: input.executionKey,
      expiresAt: input.expiresAt,
      id: String(this.nextId++),
      inputValues: structuredClone(input.inputValues),
      leaseExpiresAt: null,
      leaseOwner: null,
      node: structuredClone(input.node),
      nodeId: input.node.id,
      opSubUserId: input.opSubUserId,
      output: null,
      payload: structuredClone(input.payload),
      result: null,
      startedAt: null,
      status: "running",
      uid: input.uid,
      updatedAt: input.createdAt,
      workflowId: input.workflowId,
    };
    this.attempts.push(record);
    return clone(record);
  }

  async findLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["findLlmTestAttempt"]>[0]) {
    const record = this.attempts.find(item => item.id === input.attemptId
      && item.uid === input.uid && item.workflowId === input.workflowId);
    return record ? clone(record) : null;
  }

  async claimLlmTestAttemptBatch(input: Parameters<WorkflowLlmTestAttemptRepository["claimLlmTestAttemptBatch"]>[0]) {
    const claimed = this.attempts.filter(item => item.status === "running"
      && (item.startedAt === null || item.leaseExpiresAt !== null && item.leaseExpiresAt <= input.now)
      && item.deadlineAt > input.now && item.expiresAt > input.now)
      .slice(0, input.limit);
    for (const item of claimed) {
      item.attempt += 1;
      item.leaseExpiresAt = input.leaseExpiresAt;
      item.leaseOwner = input.leaseOwner;
      item.startedAt ??= input.now;
      item.updatedAt = input.now;
    }
    return claimed.map(clone);
  }

  async renewLlmTestAttemptLease(input: Parameters<WorkflowLlmTestAttemptRepository["renewLlmTestAttemptLease"]>[0]) {
    const item = this.leased(input.attemptId, input.leaseOwner);
    if (!item) return false;
    item.leaseExpiresAt = input.leaseExpiresAt;
    return true;
  }

  async completeLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["completeLlmTestAttempt"]>[0]) {
    const item = this.leased(input.attemptId, input.leaseOwner);
    if (!item) return false;
    Object.assign(item, {
      completedAt: input.completedAt,
      leaseExpiresAt: null,
      leaseOwner: null,
      output: clone(input.output),
      result: clone(input.result),
      status: "succeeded" as const,
      updatedAt: input.completedAt,
    });
    return true;
  }

  async failLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["failLlmTestAttempt"]>[0]) {
    const item = this.leased(input.attemptId, input.leaseOwner);
    if (!item) return false;
    Object.assign(item, {
      completedAt: input.failedAt,
      errorCode: input.errorCode.slice(0, 128),
      errorMessage: input.errorMessage.slice(0, 512),
      leaseExpiresAt: null,
      leaseOwner: null,
      status: input.status,
      updatedAt: input.failedAt,
    });
    return true;
  }

  async cancelLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["cancelLlmTestAttempt"]>[0]) {
    const item = this.attempts.find(candidate => candidate.id === input.attemptId
      && candidate.uid === input.uid && candidate.workflowId === input.workflowId
      && candidate.status === "running");
    if (!item) return false;
    Object.assign(item, {
      completedAt: input.cancelledAt,
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "cancelled" as const,
      updatedAt: input.cancelledAt,
    });
    return true;
  }

  async cleanupExpiredLlmTestAttempts(input: Parameters<WorkflowLlmTestAttemptRepository["cleanupExpiredLlmTestAttempts"]>[0]) {
    const ids = this.attempts.filter(item => item.expiresAt <= input.now)
      .slice(0, input.limit).map(item => item.id);
    for (const id of ids) this.attempts.splice(this.attempts.findIndex(item => item.id === id), 1);
    return ids.length;
  }

  async expireTimedOutLlmTestAttempts(input: Parameters<WorkflowLlmTestAttemptRepository["expireTimedOutLlmTestAttempts"]>[0]) {
    const items = this.attempts.filter(item => item.status === "running" && item.deadlineAt <= input.now)
      .slice(0, input.limit);
    for (const item of items) Object.assign(item, {
      completedAt: input.now,
      errorCode: "WORKFLOW_LLM_TEST_TIMEOUT",
      errorMessage: "试运行超时",
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "timed_out" as const,
      updatedAt: input.now,
    });
    return items.length;
  }

  async expireLlmTestAttempt(input: Parameters<WorkflowLlmTestAttemptRepository["expireLlmTestAttempt"]>[0]) {
    const item = this.attempts.find(candidate => candidate.id === input.attemptId
      && candidate.uid === input.uid && candidate.workflowId === input.workflowId
      && candidate.status === "running" && candidate.deadlineAt <= input.now);
    if (!item) return false;
    Object.assign(item, {
      completedAt: input.now,
      errorCode: "WORKFLOW_LLM_TEST_TIMEOUT",
      errorMessage: "试运行超时",
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "timed_out" as const,
      updatedAt: input.now,
    });
    return true;
  }

  private leased(id: string, owner: string) {
    return this.attempts.find(item => item.id === id && item.status === "running" && item.leaseOwner === owner);
  }
}

function mapAttempt(row: Selectable<WorkflowLlmTestAttemptTable>): WorkflowLlmTestAttemptRecord {
  const node = parseJson(row.node_snapshot_json);
  const payload = parseJson(row.payload_json);
  const inputValues = parseJson(row.input_values_json);
  const result = row.result_json === null ? null : parseJson(row.result_json);
  const output = row.output_json === null ? null : parseJson(row.output_json);
  if (!Value.Check(WorkflowExecutionNodeSchema, node)
    || node.kind !== "llm"
    || !Value.Check(WorkflowInferenceMessageListRequestSchema, payload)
    || !Value.Check(WorkflowJsonObjectSchema, inputValues)
    || result !== null && !Value.Check(WorkflowInferenceMessageListResultSchema, result)
    || output !== null && !Value.Check(WorkflowJsonObjectSchema, output)) {
    throw new Error("Invalid Workflow LLM test Attempt payload");
  }
  const status = row.status;
  if (status !== "running" && status !== "succeeded" && status !== "failed"
    && status !== "timed_out" && status !== "cancelled") {
    throw new Error(`Unknown Workflow LLM test Attempt status: ${status}`);
  }
  return {
    attempt: row.attempt,
    completedAt: row.completed_at ? toDate(row.completed_at) : null,
    contractVersion: row.contract_version,
    createdAt: toDate(row.create_time),
    deadlineAt: toDate(row.deadline_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    executionKey: row.execution_key,
    expiresAt: toDate(row.expires_at),
    id: normalizeId(row.id),
    inputValues: structuredClone(inputValues),
    leaseExpiresAt: row.lease_expires_at ? toDate(row.lease_expires_at) : null,
    leaseOwner: row.lease_owner,
    node: structuredClone(node),
    nodeId: row.node_id,
    opSubUserId: normalizeId(row.op_sub_uid),
    output: output ? structuredClone(output) : null,
    payload: structuredClone(payload),
    result: result ? structuredClone(result) : null,
    startedAt: row.started_at ? toDate(row.started_at) : null,
    status,
    uid: Number(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
  };
}

function parseJson(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : structuredClone(value);
}

function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid BIGINT identifier");
}

function toDate(value: Date | string) {
  if (value instanceof Date) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid DATETIME value");
  return date;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

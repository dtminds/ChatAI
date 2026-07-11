import type { WorkflowDraft, WorkflowExecutionSpec, WorkflowRuntimeStatus } from "@chatai/contracts";
import type { Kysely, Transaction } from "kysely";
import type { WorkflowDatabase } from "./workflow-db.js";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";

const DEFINITION_TABLE = "xy_wap_embed_workflow_definition" as const;
const REVISION_TABLE = "xy_wap_embed_workflow_revision" as const;

type WorkflowDbExecutor = Kysely<WorkflowDatabase> | Transaction<WorkflowDatabase>;
type PublishedWriteResult = {
  definition: WorkflowDefinitionRecord;
  revision: WorkflowRevisionRecord;
};

export class MysqlWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async createDefinition(input: Parameters<WorkflowRepository["createDefinition"]>[0]) {
    if (input.clientRequestId) {
      const existing = await this.findDefinitionByRequestId(input.uid, input.clientRequestId);
      if (existing) return existing;
    }

    try {
      const result = await this.db.insertInto(DEFINITION_TABLE).values({
        biz_status: 1,
        client_request_id: input.clientRequestId ?? null,
        draft_json: stringifyJson(input.draft),
        draft_schema_version: 1,
        draft_version: 1,
        name: input.name,
        op_sub_uid: input.opSubUserId,
        published_revision: null,
        runtime_status: "inactive",
        uid: input.uid,
        validated_draft_version: null,
      }).executeTakeFirstOrThrow();

      return this.requireDefinitionById(input.uid, normalizeId(result.insertId));
    } catch (error) {
      if (input.clientRequestId && isDuplicateEntryError(error)) {
        const existing = await this.findDefinitionByRequestId(input.uid, input.clientRequestId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findDefinition(uid: number, workflowId: string) {
    const row = await this.db.selectFrom(DEFINITION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("id", "=", workflowId)
      .where("biz_status", "=", 1)
      .executeTakeFirst();
    return row ? mapDefinition(row) : null;
  }

  async findRevision(uid: number, workflowId: string, revision: number) {
    const row = await this.db.selectFrom(REVISION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .where("revision", "=", revision)
      .executeTakeFirst();
    return row ? mapRevision(row) : null;
  }

  async listDefinitions(uid: number) {
    const rows = await this.db.selectFrom(DEFINITION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("biz_status", "=", 1)
      .orderBy("update_time", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map(mapDefinition);
  }

  async listRevisions(uid: number, workflowId: string) {
    const rows = await this.db.selectFrom(REVISION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .orderBy("revision", "desc")
      .execute();
    return rows.map(mapRevision);
  }

  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]) {
    const updated = await this.db.updateTable(DEFINITION_TABLE).set({
      draft_json: stringifyJson(input.draft),
      draft_version: input.expectedDraftVersion + 1,
      op_sub_uid: input.opSubUserId,
      validated_draft_version: null,
    }).where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1)
      .where("draft_version", "=", input.expectedDraftVersion)
      .where("runtime_status", "!=", "stopped")
      .executeTakeFirst();
    return this.resolveUpdatedDefinition(input.uid, input.workflowId, updated.numUpdatedRows);
  }

  restoreDraft(input: Parameters<WorkflowRepository["restoreDraft"]>[0]) {
    return this.saveDraft(input);
  }

  async renameDefinition(input: Parameters<WorkflowRepository["renameDefinition"]>[0]) {
    const updated = await this.db.updateTable(DEFINITION_TABLE).set({
      name: input.name,
      op_sub_uid: input.opSubUserId,
    }).where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1)
      .where("runtime_status", "!=", "stopped")
      .executeTakeFirst();
    return this.resolveUpdatedDefinition(input.uid, input.workflowId, updated.numUpdatedRows);
  }

  async markDeleted(
    input: Parameters<WorkflowRepository["markDeleted"]>[0],
  ): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      await transaction.updateTable(DEFINITION_TABLE).set({
        biz_status: 0,
        op_sub_uid: input.opSubUserId,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow();
      return success({ ...mapDefinition(row), bizStatus: 0, opSubUserId: input.opSubUserId });
    });
  }

  async markValidated(input: Parameters<WorkflowRepository["markValidated"]>[0]) {
    const updated = await this.db.updateTable(DEFINITION_TABLE).set({
      op_sub_uid: input.opSubUserId,
      validated_draft_version: input.expectedDraftVersion,
    }).where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1)
      .where("draft_version", "=", input.expectedDraftVersion)
      .where("published_revision", "is", null)
      .where("runtime_status", "=", "inactive")
      .executeTakeFirst();
    return this.resolveUpdatedDefinition(input.uid, input.workflowId, updated.numUpdatedRows);
  }

  publishRevision(input: Parameters<WorkflowRepository["publishRevision"]>[0]) {
    return this.writeRevision(input, false);
  }

  enable(input: Parameters<WorkflowRepository["enable"]>[0]) {
    return this.writeRevision({ ...input, expectedPublishedRevision: 0 }, true);
  }

  async setRuntimeStatus(
    input: Parameters<WorkflowRepository["setRuntimeStatus"]>[0],
  ): ReturnType<WorkflowRepository["setRuntimeStatus"]> {
    const updated = await this.db.updateTable(DEFINITION_TABLE).set({
      op_sub_uid: input.opSubUserId,
      runtime_status: input.status,
    }).where("uid", "=", input.uid)
      .where("id", "=", input.workflowId)
      .where("biz_status", "=", 1)
      .where("runtime_status", "in", input.allowedCurrentStatuses)
      .executeTakeFirst();
    if (updated.numUpdatedRows > 0n) {
      return success(await this.requireDefinitionById(input.uid, input.workflowId));
    }
    const definition = await this.findDefinition(input.uid, input.workflowId);
    return definition ? invalidStatus(definition.runtimeStatus) : notFound();
  }

  private writeRevision(
    input: Parameters<WorkflowRepository["publishRevision"]>[0],
    firstEnable: boolean,
  ): Promise<WorkflowMutationResult<PublishedWriteResult>> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      if (definition.draftVersion !== input.expectedDraftVersion) return conflict();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);

      if (firstEnable) {
        if (definition.runtimeStatus !== "inactive"
          || definition.publishedRevision !== null
          || definition.validatedDraftVersion !== definition.draftVersion) {
          return conflict();
        }
      } else if (definition.runtimeStatus === "inactive"
        || definition.publishedRevision !== input.expectedPublishedRevision) {
        return invalidStatus(definition.runtimeStatus);
      }

      const publishedAt = new Date();
      const insert = await transaction.insertInto(REVISION_TABLE).values({
        draft_json: stringifyJson(input.draft),
        dsl_schema_version: input.executionSpec.schemaVersion,
        execution_spec_json: stringifyJson(input.executionSpec),
        publish_sub_uid: input.opSubUserId,
        publish_time: publishedAt,
        revision: input.executionSpec.revision,
        spec_hash: input.specHash,
        uid: input.uid,
        workflow_id: input.workflowId,
      }).executeTakeFirstOrThrow();

      await transaction.updateTable(DEFINITION_TABLE).set({
        op_sub_uid: input.opSubUserId,
        published_revision: input.executionSpec.revision,
        runtime_status: firstEnable ? "active" : definition.runtimeStatus,
        validated_draft_version: definition.draftVersion,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow();

      return success({
        definition: {
          ...definition,
          opSubUserId: input.opSubUserId,
          publishedRevision: input.executionSpec.revision,
          runtimeStatus: firstEnable ? "active" : definition.runtimeStatus,
          updatedAt: publishedAt,
          validatedDraftVersion: definition.draftVersion,
        },
        revision: {
          createdAt: publishedAt,
          draft: structuredClone(input.draft),
          executionSpec: structuredClone(input.executionSpec),
          id: normalizeId(insert.insertId),
          publishedAt,
          publishSubUserId: input.opSubUserId,
          revision: input.executionSpec.revision,
          specHash: input.specHash,
          uid: input.uid,
          workflowId: input.workflowId,
        },
      });
    });
  }

  private async resolveUpdatedDefinition(
    uid: number,
    workflowId: string,
    affectedRows: bigint,
  ): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    if (affectedRows > 0n) {
      return success(await this.requireDefinitionById(uid, workflowId));
    }
    const definition = await this.findDefinition(uid, workflowId);
    if (!definition) return notFound();
    if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
    return conflict();
  }

  private async requireDefinitionById(uid: number, workflowId: string) {
    const definition = await this.findDefinition(uid, workflowId);
    if (!definition) throw new Error("Workflow definition disappeared after write");
    return definition;
  }

  private async findDefinitionByRequestId(uid: number, clientRequestId: string) {
    const row = await this.db.selectFrom(DEFINITION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("client_request_id", "=", clientRequestId)
      .where("biz_status", "=", 1)
      .executeTakeFirst();
    return row ? mapDefinition(row) : null;
  }
}

async function selectDefinitionForUpdate(db: WorkflowDbExecutor, uid: number, workflowId: string) {
  return db.selectFrom(DEFINITION_TABLE).selectAll()
    .where("uid", "=", uid)
    .where("id", "=", workflowId)
    .where("biz_status", "=", 1)
    .forUpdate()
    .executeTakeFirst();
}

function mapDefinition(row: Record<string, unknown>): WorkflowDefinitionRecord {
  return {
    bizStatus: Number(row.biz_status) === 1 ? 1 : 0,
    createdAt: toDate(row.create_time),
    draft: parseJson<WorkflowDraft>(row.draft_json),
    draftSchemaVersion: Number(row.draft_schema_version),
    draftVersion: Number(row.draft_version),
    id: normalizeId(row.id),
    name: String(row.name),
    opSubUserId: normalizeId(row.op_sub_uid),
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    runtimeStatus: parseRuntimeStatus(row.runtime_status),
    uid: Number(row.uid),
    updatedAt: toDate(row.update_time),
    validatedDraftVersion: row.validated_draft_version == null ? null : Number(row.validated_draft_version),
  };
}

function mapRevision(row: Record<string, unknown>): WorkflowRevisionRecord {
  return {
    createdAt: toDate(row.create_time),
    draft: parseJson<WorkflowDraft>(row.draft_json),
    executionSpec: parseJson<WorkflowExecutionSpec>(row.execution_spec_json),
    id: normalizeId(row.id),
    publishedAt: toDate(row.publish_time),
    publishSubUserId: normalizeId(row.publish_sub_uid),
    revision: Number(row.revision),
    specHash: String(row.spec_hash),
    uid: Number(row.uid),
    workflowId: normalizeId(row.workflow_id),
  };
}

function parseRuntimeStatus(value: unknown): WorkflowRuntimeStatus {
  if (value === "inactive" || value === "active" || value === "paused" || value === "stopped") return value;
  throw new Error("Database returned an invalid Workflow runtime status");
}

function parseJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : structuredClone(value)) as T;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

function normalizeId(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  throw new Error("Database returned an invalid BIGINT identifier");
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Database returned an invalid DATETIME value");
  return date;
}

function isDuplicateEntryError(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "ER_DUP_ENTRY");
}

function success<T>(value: T): WorkflowMutationResult<T> {
  return { kind: "success", value };
}

function conflict<T>(): WorkflowMutationResult<T> {
  return { kind: "conflict" };
}

function invalidStatus<T>(status: WorkflowRuntimeStatus): WorkflowMutationResult<T> {
  return { kind: "invalid-status", status };
}

function notFound<T>(): WorkflowMutationResult<T> {
  return { kind: "not-found" };
}

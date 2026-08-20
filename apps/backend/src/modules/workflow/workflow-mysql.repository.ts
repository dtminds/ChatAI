import {
  WORKFLOW_ACTIVE_DEFINITION_LIMIT,
  type WorkflowDraft,
  type WorkflowExecutionSpec,
  type WorkflowRuntimeStatus,
  type WorkflowStatusReason,
  type WorkflowStoredExecutionSpec,
} from "@chatai/contracts";
import {
  decodeWorkflowSubjectType,
  decodeWorkflowType,
  encodeWorkflowSubjectType,
  encodeWorkflowType,
  cancelMysqlEntitlementRuns,
  transitionMysqlWorkflowInferenceJobs,
  type WorkflowDatabase,
} from "@chatai/workflow-runtime";
import { normalizeWorkflowExecutionSpec } from "@chatai/workflow-engine";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowPublishReviewRecord,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";

const DEFINITION_TABLE = "xy_wap_embed_workflow_definition" as const;
const REVISION_TABLE = "xy_wap_embed_workflow_revision" as const;
const REVISION_CLEANUP_TABLE = "xy_wap_embed_workflow_revision_cleanup" as const;
const TRIGGER_BINDING_TABLE = "xy_wap_embed_workflow_trigger_binding" as const;
const REVIEW_TABLE = "xy_wap_embed_workflow_publish_review" as const;

type WorkflowDbExecutor = Kysely<WorkflowDatabase> | Transaction<WorkflowDatabase>;
type PublishedWriteResult = {
  definition: WorkflowDefinitionRecord;
  revision: WorkflowRevisionRecord;
};

export class MysqlWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Kysely<WorkflowDatabase>) {}

  async applyEntitlementLoss(input: Parameters<WorkflowRepository["applyEntitlementLoss"]>[0]) {
    const workflowIds = await this.db.transaction().execute(async (transaction) => {
      const workflowType = encodeWorkflowType(input.workflowType);
      const targetStatuses = input.transition === "pause"
        ? ["active"]
        : ["active", "inactive", "paused"];
      const definitions = await transaction.selectFrom(DEFINITION_TABLE)
        .select("id")
        .where("uid", "=", input.uid)
        .where("workflow_type", "=", workflowType)
        .where("biz_status", "=", 1)
        .where("runtime_status", "in", targetStatuses)
        .forUpdate()
        .execute();
      if (definitions.length === 0) return [];

      const ids = definitions.map((definition) => definition.id);
      await transaction.updateTable(DEFINITION_TABLE).set({
        op_sub_uid: input.opSubUserId,
        runtime_status: input.transition === "pause" ? "paused" : "stopped",
        status_reason: "entitlement_revoked",
      }).where("id", "in", ids).executeTakeFirstOrThrow();
      if (input.transition !== "pause") {
        await transaction.updateTable(REVIEW_TABLE).set({
          review_sub_uid: input.opSubUserId,
          review_time: input.transitionedAt,
          status: "withdrawn",
        }).where("uid", "=", input.uid)
          .where("workflow_id", "in", ids)
          .where("status", "=", "pending")
          .executeTakeFirst();
      }
      await transitionMysqlWorkflowInferenceJobs(transaction, {
        transitionedAt: input.transitionedAt,
        transition: input.transition === "pause" ? "pause" : "cancel",
        uid: input.uid,
        workflowIds: ids.map(normalizeId),
      });
      return ids;
    });
    if (workflowIds.length === 0) return { affectedDefinitions: 0 };
    if (input.transition !== "pause") {
      await cancelMysqlEntitlementRuns(this.db, {
        now: input.transitionedAt,
        uid: input.uid,
        workflowIds,
      });
    }
    return { affectedDefinitions: workflowIds.length };
  }

  async createDefinition(input: Parameters<WorkflowRepository["createDefinition"]>[0]) {
    if (input.clientRequestId) {
      const existing = await this.findDefinitionByRequestId(input.uid, input.clientRequestId);
      if (existing) return toCreateResult(existing, input.workflowType);
    }

    try {
      const result = await this.db.insertInto(DEFINITION_TABLE).values({
        biz_status: 1,
        client_request_id: input.clientRequestId ?? null,
        description: input.description,
        draft_json: stringifyJson(input.draft),
        draft_schema_version: 1,
        draft_semantic_hash: input.draftSemanticHash,
        draft_version: 1,
        name: input.name,
        op_sub_uid: input.opSubUserId,
        published_revision: null,
        published_semantic_hash: null,
        runtime_status: "inactive",
        status_reason: null,
        uid: input.uid,
        workflow_type: encodeWorkflowType(input.workflowType),
      }).executeTakeFirstOrThrow();

      return {
        kind: "success" as const,
        value: await this.requireDefinitionById(input.uid, normalizeId(result.insertId)),
      };
    } catch (error) {
      if (input.clientRequestId && isDuplicateEntryError(error)) {
        const existing = await this.findDefinitionByRequestId(input.uid, input.clientRequestId);
        if (existing) return toCreateResult(existing, input.workflowType);
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

  async findReview(uid: number, workflowId: string, reviewId: string) {
    const row = await this.db.selectFrom(REVIEW_TABLE).selectAll()
      .where("uid", "=", uid).where("workflow_id", "=", workflowId).where("id", "=", reviewId)
      .executeTakeFirst();
    return row ? mapReview(row) : null;
  }

  async findCurrentReview(uid: number, workflowId: string) {
    const definition = await this.findDefinition(uid, workflowId);
    if (!definition) return null;
    let query = this.db.selectFrom(REVIEW_TABLE).selectAll()
      .where("uid", "=", uid).where("workflow_id", "=", workflowId)
      .where("draft_semantic_hash", "=", definition.draftSemanticHash)
      .where("status", "in", ["pending", "approved", "rejected", "withdrawn"]);
    query = definition.publishedRevision === null
      ? query.where("base_published_revision", "is", null)
      : query.where("base_published_revision", "=", definition.publishedRevision);
    const row = await query.orderBy("id", "desc").limit(1).executeTakeFirst();
    return row?.status === "withdrawn" ? null : row ? mapReview(row) : null;
  }

  async listDefinitions(uid: number) {
    const rows = await this.db.selectFrom(DEFINITION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("biz_status", "=", 1)
      .orderBy("create_time", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map(mapDefinition);
  }

  async listRevisions(
    uid: number,
    workflowId: string,
    input: Parameters<WorkflowRepository["listRevisions"]>[2],
  ) {
    let query = this.db.selectFrom(REVISION_TABLE)
      .selectAll()
      .where("uid", "=", uid)
      .where("workflow_id", "=", workflowId)
      .orderBy("revision", "desc");
    if (input.cursor) query = query.where("revision", "<", Number(input.cursor));
    const rows = await query.limit(input.limit + 1).execute();
    const pageRows = rows.slice(0, input.limit);
    const items = pageRows.map(mapRevision);
    return {
      items,
      nextCursor: rows.length > pageRows.length ? String(items.at(-1)!.revision) : null,
    };
  }

  async listReviews(
    uid: number,
    workflowId: string,
    input: Parameters<WorkflowRepository["listReviews"]>[2],
  ) {
    let query = this.db.selectFrom(REVIEW_TABLE).selectAll()
      .where("uid", "=", uid).where("workflow_id", "=", workflowId)
      .orderBy("id", "desc");
    if (input.cursor) query = query.where("id", "<", input.cursor);
    const rows = await query.limit(input.limit + 1).execute();
    const pageRows = rows.slice(0, input.limit);
    const items = pageRows.map(mapReview);
    return {
      items,
      nextCursor: rows.length > pageRows.length ? items.at(-1)!.id : null,
    };
  }

  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.db.transaction().execute(async transaction => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      if (await hasPendingReview(transaction, input.uid, input.workflowId)) return reviewLocked();
      if (definition.draftVersion !== input.expectedDraftVersion) return conflict();
      if (definition.runtimeStatus === "stopped" && !input.layoutOnly) {
        return invalidStatus(definition.runtimeStatus);
      }
      await transaction.updateTable(DEFINITION_TABLE).set({
        draft_json: stringifyJson(input.draft),
        draft_semantic_hash: input.draftSemanticHash,
        draft_version: input.expectedDraftVersion + 1,
        op_sub_uid: input.opSubUserId,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .where("draft_version", "=", input.expectedDraftVersion)
        .executeTakeFirstOrThrow();
      return success(mapDefinition(await transaction.selectFrom(DEFINITION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow()));
    });
  }

  restoreDraft(input: Parameters<WorkflowRepository["restoreDraft"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.saveDraft(input);
  }

  async updateDefinitionMetadata(input: Parameters<WorkflowRepository["updateDefinitionMetadata"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.db.transaction().execute(async transaction => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      if (await hasPendingReview(transaction, input.uid, input.workflowId)) return reviewLocked();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      const metadata: { description?: string; name?: string; op_sub_uid: string } = {
        op_sub_uid: input.opSubUserId,
      };
      if (input.name !== undefined) metadata.name = input.name;
      if (input.description !== undefined) metadata.description = input.description;
      await transaction.updateTable(DEFINITION_TABLE).set(metadata)
        .where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow();
      return success(mapDefinition(await transaction.selectFrom(DEFINITION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow()));
    });
  }

  async markDeleted(
    input: Parameters<WorkflowRepository["markDeleted"]>[0],
  ): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      await transaction.updateTable(DEFINITION_TABLE).set({
        biz_status: 0,
        client_request_id: null,
        op_sub_uid: input.opSubUserId,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow();
      await transaction.updateTable(REVIEW_TABLE).set({
        review_sub_uid: input.opSubUserId,
        review_time: new Date(),
        status: "withdrawn",
      }).where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId)
        .where("status", "=", "pending").executeTakeFirst();
      return success({ ...mapDefinition(row), bizStatus: 0, opSubUserId: input.opSubUserId });
    });
  }

  async submitReview(input: Parameters<WorkflowRepository["submitReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    return this.db.transaction().execute(async transaction => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound<WorkflowPublishReviewRecord>();
      const definition = mapDefinition(row);
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      if (definition.draftVersion !== input.expectedDraftVersion
        || definition.publishedRevision !== input.basePublishedRevision) return conflict();
      let lockedQuery = transaction.selectFrom(REVIEW_TABLE).select("id")
        .where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId)
        .where("draft_semantic_hash", "=", input.draftSemanticHash)
        .where("status", "in", ["pending", "approved"]);
      lockedQuery = input.basePublishedRevision === null
        ? lockedQuery.where("base_published_revision", "is", null)
        : lockedQuery.where("base_published_revision", "=", input.basePublishedRevision);
      const locked = await lockedQuery.executeTakeFirst();
      if (locked) return reviewLocked<WorkflowPublishReviewRecord>();
      const now = new Date();
      const insert = await transaction.insertInto(REVIEW_TABLE).values({
        base_published_revision: input.basePublishedRevision,
        candidate_hash: input.candidateHash,
        change_summary_json: stringifyJson(input.changeSummary),
        checked_at: input.checkedAt,
        draft_json: stringifyJson(input.draft),
        draft_semantic_hash: input.draftSemanticHash,
        execution_spec_json: stringifyJson(input.executionSpec),
        review_comment: null,
        review_sub_uid: null,
        review_time: null,
        publish_sub_uid: null,
        publish_time: null,
        resulting_revision: null,
        source_draft_version: input.expectedDraftVersion,
        status: "pending",
        subject_type: encodeWorkflowSubjectType(input.subjectType),
        submit_sub_uid: input.opSubUserId,
        submit_time: now,
        trigger_bindings_json: stringifyJson(input.triggerBindings),
        uid: input.uid,
        workflow_id: input.workflowId,
        workflow_type: encodeWorkflowType(input.workflowType),
      }).executeTakeFirstOrThrow();
      const reviewId = normalizeId(insert.insertId);
      const review = await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("id", "=", reviewId).executeTakeFirstOrThrow();
      return success(mapReview(review));
    });
  }

  async decideReview(input: Parameters<WorkflowRepository["decideReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    return this.db.transaction().execute(async transaction => {
      const definition = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!definition) return notFound<WorkflowPublishReviewRecord>();
      const reviewRow = await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId)
        .forUpdate()
        .executeTakeFirst();
      if (!reviewRow) return notFound<WorkflowPublishReviewRecord>();
      const review = mapReview(reviewRow);
      if (review.status !== "pending") return reviewInvalidStatus(review.status);
      await transaction.updateTable(REVIEW_TABLE).set({
        review_comment: input.comment,
        review_sub_uid: input.opSubUserId,
        review_time: new Date(),
        status: input.decision,
      }).where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId)
        .where("status", "=", "pending")
        .executeTakeFirstOrThrow();
      return success(mapReview(await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("id", "=", input.reviewId)
        .executeTakeFirstOrThrow()));
    });
  }

  async withdrawReview(input: Parameters<WorkflowRepository["withdrawReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    return this.db.transaction().execute(async transaction => {
      const definition = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!definition) return notFound<WorkflowPublishReviewRecord>();
      const reviewRow = await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId)
        .forUpdate()
        .executeTakeFirst();
      if (!reviewRow) return notFound<WorkflowPublishReviewRecord>();
      const review = mapReview(reviewRow);
      if (review.status !== "pending") {
        return reviewInvalidStatus(review.status);
      }
      await transaction.updateTable(REVIEW_TABLE).set({
        review_comment: null,
        review_sub_uid: input.opSubUserId,
        review_time: new Date(),
        status: "withdrawn",
      }).where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId)
        .where("status", "=", "pending")
        .executeTakeFirstOrThrow();
      return success(mapReview(await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("id", "=", input.reviewId)
        .executeTakeFirstOrThrow()));
    });
  }

  publishRevision(input: Parameters<WorkflowRepository["publishRevision"]>[0]): Promise<WorkflowMutationResult<PublishedWriteResult>> {
    return this.db.transaction().execute(async transaction => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      const reviewRow = await transaction.selectFrom(REVIEW_TABLE).selectAll()
        .where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId).forUpdate().executeTakeFirst();
      if (!reviewRow) return notFound();
      const review = mapReview(reviewRow);
      if (review.status !== "approved") return reviewInvalidStatus(review.status);
      if (review.candidateHash !== input.candidateHash
        || definition.publishedRevision !== review.basePublishedRevision
        || definition.draftSemanticHash !== review.draftSemanticHash) return conflict();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);

      const publishedAt = new Date();
      const nextRevision = (definition.publishedRevision ?? 0) + 1;
      const executionSpec = { ...review.executionSpec, revision: nextRevision };
      const removedWaitNodes = definition.publishedRevision === null
        ? []
        : await findRemovedWaitNodes(transaction, {
            nextSpec: executionSpec,
            previousRevision: definition.publishedRevision,
            uid: input.uid,
            workflowId: input.workflowId,
          });
      const insert = await transaction.insertInto(REVISION_TABLE).values({
        draft_json: stringifyJson(definition.draft),
        dsl_schema_version: executionSpec.schemaVersion,
        execution_spec_json: stringifyJson(executionSpec),
        publish_sub_uid: input.opSubUserId,
        publish_time: publishedAt,
        review_id: review.id,
        revision: nextRevision,
        spec_hash: review.candidateHash,
        subject_type: encodeWorkflowSubjectType(review.subjectType),
        uid: input.uid,
        workflow_id: input.workflowId,
        workflow_type: encodeWorkflowType(review.workflowType),
      }).executeTakeFirstOrThrow();
      await transaction.updateTable(TRIGGER_BINDING_TABLE).set({ status: 0 })
        .where("uid", "=", input.uid).where("workflow_id", "=", input.workflowId).where("status", "=", 1)
        .executeTakeFirst();
      if (review.triggerBindings.length > 0) {
        await transaction.insertInto(TRIGGER_BINDING_TABLE).values(review.triggerBindings.map(binding => ({
          event_type: binding.eventType,
          filter_spec_json: stringifyJson(binding.filter),
          revision: nextRevision,
          status: 1,
          subject_type: encodeWorkflowSubjectType(binding.subjectType),
          uid: input.uid,
          workflow_id: input.workflowId,
        }))).executeTakeFirstOrThrow();
      }
      if (removedWaitNodes.length > 0) {
        await transaction.insertInto(REVISION_CLEANUP_TABLE).values(removedWaitNodes.map(node => ({
          after_run_id: null,
          attempt: 0,
          last_error_code: null,
          lease_expires_at: null,
          lease_owner: null,
          next_attempt_at: publishedAt,
          node_id: node.id,
          node_kind: node.kind,
          revision: nextRevision,
          status: "pending",
          uid: input.uid,
          workflow_id: input.workflowId,
        }))).executeTakeFirstOrThrow();
      }
      await transaction.updateTable(DEFINITION_TABLE).set({
        draft_semantic_hash: review.draftSemanticHash,
        op_sub_uid: input.opSubUserId,
        published_revision: nextRevision,
        published_semantic_hash: review.draftSemanticHash,
      }).where("uid", "=", input.uid).where("id", "=", input.workflowId).executeTakeFirstOrThrow();
      await transaction.updateTable(REVIEW_TABLE).set({
        publish_sub_uid: input.opSubUserId,
        publish_time: publishedAt,
        resulting_revision: nextRevision,
      }).where("uid", "=", input.uid)
        .where("workflow_id", "=", input.workflowId)
        .where("id", "=", input.reviewId)
        .where("status", "=", "approved")
        .executeTakeFirstOrThrow();
      const updated = await transaction.selectFrom(DEFINITION_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.workflowId).executeTakeFirstOrThrow();
      return success({
        definition: mapDefinition(updated),
        revision: {
          createdAt: publishedAt,
          draft: structuredClone(definition.draft),
          executionSpec,
          id: normalizeId(insert.insertId),
          publishedAt,
          publishSubUserId: input.opSubUserId,
          reviewId: review.id,
          revision: nextRevision,
          specHash: review.candidateHash,
          subjectType: review.subjectType,
          uid: input.uid,
          workflowId: input.workflowId,
          workflowType: review.workflowType,
        },
      });
    });
  }

  async enable(input: Parameters<WorkflowRepository["enable"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.db.transaction().execute(async transaction => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      if (definition.runtimeStatus !== "inactive" || definition.publishedRevision === null) {
        return invalidStatus(definition.runtimeStatus);
      }
      if (await hasReachedActiveDefinitionLimit(transaction, input.uid)) return activeLimitExceeded();
      await transaction.updateTable(DEFINITION_TABLE).set({
        op_sub_uid: input.opSubUserId,
        runtime_status: "active",
        status_reason: null,
      }).where("uid", "=", input.uid).where("id", "=", input.workflowId).executeTakeFirstOrThrow();
      return success(mapDefinition(await transaction.selectFrom(DEFINITION_TABLE).selectAll()
        .where("uid", "=", input.uid).where("id", "=", input.workflowId).executeTakeFirstOrThrow()));
    });
  }

  async setRuntimeStatus(
    input: Parameters<WorkflowRepository["setRuntimeStatus"]>[0],
  ): ReturnType<WorkflowRepository["setRuntimeStatus"]> {
    return this.db.transaction().execute(async (transaction) => {
      const row = await selectDefinitionForUpdate(transaction, input.uid, input.workflowId);
      if (!row) return notFound();
      const definition = mapDefinition(row);
      if (!input.allowedCurrentStatuses.includes(definition.runtimeStatus)) {
        return invalidStatus(definition.runtimeStatus);
      }
      if (input.status === "active"
        && await hasReachedActiveDefinitionLimit(transaction, input.uid)) {
        return activeLimitExceeded();
      }
      await transaction.updateTable(DEFINITION_TABLE).set({
        op_sub_uid: input.opSubUserId,
        runtime_status: input.status,
        status_reason: input.statusReason,
      }).where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .where("runtime_status", "=", definition.runtimeStatus)
        .executeTakeFirstOrThrow();
      await transitionMysqlWorkflowInferenceJobs(transaction, {
        transitionedAt: input.transitionedAt,
        transition: input.status === "paused"
          ? "pause"
          : input.status === "active"
            ? "resume"
            : "cancel",
        uid: input.uid,
        workflowIds: [input.workflowId],
      });
      if (input.status === "stopped") {
        await transaction.updateTable(REVIEW_TABLE).set({
          review_sub_uid: input.opSubUserId,
          review_time: input.transitionedAt,
          status: "withdrawn",
        }).where("uid", "=", input.uid)
          .where("workflow_id", "=", input.workflowId)
          .where("status", "=", "pending")
          .executeTakeFirst();
      }
      const updated = await transaction.selectFrom(DEFINITION_TABLE).selectAll()
        .where("uid", "=", input.uid)
        .where("id", "=", input.workflowId)
        .where("biz_status", "=", 1)
        .executeTakeFirstOrThrow();
      return success(mapDefinition(updated));
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

async function findRemovedWaitNodes(
  transaction: Transaction<WorkflowDatabase>,
  input: {
    nextSpec: WorkflowExecutionSpec;
    previousRevision: number;
    uid: number;
    workflowId: string;
  },
) {
  const previous = await transaction.selectFrom(REVISION_TABLE)
    .select("execution_spec_json")
    .where("uid", "=", input.uid)
    .where("workflow_id", "=", input.workflowId)
    .where("revision", "=", input.previousRevision)
    .executeTakeFirst();
  if (!previous) throw new Error("Published Workflow Revision does not exist");
  const previousSpec = normalizeWorkflowExecutionSpec(
    parseJson(previous.execution_spec_json) as WorkflowStoredExecutionSpec,
  );
  const nextNodeIds = new Set(input.nextSpec.nodes.map(node => node.id));
  return previousSpec.nodes.filter(node =>
    (node.kind === "wait" || node.kind === "wait-event")
    && !nextNodeIds.has(node.id));
}

async function selectDefinitionForUpdate(db: WorkflowDbExecutor, uid: number, workflowId: string) {
  return db.selectFrom(DEFINITION_TABLE).selectAll()
    .where("uid", "=", uid)
    .where("id", "=", workflowId)
    .where("biz_status", "=", 1)
    .forUpdate()
    .executeTakeFirst();
}

async function hasReachedActiveDefinitionLimit(db: WorkflowDbExecutor, uid: number) {
  const row = await db.selectFrom(DEFINITION_TABLE)
    .select(({ fn }) => fn.countAll<number>().as("active_count"))
    .where("uid", "=", uid)
    .where("biz_status", "=", 1)
    .where("runtime_status", "=", "active")
    .executeTakeFirstOrThrow();
  return Number(row.active_count) >= WORKFLOW_ACTIVE_DEFINITION_LIMIT;
}

async function hasPendingReview(db: WorkflowDbExecutor, uid: number, workflowId: string) {
  const row = await db.selectFrom(REVIEW_TABLE).select("id")
    .where("uid", "=", uid)
    .where("workflow_id", "=", workflowId)
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Boolean(row);
}

function mapDefinition(row: Record<string, unknown>): WorkflowDefinitionRecord {
  return {
    bizStatus: Number(row.biz_status) === 1 ? 1 : 0,
    createdAt: toDate(row.create_time),
    description: String(row.description ?? ""),
    draft: parseJson<WorkflowDraft>(row.draft_json),
    draftSchemaVersion: Number(row.draft_schema_version),
    draftSemanticHash: String(row.draft_semantic_hash),
    draftVersion: Number(row.draft_version),
    id: normalizeId(row.id),
    name: String(row.name),
    opSubUserId: normalizeId(row.op_sub_uid),
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision),
    publishedSemanticHash: row.published_semantic_hash == null ? null : String(row.published_semantic_hash),
    runtimeStatus: parseRuntimeStatus(row.runtime_status),
    statusReason: parseStatusReason(row.status_reason),
    uid: Number(row.uid),
    updatedAt: toDate(row.update_time),
    workflowType: decodeWorkflowType(row.workflow_type),
  };
}

function mapRevision(row: Record<string, unknown>): WorkflowRevisionRecord {
  return {
    createdAt: toDate(row.create_time),
    draft: parseJson<WorkflowDraft>(row.draft_json),
    executionSpec: normalizeWorkflowExecutionSpec(
      parseJson<WorkflowStoredExecutionSpec>(row.execution_spec_json),
    ),
    id: normalizeId(row.id),
    publishedAt: toDate(row.publish_time),
    publishSubUserId: normalizeId(row.publish_sub_uid),
    reviewId: normalizeId(row.review_id),
    revision: Number(row.revision),
    specHash: String(row.spec_hash),
    subjectType: decodeWorkflowSubjectType(row.subject_type),
    uid: Number(row.uid),
    workflowId: normalizeId(row.workflow_id),
    workflowType: decodeWorkflowType(row.workflow_type),
  };
}

function mapReview(row: Record<string, unknown>): WorkflowPublishReviewRecord {
  const status = row.status;
  if (status !== "pending" && status !== "approved" && status !== "rejected"
    && status !== "withdrawn") {
    throw new Error("Database returned an invalid Workflow review status");
  }
  return {
    basePublishedRevision: row.base_published_revision == null ? null : Number(row.base_published_revision),
    candidateHash: String(row.candidate_hash),
    changeSummary: parseJson(row.change_summary_json),
    checkedAt: toDate(row.checked_at),
    createdAt: toDate(row.create_time),
    draft: parseJson<WorkflowDraft>(row.draft_json),
    draftSemanticHash: String(row.draft_semantic_hash),
    executionSpec: normalizeWorkflowExecutionSpec(
      parseJson<WorkflowStoredExecutionSpec>(row.execution_spec_json),
    ),
    id: normalizeId(row.id),
    publishedAt: row.publish_time == null ? null : toDate(row.publish_time),
    publishedBySubUserId: row.publish_sub_uid == null ? null : normalizeId(row.publish_sub_uid),
    resultingRevision: row.resulting_revision == null ? null : Number(row.resulting_revision),
    reviewComment: row.review_comment == null ? null : String(row.review_comment),
    reviewedAt: row.review_time == null ? null : toDate(row.review_time),
    reviewedBySubUserId: row.review_sub_uid == null ? null : normalizeId(row.review_sub_uid),
    sourceDraftVersion: Number(row.source_draft_version),
    status,
    subjectType: decodeWorkflowSubjectType(row.subject_type),
    submittedAt: toDate(row.submit_time),
    submittedBySubUserId: normalizeId(row.submit_sub_uid),
    triggerBindings: parseJson(row.trigger_bindings_json),
    uid: Number(row.uid),
    updatedAt: toDate(row.update_time),
    workflowId: normalizeId(row.workflow_id),
    workflowType: decodeWorkflowType(row.workflow_type),
  };
}

function parseRuntimeStatus(value: unknown): WorkflowRuntimeStatus {
  if (value === "inactive" || value === "active" || value === "paused" || value === "stopped") return value;
  throw new Error("Database returned an invalid Workflow runtime status");
}

function parseStatusReason(value: unknown): WorkflowStatusReason {
  if (value === null || value === "entitlement_revoked") return value;
  throw new Error("Database returned an invalid Workflow status reason");
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

function toCreateResult(
  definition: WorkflowDefinitionRecord,
  workflowType: WorkflowDefinitionRecord["workflowType"],
) {
  return definition.workflowType === workflowType
    ? { kind: "success" as const, value: definition }
    : { kind: "idempotency-conflict" as const };
}

function conflict<T>(): WorkflowMutationResult<T> {
  return { kind: "conflict" };
}

function activeLimitExceeded<T>(): WorkflowMutationResult<T> {
  return { kind: "active-limit-exceeded" };
}

function invalidStatus<T>(status: WorkflowRuntimeStatus): WorkflowMutationResult<T> {
  return { kind: "invalid-status", status };
}

function reviewInvalidStatus<T>(status: WorkflowPublishReviewRecord["status"]): WorkflowMutationResult<T> {
  return { kind: "review-invalid-status", status };
}

function reviewLocked<T>(): WorkflowMutationResult<T> {
  return { kind: "review-locked" };
}

function notFound<T>(): WorkflowMutationResult<T> {
  return { kind: "not-found" };
}

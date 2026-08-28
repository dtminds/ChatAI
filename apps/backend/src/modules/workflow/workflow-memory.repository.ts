import type { WorkflowTriggerBindingSpec } from "@chatai/workflow-engine";
import { WORKFLOW_ACTIVE_DEFINITION_LIMIT } from "@chatai/contracts";
import type {
  WorkflowDefinitionRecord,
  WorkflowMutationResult,
  WorkflowPublishReviewRecord,
  WorkflowRepository,
  WorkflowRevisionRecord,
} from "./workflow-repository-types.js";
import type { WorkflowTriggerBindingReader, WorkflowTriggerBindingRecord } from "@chatai/workflow-runtime";

type MemoryDefinition = WorkflowDefinitionRecord & { clientRequestId?: string };

export class InMemoryWorkflowRepository implements WorkflowRepository, WorkflowTriggerBindingReader {
  private definitions: MemoryDefinition[] = [];
  private revisions: WorkflowRevisionRecord[] = [];
  private reviews: WorkflowPublishReviewRecord[] = [];
  private triggerBindings: WorkflowTriggerBindingRecord[] = [];
  private nextDefinitionId = 1n;
  private nextRevisionId = 1n;
  private nextReviewId = 1n;
  private nextTriggerBindingId = 1n;

  async applyEntitlementLoss(input: Parameters<WorkflowRepository["applyEntitlementLoss"]>[0]) {
    let affectedDefinitions = 0;
    for (const definition of this.definitions) {
      if (definition.uid !== input.uid
        || definition.workflowType !== input.workflowType
        || definition.bizStatus !== 1) continue;
      if (input.transition === "pause") {
        if (definition.runtimeStatus !== "active") continue;
        definition.runtimeStatus = "paused";
      } else {
        if (definition.runtimeStatus === "stopped") continue;
        definition.runtimeStatus = "stopped";
        this.withdrawPendingReviews(input.uid, definition.id, input.opSubUserId);
      }
      definition.statusReason = "entitlement_revoked";
      touch(definition, input.opSubUserId);
      affectedDefinitions += 1;
    }
    return { affectedDefinitions };
  }

  async createDefinition(input: Parameters<WorkflowRepository["createDefinition"]>[0]) {
    const existing = input.clientRequestId
      ? this.definitions.find((item) =>
          item.uid === input.uid
          && item.bizStatus === 1
          && item.clientRequestId === input.clientRequestId,
        )
      : undefined;
    if (existing) {
      return existing.workflowType === input.workflowType
        ? { kind: "success" as const, value: clone(existing) }
        : { kind: "idempotency-conflict" as const };
    }

    const now = new Date();
    const definition: MemoryDefinition = {
      bizStatus: 1,
      clientRequestId: input.clientRequestId,
      createdAt: now,
      description: input.description,
      draft: clone(input.draft),
      draftSchemaVersion: 1,
      draftSemanticHash: input.draftSemanticHash,
      draftVersion: 1,
      id: String(this.nextDefinitionId++),
      name: input.name,
      opSubUserId: input.opSubUserId,
      publishedRevision: null,
      publishedSemanticHash: null,
      runtimeStatus: "inactive",
      statusReason: null,
      uid: input.uid,
      updatedAt: now,
      workflowType: input.workflowType,
    };
    this.definitions.push(definition);
    return { kind: "success" as const, value: clone(definition) };
  }

  async findDefinition(uid: number, workflowId: string) {
    const definition = this.findActive(uid, workflowId);
    return definition ? clone(definition) : null;
  }

  async findRevision(uid: number, workflowId: string, revision: number) {
    const item = this.revisions.find((candidate) =>
      candidate.uid === uid
      && candidate.workflowId === workflowId
      && candidate.revision === revision,
    );
    return item ? clone(item) : null;
  }

  async findReview(uid: number, workflowId: string, reviewId: string) {
    const review = this.reviews.find(item =>
      item.uid === uid && item.workflowId === workflowId && item.id === reviewId,
    );
    return review ? clone(review) : null;
  }

  async findCurrentReview(uid: number, workflowId: string) {
    const definition = this.findActive(uid, workflowId);
    if (!definition) return null;
    const review = this.reviews
      .filter(item => item.uid === uid
        && item.workflowId === workflowId
        && item.draftSemanticHash === definition.draftSemanticHash
        && item.basePublishedRevision === definition.publishedRevision
        && (item.status === "pending"
          || item.status === "approved"
          || item.status === "rejected"
          || item.status === "withdrawn"))
      .sort((first, second) => {
        const createdAtDifference = second.createdAt.getTime() - first.createdAt.getTime();
        return createdAtDifference || Number(second.id) - Number(first.id);
      })
      .at(0);
    return review?.status === "withdrawn" ? null : review ? clone(review) : null;
  }

  async listDefinitions(
    uid: number,
    input: Parameters<WorkflowRepository["listDefinitions"]>[1],
  ) {
    const normalizedQuery = input.query?.toLocaleLowerCase();
    const filteredDefinitions = this.definitions
      .filter((item) => item.uid === uid && item.bizStatus === 1)
      .filter(item => matchesDefinitionListStatus(item, input.status))
      .filter(item => !normalizedQuery
        || item.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((first, second) => {
        const createdAtDifference = second.createdAt.getTime() - first.createdAt.getTime();
        return createdAtDifference || Number(second.id) - Number(first.id);
      });
    const candidates = filteredDefinitions
      .filter(item => !input.cursor
        || item.createdAt < input.cursor.createdAt
        || (item.createdAt.getTime() === input.cursor.createdAt.getTime()
          && Number(item.id) < Number(input.cursor.id)))
      .slice(0, input.limit + 1);
    const items = candidates.slice(0, input.limit).map(clone);
    const lastItem = items.at(-1);
    return {
      items,
      nextCursor: candidates.length > items.length && lastItem
        ? { createdAt: lastItem.createdAt, id: lastItem.id }
        : null,
      total: filteredDefinitions.length,
    };
  }

  async listRevisions(
    uid: number,
    workflowId: string,
    input: Parameters<WorkflowRepository["listRevisions"]>[2],
  ) {
    const candidates = this.revisions
      .filter((item) => item.uid === uid && item.workflowId === workflowId)
      .sort((first, second) => second.revision - first.revision)
      .filter(item => input.cursor === undefined || item.revision < Number(input.cursor))
      .slice(0, input.limit + 1);
    const items = candidates.slice(0, input.limit).map(clone);
    return {
      items,
      nextCursor: candidates.length > items.length ? String(items.at(-1)!.revision) : null,
    };
  }

  async listReviews(
    uid: number,
    workflowId: string,
    input: Parameters<WorkflowRepository["listReviews"]>[2],
  ) {
    const candidates = this.reviews
      .filter(item => item.uid === uid && item.workflowId === workflowId)
      .sort((first, second) => Number(second.id) - Number(first.id))
      .filter(item => input.cursor === undefined || Number(item.id) < Number(input.cursor))
      .slice(0, input.limit + 1);
    const items = candidates.slice(0, input.limit).map(clone);
    return {
      items,
      nextCursor: candidates.length > items.length ? items.at(-1)!.id : null,
    };
  }

  async listActiveTriggerBindings(
    uid: number,
    eventType: WorkflowTriggerBindingRecord["eventType"],
  ) {
    return this.triggerBindings.filter((binding) => {
      if (binding.uid !== uid
        || binding.eventType !== eventType
        || binding.status !== 1) return false;
      const definition = this.findActive(uid, binding.workflowId);
      return definition?.runtimeStatus === "active"
        && definition.publishedRevision === binding.revision;
    }).map(clone);
  }

  async saveDraft(input: Parameters<WorkflowRepository["saveDraft"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.mutate<WorkflowDefinitionRecord>(input.uid, input.workflowId, (definition) => {
      if (this.hasPendingReview(input.uid, input.workflowId)) return reviewLocked();
      if (definition.draftVersion !== input.expectedDraftVersion) return conflict();
      if (definition.runtimeStatus === "stopped" && !input.layoutOnly) {
        return invalidStatus(definition.runtimeStatus);
      }
      definition.draft = clone(input.draft);
      definition.draftSemanticHash = input.draftSemanticHash;
      definition.draftVersion += 1;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async restoreDraft(input: Parameters<WorkflowRepository["restoreDraft"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.saveDraft(input);
  }

  async updateDefinitionMetadata(input: Parameters<WorkflowRepository["updateDefinitionMetadata"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.mutate<WorkflowDefinitionRecord>(input.uid, input.workflowId, (definition) => {
      if (this.hasPendingReview(input.uid, input.workflowId)) return reviewLocked();
      if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
      if (input.name !== undefined) definition.name = input.name;
      if (input.description !== undefined) definition.description = input.description;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async markDeleted(input: Parameters<WorkflowRepository["markDeleted"]>[0]) {
    return this.mutate(input.uid, input.workflowId, (definition) => {
      definition.bizStatus = 0;
      this.withdrawPendingReviews(input.uid, input.workflowId, input.opSubUserId);
      definition.clientRequestId = undefined;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  async submitReview(input: Parameters<WorkflowRepository["submitReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    const definition = this.findActive(input.uid, input.workflowId);
    if (!definition) return notFound<WorkflowPublishReviewRecord>();
    if (definition.runtimeStatus === "stopped") return invalidStatus(definition.runtimeStatus);
    if (definition.draftVersion !== input.expectedDraftVersion
      || definition.publishedRevision !== input.basePublishedRevision) return conflict();
    if (this.hasReviewForCandidate(
      input.uid,
      input.workflowId,
      input.draftSemanticHash,
      input.basePublishedRevision,
    )) return reviewLocked();
    const now = new Date();
    const review: WorkflowPublishReviewRecord = {
      basePublishedRevision: input.basePublishedRevision,
      candidateHash: input.candidateHash,
      changeSummary: clone(input.changeSummary),
      checkedAt: new Date(input.checkedAt),
      createdAt: now,
      draft: clone(input.draft),
      draftSemanticHash: input.draftSemanticHash,
      executionSpec: clone(input.executionSpec),
      id: String(this.nextReviewId++),
      publishedAt: null,
      publishedBySubUserId: null,
      resultingRevision: null,
      reviewComment: null,
      reviewedAt: null,
      reviewedBySubUserId: null,
      sourceDraftVersion: input.expectedDraftVersion,
      status: "pending",
      subjectType: input.subjectType,
      submittedAt: now,
      submittedBySubUserId: input.opSubUserId,
      triggerBindings: clone(input.triggerBindings),
      uid: input.uid,
      updatedAt: now,
      workflowId: input.workflowId,
      workflowType: input.workflowType,
    };
    this.reviews.push(review);
    touch(definition, input.opSubUserId);
    return success(clone(review));
  }

  async decideReview(input: Parameters<WorkflowRepository["decideReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    const review = this.findMutableReview(input.uid, input.workflowId, input.reviewId);
    if (!review) return notFound<WorkflowPublishReviewRecord>();
    if (review.status !== "pending") return reviewInvalidStatus(review.status);
    review.status = input.decision;
    review.reviewComment = input.comment;
    review.reviewedAt = new Date();
    review.reviewedBySubUserId = input.opSubUserId;
    review.updatedAt = review.reviewedAt;
    return success(clone(review));
  }

  async withdrawReview(input: Parameters<WorkflowRepository["withdrawReview"]>[0]): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>> {
    const review = this.findMutableReview(input.uid, input.workflowId, input.reviewId);
    if (!review) return notFound<WorkflowPublishReviewRecord>();
    if (review.status !== "pending") {
      return reviewInvalidStatus(review.status);
    }
    review.status = "withdrawn";
    review.reviewComment = null;
    review.reviewedAt = new Date();
    review.reviewedBySubUserId = input.opSubUserId;
    review.updatedAt = review.reviewedAt;
    return success(clone(review));
  }

  async publishRevision(input: Parameters<WorkflowRepository["publishRevision"]>[0]): Promise<WorkflowMutationResult<{ definition: WorkflowDefinitionRecord; revision: WorkflowRevisionRecord }>> {
    const definition = this.findActive(input.uid, input.workflowId);
    if (!definition) return notFound<never>();
    const review = this.findMutableReview(input.uid, input.workflowId, input.reviewId);
    if (!review) return notFound<never>();
    if (review.status !== "approved") return reviewInvalidStatus(review.status);
    if (review.candidateHash !== input.candidateHash
      || definition.publishedRevision !== review.basePublishedRevision
      || definition.draftSemanticHash !== review.draftSemanticHash) return conflict<never>();
    if (definition.runtimeStatus === "stopped") {
      return invalidStatus<never>(definition.runtimeStatus);
    }
    const revision = this.createRevision(definition, {
      draft: definition.draft,
      executionSpec: review.executionSpec,
      opSubUserId: input.opSubUserId,
      reviewId: review.id,
      specHash: review.candidateHash,
      subjectType: review.subjectType,
    });
    this.addTriggerBindings(definition, revision.revision, review.triggerBindings);
    definition.publishedRevision = revision.revision;
    definition.publishedSemanticHash = review.draftSemanticHash;
    review.publishedAt = revision.publishedAt;
    review.publishedBySubUserId = input.opSubUserId;
    review.resultingRevision = revision.revision;
    review.updatedAt = revision.publishedAt;
    touch(definition, input.opSubUserId);
    return success({ definition: clone(definition), revision: clone(revision) });
  }

  async enable(input: Parameters<WorkflowRepository["enable"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    const definition = this.findActive(input.uid, input.workflowId);
    if (!definition) return notFound<never>();
    if (definition.runtimeStatus !== "inactive" || definition.publishedRevision === null) {
      return invalidStatus<never>(definition.runtimeStatus);
    }
    if (this.countActiveDefinitions(input.uid) >= WORKFLOW_ACTIVE_DEFINITION_LIMIT) {
      return activeLimitExceeded<never>();
    }
    definition.runtimeStatus = "active";
    definition.statusReason = null;
    touch(definition, input.opSubUserId);
    return success(clone(definition));
  }

  async setRuntimeStatus(input: Parameters<WorkflowRepository["setRuntimeStatus"]>[0]): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>> {
    return this.mutate<WorkflowDefinitionRecord>(input.uid, input.workflowId, (definition) => {
      if (!input.allowedCurrentStatuses.includes(definition.runtimeStatus)) {
        return invalidStatus(definition.runtimeStatus);
      }
      if (input.status === "active"
        && this.countActiveDefinitions(input.uid) >= WORKFLOW_ACTIVE_DEFINITION_LIMIT) {
        return activeLimitExceeded();
      }
      definition.runtimeStatus = input.status;
      if (input.status === "stopped") {
        this.withdrawPendingReviews(input.uid, input.workflowId, input.opSubUserId);
      }
      definition.statusReason = input.statusReason;
      touch(definition, input.opSubUserId);
      return success(definition);
    });
  }

  private findActive(uid: number, workflowId: string) {
    return this.definitions.find((item) => item.uid === uid && item.id === workflowId && item.bizStatus === 1);
  }

  private countActiveDefinitions(uid: number) {
    return this.definitions.filter(definition =>
      definition.uid === uid
      && definition.bizStatus === 1
      && definition.runtimeStatus === "active").length;
  }

  private findMutableReview(uid: number, workflowId: string, reviewId: string) {
    return this.reviews.find(review =>
      review.uid === uid && review.workflowId === workflowId && review.id === reviewId,
    );
  }

  private hasPendingReview(uid: number, workflowId: string) {
    return this.reviews.some(review =>
      review.uid === uid && review.workflowId === workflowId && review.status === "pending",
    );
  }

  private hasReviewForCandidate(
    uid: number,
    workflowId: string,
    draftSemanticHash: string,
    basePublishedRevision: number | null,
  ) {
    return this.reviews.some(review =>
      review.uid === uid
      && review.workflowId === workflowId
      && review.draftSemanticHash === draftSemanticHash
      && review.basePublishedRevision === basePublishedRevision
      && (review.status === "pending" || review.status === "approved"),
    );
  }

  private withdrawPendingReviews(uid: number, workflowId: string, opSubUserId: string) {
    const now = new Date();
    for (const review of this.reviews) {
      if (review.uid !== uid || review.workflowId !== workflowId
        || review.status !== "pending") continue;
      review.status = "withdrawn";
      review.reviewedAt = now;
      review.reviewedBySubUserId = opSubUserId;
      review.updatedAt = now;
    }
  }

  private async mutate<T>(
    uid: number,
    workflowId: string,
    mutation: (definition: MemoryDefinition) => WorkflowMutationResult<T>,
  ): Promise<WorkflowMutationResult<T>> {
    const definition = this.findActive(uid, workflowId);
    if (!definition) return notFound<T>();
    const result = mutation(definition);
    return result.kind === "success" ? success(clone(result.value)) : result;
  }

  private createRevision(
    definition: WorkflowDefinitionRecord,
    input: {
      draft: WorkflowDefinitionRecord["draft"];
      executionSpec: WorkflowRevisionRecord["executionSpec"];
      opSubUserId: string;
      reviewId: string;
      specHash: string;
      subjectType: WorkflowRevisionRecord["subjectType"];
    },
  ) {
    const now = new Date();
    const revision: WorkflowRevisionRecord = {
      createdAt: now,
      draft: clone(input.draft),
      executionSpec: clone(input.executionSpec),
      id: String(this.nextRevisionId++),
      publishedAt: now,
      publishSubUserId: input.opSubUserId,
      reviewId: input.reviewId,
      revision: input.executionSpec.revision,
      specHash: input.specHash,
      subjectType: input.subjectType,
      uid: definition.uid,
      workflowId: definition.id,
      workflowType: definition.workflowType,
    };
    this.revisions.push(revision);
    return revision;
  }

  private addTriggerBindings(
    definition: WorkflowDefinitionRecord,
    revision: number,
    specs: WorkflowTriggerBindingSpec[],
  ) {
    const now = new Date();
    for (const binding of this.triggerBindings) {
      if (binding.uid === definition.uid
        && binding.workflowId === definition.id
        && binding.status === 1) {
        binding.status = 0;
        binding.updatedAt = now;
      }
    }
    this.triggerBindings.push(...specs.map(spec => ({
      createdAt: now,
      eventType: spec.eventType,
      filter: clone(spec.filter),
      id: String(this.nextTriggerBindingId++),
      revision,
      status: 1 as const,
      subjectType: spec.subjectType,
      uid: definition.uid,
      updatedAt: now,
      workflowId: definition.id,
    })));
  }
}

function touch(definition: WorkflowDefinitionRecord, opSubUserId: string) {
  definition.opSubUserId = opSubUserId;
  definition.updatedAt = new Date();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function matchesDefinitionListStatus(
  definition: WorkflowDefinitionRecord,
  status: Parameters<WorkflowRepository["listDefinitions"]>[1]["status"],
) {
  if (status === "all") return true;
  if (status === "active") return definition.runtimeStatus === "active";
  if (status === "ready") {
    return definition.runtimeStatus === "paused"
      || (definition.runtimeStatus === "inactive" && definition.publishedRevision !== null);
  }
  if (status === "draft") return definition.publishedRevision === null;
  return definition.runtimeStatus === "stopped";
}

function success<T>(value: T): WorkflowMutationResult<T> {
  return { kind: "success", value };
}

function conflict<T>(): WorkflowMutationResult<T> {
  return { kind: "conflict" };
}

function activeLimitExceeded<T>(): WorkflowMutationResult<T> {
  return { kind: "active-limit-exceeded" };
}

function invalidStatus<T>(status: WorkflowDefinitionRecord["runtimeStatus"]): WorkflowMutationResult<T> {
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

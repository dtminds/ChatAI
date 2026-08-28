import type {
  WorkflowDraft,
  WorkflowExecutionSpec,
  WorkflowPublishReviewChangeSummary,
  WorkflowPublishReviewStatus,
  WorkflowDefinitionListStatus,
  WorkflowRuntimeStatus,
  WorkflowStatusReason,
  WorkflowSubjectType,
  WorkflowType,
} from "@chatai/contracts";
import type { WorkflowTriggerBindingSpec } from "@chatai/workflow-engine";

export type WorkflowDefinitionRecord = {
  bizStatus: 0 | 1;
  createdAt: Date;
  description: string;
  draft: WorkflowDraft;
  draftSchemaVersion: number;
  draftSemanticHash: string;
  draftVersion: number;
  id: string;
  name: string;
  opSubUserId: string;
  publishedSemanticHash: string | null;
  publishedRevision: number | null;
  runtimeStatus: WorkflowRuntimeStatus;
  statusReason: WorkflowStatusReason;
  uid: number;
  updatedAt: Date;
  workflowType: WorkflowType;
};

export type WorkflowDefinitionListRecord = Pick<WorkflowDefinitionRecord,
  | "createdAt"
  | "description"
  | "draft"
  | "draftSemanticHash"
  | "id"
  | "name"
  | "publishedRevision"
  | "publishedSemanticHash"
  | "runtimeStatus"
  | "updatedAt"
  | "workflowType"
>;

export type WorkflowRevisionRecord = {
  createdAt: Date;
  draft: WorkflowDraft;
  executionSpec: WorkflowExecutionSpec;
  id: string;
  publishSubUserId: string;
  publishedAt: Date;
  reviewId: string;
  revision: number;
  specHash: string;
  subjectType: WorkflowSubjectType;
  uid: number;
  workflowId: string;
  workflowType: WorkflowType;
};

export type WorkflowPublishReviewRecord = {
  basePublishedRevision: number | null;
  candidateHash: string;
  changeSummary: WorkflowPublishReviewChangeSummary;
  checkedAt: Date;
  createdAt: Date;
  draft: WorkflowDraft;
  draftSemanticHash: string;
  executionSpec: WorkflowExecutionSpec;
  id: string;
  publishedAt: Date | null;
  publishedBySubUserId: string | null;
  resultingRevision: number | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  reviewedBySubUserId: string | null;
  sourceDraftVersion: number;
  status: WorkflowPublishReviewStatus;
  subjectType: WorkflowSubjectType;
  submittedAt: Date;
  submittedBySubUserId: string;
  triggerBindings: WorkflowTriggerBindingSpec[];
  uid: number;
  updatedAt: Date;
  workflowId: string;
  workflowType: WorkflowType;
};

export type WorkflowMutationResult<T> =
  | { kind: "success"; value: T }
  | { kind: "active-limit-exceeded" }
  | { kind: "conflict" }
  | { kind: "invalid-status"; status: WorkflowRuntimeStatus }
  | { kind: "review-invalid-status"; status: WorkflowPublishReviewStatus }
  | { kind: "review-locked" }
  | { kind: "not-found" };

export type WorkflowCreateResult =
  | { kind: "success"; value: WorkflowDefinitionRecord }
  | { kind: "idempotency-conflict" };

export type WorkflowHistoryPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type WorkflowHistoryPageInput = {
  cursor?: string;
  limit: number;
};

export type WorkflowDefinitionListCursor = {
  createdAt: Date;
  id: string;
};

export type WorkflowDefinitionListInput = {
  cursor?: WorkflowDefinitionListCursor;
  limit: number;
  query?: string;
  status: WorkflowDefinitionListStatus;
};

export type WorkflowDefinitionRecordPage = {
  items: WorkflowDefinitionListRecord[];
  nextCursor: WorkflowDefinitionListCursor | null;
  total: number;
};

export type WorkflowRepository = {
  applyEntitlementLoss(input: {
    opSubUserId: string;
    transitionedAt: Date;
    transition: "pause" | "stop";
    uid: number;
    workflowType: WorkflowType;
  }): Promise<{ affectedDefinitions: number }>;
  createDefinition(input: {
    clientRequestId?: string;
    description: string;
    draft: WorkflowDraft;
    draftSemanticHash: string;
    name: string;
    opSubUserId: string;
    uid: number;
    workflowType: WorkflowType;
  }): Promise<WorkflowCreateResult>;
  findDefinition(uid: number, workflowId: string): Promise<WorkflowDefinitionRecord | null>;
  findReview(uid: number, workflowId: string, reviewId: string): Promise<WorkflowPublishReviewRecord | null>;
  findCurrentReview(uid: number, workflowId: string): Promise<WorkflowPublishReviewRecord | null>;
  findRevision(uid: number, workflowId: string, revision: number): Promise<WorkflowRevisionRecord | null>;
  listDefinitions(uid: number, input: WorkflowDefinitionListInput): Promise<WorkflowDefinitionRecordPage>;
  listReviews(
    uid: number,
    workflowId: string,
    input: WorkflowHistoryPageInput,
  ): Promise<WorkflowHistoryPage<WorkflowPublishReviewRecord>>;
  listRevisions(
    uid: number,
    workflowId: string,
    input: WorkflowHistoryPageInput,
  ): Promise<WorkflowHistoryPage<WorkflowRevisionRecord>>;
  markDeleted(input: {
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  submitReview(input: {
    basePublishedRevision: number | null;
    candidateHash: string;
    changeSummary: WorkflowPublishReviewChangeSummary;
    checkedAt: Date;
    draft: WorkflowDraft;
    draftSemanticHash: string;
    executionSpec: WorkflowExecutionSpec;
    expectedDraftVersion: number;
    opSubUserId: string;
    subjectType: WorkflowSubjectType;
    triggerBindings: WorkflowTriggerBindingSpec[];
    uid: number;
    workflowId: string;
    workflowType: WorkflowType;
  }): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>>;
  decideReview(input: {
    comment: string | null;
    decision: "approved" | "rejected";
    opSubUserId: string;
    reviewId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>>;
  withdrawReview(input: {
    opSubUserId: string;
    reviewId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowPublishReviewRecord>>;
  publishRevision(input: {
    candidateHash: string;
    opSubUserId: string;
    reviewId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<{
    definition: WorkflowDefinitionRecord;
    revision: WorkflowRevisionRecord;
  }>>;
  enable(input: {
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  updateDefinitionMetadata(input: {
    description?: string;
    name?: string;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  restoreDraft(input: {
    draft: WorkflowDraft;
    draftSemanticHash: string;
    expectedDraftVersion: number;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  saveDraft(input: {
    draft: WorkflowDraft;
    draftSemanticHash: string;
    expectedDraftVersion: number;
    layoutOnly?: boolean;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  setRuntimeStatus(input: {
    allowedCurrentStatuses: WorkflowRuntimeStatus[];
    opSubUserId: string;
    status: WorkflowRuntimeStatus;
    statusReason: WorkflowStatusReason;
    transitionedAt: Date;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
};

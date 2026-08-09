import type {
  WorkflowDraft,
  WorkflowExecutionSpec,
  WorkflowRuntimeStatus,
} from "@chatai/contracts";
import type { WorkflowTriggerBindingSpec } from "@chatai/workflow-engine";

export type WorkflowDefinitionRecord = {
  bizStatus: 0 | 1;
  createdAt: Date;
  description: string;
  draft: WorkflowDraft;
  draftSchemaVersion: number;
  draftVersion: number;
  id: string;
  name: string;
  opSubUserId: string;
  publishedRevision: number | null;
  runtimeStatus: WorkflowRuntimeStatus;
  uid: number;
  updatedAt: Date;
  validatedDraftVersion: number | null;
};

export type WorkflowRevisionRecord = {
  createdAt: Date;
  draft: WorkflowDraft;
  executionSpec: WorkflowExecutionSpec;
  id: string;
  publishSubUserId: string;
  publishedAt: Date;
  revision: number;
  specHash: string;
  uid: number;
  workflowId: string;
};

export type WorkflowMutationResult<T> =
  | { kind: "success"; value: T }
  | { kind: "conflict" }
  | { kind: "invalid-status"; status: WorkflowRuntimeStatus }
  | { kind: "not-found" };

export type WorkflowRepository = {
  createDefinition(input: {
    clientRequestId?: string;
    description: string;
    draft: WorkflowDraft;
    name: string;
    opSubUserId: string;
    uid: number;
  }): Promise<WorkflowDefinitionRecord>;
  findDefinition(uid: number, workflowId: string): Promise<WorkflowDefinitionRecord | null>;
  findRevision(uid: number, workflowId: string, revision: number): Promise<WorkflowRevisionRecord | null>;
  listDefinitions(uid: number): Promise<WorkflowDefinitionRecord[]>;
  listRevisions(uid: number, workflowId: string): Promise<WorkflowRevisionRecord[]>;
  markDeleted(input: {
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  markValidated(input: {
    expectedDraftVersion: number;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  publishRevision(input: {
    draft: WorkflowDraft;
    executionSpec: WorkflowExecutionSpec;
    expectedDraftVersion: number;
    expectedPublishedRevision: number;
    opSubUserId: string;
    specHash: string;
    triggerBindings: WorkflowTriggerBindingSpec[];
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<{
    definition: WorkflowDefinitionRecord;
    revision: WorkflowRevisionRecord;
  }>>;
  enable(input: {
    draft: WorkflowDraft;
    executionSpec: WorkflowExecutionSpec;
    expectedDraftVersion: number;
    opSubUserId: string;
    specHash: string;
    triggerBindings: WorkflowTriggerBindingSpec[];
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<{
    definition: WorkflowDefinitionRecord;
    revision: WorkflowRevisionRecord;
  }>>;
  updateDefinitionMetadata(input: {
    description?: string;
    name?: string;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  restoreDraft(input: {
    draft: WorkflowDraft;
    expectedDraftVersion: number;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  saveDraft(input: {
    draft: WorkflowDraft;
    expectedDraftVersion: number;
    opSubUserId: string;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
  setRuntimeStatus(input: {
    allowedCurrentStatuses: WorkflowRuntimeStatus[];
    opSubUserId: string;
    status: WorkflowRuntimeStatus;
    uid: number;
    workflowId: string;
  }): Promise<WorkflowMutationResult<WorkflowDefinitionRecord>>;
};

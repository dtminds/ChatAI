import type { WorkflowDraft } from "./types";

export type WorkflowDocumentStatus = "Draft" | "Published" | "Paused" | "Stopped";

export type WorkflowListItem = {
  conversion: string;
  entered: string;
  id: string;
  name: string;
  nodes: number;
  owner: string;
  status: WorkflowDocumentStatus;
  trigger: string;
  updatedAt: string;
};

export type WorkflowPublishedVersion = {
  id: string;
  name: string;
  publishedAt: string;
  revision: number;
};

export type WorkflowVersionHistoryItem = WorkflowPublishedVersion & {
  draft: WorkflowDraft;
  restoredFromVersionId?: string;
};

export type WorkflowDocumentPermissions = {
  canEdit: boolean;
  canPublish: boolean;
};

export type WorkflowDocument = WorkflowListItem & {
  currentVersion: WorkflowPublishedVersion | null;
  draft: WorkflowDraft;
  draftHash: string;
  permissions: WorkflowDocumentPermissions;
  publishedAt: string | null;
  publishedDraft: WorkflowDraft | null;
  publishedRevision: number | null;
  revision: number;
  savedAt: string;
  versionHistory: WorkflowVersionHistoryItem[];
  draftVersion?: number;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
  validatedDraftVersion?: number | null;
};

export type WorkflowRepositoryErrorCode =
  | "conflict"
  | "forbidden"
  | "network"
  | "not-found"
  | "server"
  | "unauthorized"
  | "validation";

export class WorkflowRepositoryError extends Error {
  code: WorkflowRepositoryErrorCode;

  constructor(code: WorkflowRepositoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WorkflowRepositoryError";
    this.code = code;
  }
}

export type WorkflowDraftSaveStatus = "dirty" | "error" | "saved" | "saving";
export type WorkflowDraftPublishStatus = "error" | "idle" | "published" | "publishing";
export type WorkflowDraftImportStatus = "error" | "idle" | "imported" | "importing";
export type WorkflowDraftRestoreStatus = "error" | "idle" | "restored" | "restoring";

export type WorkflowDraftSaveResult = {
  document: WorkflowDocument;
  draft: WorkflowDraft;
  draftHash: string;
  revision: number;
  savedAt: string;
  updatedAt: string;
};

export type WorkflowDraftImportResult = WorkflowDraftSaveResult & {
  importedAt: string;
};

type WorkflowDraftPublishResultBase = {
  document: WorkflowDocument;
  draft: WorkflowDraft;
  draftHash: string;
  revision: number;
  updatedAt: string;
};

export type WorkflowDraftPublishResult = WorkflowDraftPublishResultBase & (
  | {
      publishedAt: null;
      publishedRevision: null;
      validatedOnly: true;
      version: null;
    }
  | {
      publishedAt: string;
      publishedRevision: number;
      validatedOnly?: false;
      version: WorkflowPublishedVersion;
    }
);

export type WorkflowDraftPublishOptions = {
  expectedBaseDraftHash?: string;
};

export type WorkflowDraftRestoreResult = WorkflowDraftSaveResult & {
  restoredAt: string;
  restoredVersion: WorkflowVersionHistoryItem;
};

export type WorkflowDraftReader = {
  getDocument: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  listDocuments: () => Promise<WorkflowListItem[]> | WorkflowListItem[];
};

export type WorkflowDraftWriter = {
  createDocument: (input?: {
    clientRequestId?: string;
    name?: string;
  }) => Promise<WorkflowDocument> | WorkflowDocument;
  deleteDocument: (workflowId: string) => Promise<void> | void;
  importDraft: (
    workflowId: string,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftImportResult | WorkflowDocument> | WorkflowDraftImportResult | WorkflowDocument;
  publishDraft: (
    workflowId: string,
    draft: WorkflowDraft,
    options?: WorkflowDraftPublishOptions,
  ) => Promise<WorkflowDraftPublishResult | WorkflowDocument> | WorkflowDraftPublishResult | WorkflowDocument;
  restoreVersion: (
    workflowId: string,
    versionId: string,
  ) => Promise<WorkflowDraftRestoreResult | WorkflowDocument> | WorkflowDraftRestoreResult | WorkflowDocument;
  saveDraft: (
    workflowId: string,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftSaveResult | WorkflowDocument> | WorkflowDraftSaveResult | WorkflowDocument;
  renameDocument: (workflowId: string, name: string) => Promise<WorkflowDocument> | WorkflowDocument;
  enableDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  pauseDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  resumeDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  stopDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
};

export type WorkflowDraftRepository = WorkflowDraftReader & WorkflowDraftWriter;

export type SyncWorkflowDraftRepository = {
  createDocument: (input?: { clientRequestId?: string; name?: string }) => WorkflowDocument;
  deleteDocument: (workflowId: string) => void;
  getDocument: (workflowId: string) => WorkflowDocument;
  importDraft: (workflowId: string, draft: WorkflowDraft) => WorkflowDraftImportResult;
  listDocuments: () => WorkflowListItem[];
  publishDraft: (
    workflowId: string,
    draft: WorkflowDraft,
    options?: WorkflowDraftPublishOptions,
  ) => WorkflowDraftPublishResult;
  renameDocument: (workflowId: string, name: string) => WorkflowDocument;
  reset: () => void;
  restoreVersion: (workflowId: string, versionId: string) => WorkflowDraftRestoreResult;
  saveDraft: (workflowId: string, draft: WorkflowDraft) => WorkflowDraftSaveResult;
};

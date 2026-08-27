import type {
  WorkflowCapacityOverview,
  WorkflowCapabilitySummary,
  WorkflowDefinitionListStatus,
  WorkflowPublishReview,
  WorkflowType,
} from "@chatai/contracts";
import type { WorkflowDraft } from "./types";

export type WorkflowDocumentStatus = "Draft" | "Published" | "Paused" | "Stopped";

export type WorkflowManagedAccountSummary = {
  avatarUrl: string;
  id: number;
  name: string;
};

export type WorkflowListItem = {
  canOperate: boolean;
  description: string;
  id: string;
  inProgressRunCount: number;
  lastRunAt: string | null;
  managedAccountCount: number;
  managedAccounts: WorkflowManagedAccountSummary[];
  name: string;
  publishedRevision: number | null;
  runtimeStatus: "active" | "inactive" | "paused" | "stopped";
  status: WorkflowDocumentStatus;
  successRatePercent: number | null;
  trigger: string;
  totalRunCount: number;
  updatedAt: string;
  workflowType: WorkflowType;
  hasUnpublishedChanges: boolean;
};

export type WorkflowListPage = {
  items: WorkflowListItem[];
  nextCursor: string | null;
};

export type WorkflowListInput = {
  cursor?: string;
  limit?: number;
  query?: string;
  status?: WorkflowDefinitionListStatus;
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

export type WorkflowHistoryPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export type WorkflowDocumentPermissions = {
  canEdit: boolean;
  canOperate: boolean;
  canPublish: boolean;
};

export type WorkflowDocument = WorkflowListItem & {
  capabilitySummary: WorkflowCapabilitySummary;
  conversion: string;
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
  versionHistoryNextCursor: string | null;
  draftVersion?: number;
  entered: string;
  nodes: number;
  owner: string;
  runtimeStatus?: "active" | "inactive" | "paused" | "stopped";
  currentReview: WorkflowPublishReview | null;
  hasUnpublishedChanges: boolean;
};

export type WorkflowRepositoryErrorCode =
  | "conflict"
  | "forbidden"
  | "network"
  | "not-found"
  | "server"
  | "unauthorized"
  | "validation";

type WorkflowRepositoryErrorOptions = ErrorOptions & {
  apiCode?: string;
};

export class WorkflowRepositoryError extends Error {
  readonly apiCode?: string;
  code: WorkflowRepositoryErrorCode;

  constructor(code: WorkflowRepositoryErrorCode, message: string, options?: WorkflowRepositoryErrorOptions) {
    super(message, options);
    this.name = "WorkflowRepositoryError";
    this.apiCode = options?.apiCode;
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

export type WorkflowDraftPublishResult = WorkflowDraftPublishResultBase & {
  publishedAt: string;
  publishedRevision: number;
  version: WorkflowPublishedVersion;
};

export type WorkflowDraftRestoreResult = WorkflowDraftSaveResult & {
  restoredAt: string;
  restoredVersion: WorkflowVersionHistoryItem;
};

export type WorkflowDraftReader = {
  getCapacityOverview: () => Promise<WorkflowCapacityOverview> | WorkflowCapacityOverview;
  getDocument: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  getVersion: (
    workflowId: string,
    revision: number,
  ) => Promise<WorkflowVersionHistoryItem> | WorkflowVersionHistoryItem;
  listDocuments: (input?: WorkflowListInput) => Promise<WorkflowListPage> | WorkflowListPage;
};

export type WorkflowDraftWriter = {
  approveReview: (
    workflowId: string,
    reviewId: string,
    comment?: string,
  ) => Promise<WorkflowDocument> | WorkflowDocument;
  createDocument: (input: {
    clientRequestId?: string;
    description?: string;
    name?: string;
    workflowType: WorkflowType;
  }) => Promise<WorkflowDocument> | WorkflowDocument;
  deleteDocument: (workflowId: string) => Promise<void> | void;
  importDraft: (
    workflowId: string,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftImportResult | WorkflowDocument> | WorkflowDraftImportResult | WorkflowDocument;
  listReviews: (
    workflowId: string,
    cursor?: string,
  ) => Promise<WorkflowHistoryPage<WorkflowPublishReview>> | WorkflowHistoryPage<WorkflowPublishReview>;
  listVersions: (
    workflowId: string,
    cursor?: string,
  ) => Promise<WorkflowHistoryPage<WorkflowVersionHistoryItem>> | WorkflowHistoryPage<WorkflowVersionHistoryItem>;
  publishReview: (
    workflowId: string,
    reviewId: string,
  ) => Promise<WorkflowDraftPublishResult | WorkflowDocument> | WorkflowDraftPublishResult | WorkflowDocument;
  rejectReview: (
    workflowId: string,
    reviewId: string,
    reason: string,
  ) => Promise<WorkflowDocument> | WorkflowDocument;
  restoreVersion: (
    workflowId: string,
    version: WorkflowVersionHistoryItem,
  ) => Promise<WorkflowDraftRestoreResult | WorkflowDocument> | WorkflowDraftRestoreResult | WorkflowDocument;
  restoreReview: (
    workflowId: string,
    reviewId: string,
  ) => Promise<WorkflowDocument> | WorkflowDocument;
  saveDraft: (
    workflowId: string,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftSaveResult | WorkflowDocument> | WorkflowDraftSaveResult | WorkflowDocument;
  submitReview: (
    workflowId: string,
  ) => Promise<WorkflowDocument> | WorkflowDocument;
  updateDocumentMetadata: (
    workflowId: string,
    metadata: { description: string; name: string },
  ) => Promise<WorkflowDocument> | WorkflowDocument;
  enableDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  pauseDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  resumeDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  stopDocument?: (workflowId: string) => Promise<WorkflowDocument> | WorkflowDocument;
  withdrawReview: (
    workflowId: string,
    reviewId: string,
  ) => Promise<WorkflowDocument> | WorkflowDocument;
};

export type WorkflowDraftRepository = WorkflowDraftReader & WorkflowDraftWriter;

export type SyncWorkflowDraftRepository = {
  approveReview: (workflowId: string, reviewId: string, comment?: string) => WorkflowDocument;
  createDocument: (input: {
    clientRequestId?: string;
    description?: string;
    name?: string;
    workflowType: WorkflowType;
  }) => WorkflowDocument;
  deleteDocument: (workflowId: string) => void;
  getCapacityOverview: () => WorkflowCapacityOverview;
  getDocument: (workflowId: string) => WorkflowDocument;
  getVersion: (workflowId: string, revision: number) => WorkflowVersionHistoryItem;
  importDraft: (workflowId: string, draft: WorkflowDraft) => WorkflowDraftImportResult;
  listDocuments: (input?: WorkflowListInput) => WorkflowListPage;
  listReviews: (workflowId: string, cursor?: string) => WorkflowHistoryPage<WorkflowPublishReview>;
  listVersions: (workflowId: string, cursor?: string) => WorkflowHistoryPage<WorkflowVersionHistoryItem>;
  enableDocument: (workflowId: string) => WorkflowDocument;
  pauseDocument: (workflowId: string) => WorkflowDocument;
  publishReview: (workflowId: string, reviewId: string) => WorkflowDraftPublishResult;
  rejectReview: (workflowId: string, reviewId: string, reason: string) => WorkflowDocument;
  updateDocumentMetadata: (
    workflowId: string,
    metadata: { description: string; name: string },
  ) => WorkflowDocument;
  reset: () => void;
  resumeDocument: (workflowId: string) => WorkflowDocument;
  restoreVersion: (workflowId: string, version: WorkflowVersionHistoryItem) => WorkflowDraftRestoreResult;
  restoreReview: (workflowId: string, reviewId: string) => WorkflowDocument;
  saveDraft: (workflowId: string, draft: WorkflowDraft) => WorkflowDraftSaveResult;
  stopDocument: (workflowId: string) => WorkflowDocument;
  submitReview: (workflowId: string) => WorkflowDocument;
  withdrawReview: (workflowId: string, reviewId: string) => WorkflowDocument;
};

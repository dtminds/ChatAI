import {
  canonicalizeWorkflowDraft,
  hydrateWorkflowDraft,
} from "./workflow-draft-normalizer";
import {
  findWorkflowEntryNode,
  findWorkflowTerminalNode,
} from "./node-catalog";
import { createWorkflowExecutionGraph } from "./workflow-dsl";
import type { WorkflowDraft } from "./types";
import type {
  WorkflowDocument,
  WorkflowDraftImportResult,
  WorkflowDraftPublishResult,
  WorkflowDraftPublishStatus,
  WorkflowDraftRestoreResult,
  WorkflowDraftSaveResult,
  WorkflowPublishedVersion,
  WorkflowVersionHistoryItem,
} from "./workflow-repository-types";

export function createWorkflowPublishedHash(document: WorkflowDocument) {
  return document.publishedDraft ? createWorkflowPublishHash(document.publishedDraft) : undefined;
}

export function getWorkflowPublishStateForDraft(
  draft: WorkflowDraft,
  document: WorkflowDocument,
): WorkflowDraftPublishStatus {
  return getWorkflowPublishStateFromHashes(
    createWorkflowPublishHash(draft),
    createWorkflowPublishedHash(document),
  );
}

export function getWorkflowPublishStateFromHashes(
  draftHash: string,
  publishedDraftHash: string | undefined,
): WorkflowDraftPublishStatus {
  return publishedDraftHash && draftHash === publishedDraftHash ? "published" : "idle";
}

export function cloneWorkflowDocument(document: WorkflowDocument): WorkflowDocument {
  const draft = cloneWorkflowDraft(document.draft);

  return {
    ...document,
    currentVersion: document.currentVersion ? { ...document.currentVersion } : null,
    draft,
    draftHash: document.draftHash ?? createWorkflowDraftHash(draft),
    permissions: { ...document.permissions },
    publishedDraft: document.publishedDraft ? cloneWorkflowDraft(document.publishedDraft) : null,
    versionHistory: cloneWorkflowVersionHistory(document.versionHistory),
  };
}

export function normalizeWorkflowDraftSaveResult(
  saveResult: WorkflowDraftSaveResult | WorkflowDocument,
): WorkflowDraftSaveResult {
  if ("document" in saveResult) {
    return {
      ...saveResult,
      document: cloneWorkflowDocument(saveResult.document),
      draft: cloneWorkflowDraft(saveResult.draft),
      draftHash: saveResult.draftHash ?? saveResult.document.draftHash ?? createWorkflowDraftHash(saveResult.draft),
    };
  }

  const document = cloneWorkflowDocument(saveResult);

  return {
    document,
    draft: cloneWorkflowDraft(document.draft),
    draftHash: document.draftHash,
    revision: document.revision,
    savedAt: document.savedAt,
    updatedAt: document.updatedAt,
  };
}

export function normalizeWorkflowDraftImportResult(
  importResult: WorkflowDraftImportResult | WorkflowDocument,
): WorkflowDraftImportResult {
  if ("importedAt" in importResult) {
    return {
      ...importResult,
      document: cloneWorkflowDocument(importResult.document),
      draft: cloneWorkflowDraft(importResult.draft),
    };
  }

  const saveResult = normalizeWorkflowDraftSaveResult(importResult);

  return {
    ...saveResult,
    importedAt: saveResult.savedAt,
  };
}

export function normalizeWorkflowDraftPublishResult(
  publishResult: WorkflowDraftPublishResult | WorkflowDocument,
): WorkflowDraftPublishResult {
  if ("version" in publishResult) {
    return {
      ...publishResult,
      document: cloneWorkflowDocument(publishResult.document),
      draft: cloneWorkflowDraft(publishResult.draft),
      draftHash: publishResult.draftHash ?? publishResult.document.draftHash ?? createWorkflowDraftHash(publishResult.draft),
    };
  }

  const document = cloneWorkflowDocument(publishResult);
  if (document.publishedRevision === null) {
    return {
      document,
      draft: cloneWorkflowDraft(document.draft),
      draftHash: document.draftHash,
      publishedAt: null,
      publishedRevision: null,
      revision: document.revision,
      updatedAt: document.updatedAt,
      validatedOnly: true,
      version: null,
    };
  }
  const publishedAt = document.publishedAt ?? document.updatedAt;
  const publishedRevision = document.publishedRevision;
  const version = document.currentVersion ?? createWorkflowPublishedVersion(
    document.id,
    publishedRevision,
    publishedAt,
  );
  const draft = document.publishedDraft
    ? cloneWorkflowDraft(document.publishedDraft)
    : cloneWorkflowDraft(document.draft);

  return {
    document,
    draft,
    draftHash: document.draftHash,
    publishedAt,
    publishedRevision,
    revision: document.revision,
    updatedAt: document.updatedAt,
    validatedOnly: false,
    version,
  };
}

export function normalizeWorkflowDraftRestoreResult(
  restoreResult: WorkflowDraftRestoreResult | WorkflowDocument,
): WorkflowDraftRestoreResult {
  if ("restoredVersion" in restoreResult) {
    return {
      ...restoreResult,
      document: cloneWorkflowDocument(restoreResult.document),
      draft: cloneWorkflowDraft(restoreResult.draft),
      restoredVersion: cloneWorkflowVersionHistoryItem(restoreResult.restoredVersion),
    };
  }

  const saveResult = normalizeWorkflowDraftSaveResult(restoreResult);
  const restoredVersion = saveResult.document.versionHistory.find(
    (version) => version.id === saveResult.document.currentVersion?.id,
  ) ?? createWorkflowVersionHistoryItem(
    saveResult.document.id,
    saveResult.document.revision,
    saveResult.savedAt,
    saveResult.draft,
  );

  return {
    ...saveResult,
    restoredAt: saveResult.savedAt,
    restoredVersion,
  };
}

export function cloneWorkflowVersionHistory(versionHistory: WorkflowVersionHistoryItem[]) {
  return versionHistory.map(cloneWorkflowVersionHistoryItem);
}

export function cloneWorkflowVersionHistoryItem(
  version: WorkflowVersionHistoryItem,
): WorkflowVersionHistoryItem {
  return {
    ...version,
    draft: cloneWorkflowDraft(version.draft),
  };
}

export function cloneWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  const sanitizedDraft = hydrateWorkflowDraft(draft);

  return {
    edges: sanitizedDraft.edges.map((edge) => ({
      ...edge,
      data: edge.data ? clonePersistableWorkflowData(edge.data) : edge.data,
    })),
    nodes: sanitizedDraft.nodes.map((node) => ({
      ...node,
      data: clonePersistableWorkflowData(node.data),
      position: { ...node.position },
    })),
    viewport: { ...sanitizedDraft.viewport },
  };
}

function clonePersistableWorkflowData<TData extends Record<string, unknown>>(data: TData): TData {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, clonePersistableWorkflowValue(value)]),
  ) as TData;
}

function clonePersistableWorkflowValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clonePersistableWorkflowValue);
  }

  if (value && typeof value === "object") {
    return clonePersistableWorkflowData(value as Record<string, unknown>);
  }

  return value;
}

export function createWorkflowDraftHash(draft: WorkflowDraft): string {
  const canonicalDraft = canonicalizeWorkflowDraft(draft);
  const serializedDraft = JSON.stringify({
    edges: canonicalDraft.edges,
    nodes: canonicalDraft.nodes,
  });

  return hashWorkflowValue("draft", serializedDraft);
}

export function createWorkflowPublishHash(draft: WorkflowDraft): string {
  return hashWorkflowValue("publish", JSON.stringify(createWorkflowExecutionGraph(draft)));
}

function hashWorkflowValue(prefix: "draft" | "publish", serializedValue: string) {
  let hash = 2166136261;

  for (let index = 0; index < serializedValue.length; index += 1) {
    hash ^= serializedValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}_${(hash >>> 0).toString(36)}_${serializedValue.length.toString(36)}`;
}

export function getWorkflowTrigger(draft: WorkflowDraft) {
  const entryNode = findWorkflowEntryNode(draft.nodes);
  if (entryNode?.data.kind !== "start") return undefined;
  const triggerLabels = entryNode.data.triggers.map(trigger => {
    if (trigger.type === "contact.friend_added") return "添加好友";
    if (trigger.type === "customer.tag_added") return "添加标签";
    return trigger.match === "keywords" ? "消息关键词" : "用户消息";
  });
  return [...new Set(triggerLabels)].join("、") || undefined;
}

export function getWorkflowConversion(draft: WorkflowDraft) {
  const terminalNode = findWorkflowTerminalNode(draft.nodes);
  return terminalNode ? "-" : undefined;
}

export function createWorkflowPublishedVersion(
  workflowId: string,
  revision: number,
  publishedAt: string,
): WorkflowPublishedVersion {
  return {
    id: `${workflowId}-r${revision}`,
    name: `版本 ${revision}`,
    publishedAt,
    revision,
  };
}

export function createWorkflowVersionHistoryItem(
  workflowId: string,
  revision: number,
  publishedAt: string,
  draft: WorkflowDraft,
): WorkflowVersionHistoryItem {
  return {
    ...createWorkflowPublishedVersion(workflowId, revision, publishedAt),
    draft: cloneWorkflowDraft(draft),
  };
}

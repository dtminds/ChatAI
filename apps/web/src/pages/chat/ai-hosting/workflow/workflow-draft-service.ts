import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createInitialDraft,
  createInitialEdges,
  createInitialNodes,
} from "./graph";
import {
  canonicalizeWorkflowDraft,
  hydrateWorkflowDraft,
  isWorkflowDraftEqual,
} from "./workflow-draft-normalizer";
import type { WorkflowDraft } from "./types";

export type WorkflowDocumentStatus = "Draft" | "Published" | "Paused";

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

export type WorkflowDocument = WorkflowListItem & {
  currentVersion: WorkflowPublishedVersion | null;
  draft: WorkflowDraft;
  draftHash: string;
  publishedAt: string | null;
  publishedDraft: WorkflowDraft | null;
  publishedRevision: number | null;
  revision: number;
  savedAt: string;
  versionHistory: WorkflowVersionHistoryItem[];
};

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

export type WorkflowDraftPublishResult = {
  document: WorkflowDocument;
  draft: WorkflowDraft;
  draftHash: string;
  publishedAt: string;
  publishedRevision: number;
  revision: number;
  updatedAt: string;
  version: WorkflowPublishedVersion;
};

export type WorkflowDraftRestoreResult = WorkflowDraftSaveResult & {
  restoredAt: string;
  restoredVersion: WorkflowVersionHistoryItem;
};

export type WorkflowDraftReader = {
  getDocument: (workflowId: string | undefined) => WorkflowDocument;
  listDocuments: () => WorkflowListItem[];
};

export type WorkflowDraftWriter = {
  importDraft: (
    workflowId: string | undefined,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftImportResult | WorkflowDocument> | WorkflowDraftImportResult | WorkflowDocument;
  publishDraft: (
    workflowId: string | undefined,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftPublishResult | WorkflowDocument> | WorkflowDraftPublishResult | WorkflowDocument;
  reset: () => void;
  restoreVersion: (
    workflowId: string | undefined,
    versionId: string,
  ) => Promise<WorkflowDraftRestoreResult | WorkflowDocument> | WorkflowDraftRestoreResult | WorkflowDocument;
  saveDraft: (
    workflowId: string | undefined,
    draft: WorkflowDraft,
  ) => Promise<WorkflowDraftSaveResult | WorkflowDocument> | WorkflowDraftSaveResult | WorkflowDocument;
};

export type WorkflowDraftRepository = WorkflowDraftReader & WorkflowDraftWriter;

export type SyncWorkflowDraftRepository = Omit<WorkflowDraftRepository, "importDraft" | "publishDraft" | "restoreVersion" | "saveDraft"> & {
  importDraft: (workflowId: string | undefined, draft: WorkflowDraft) => WorkflowDraftImportResult;
  publishDraft: (workflowId: string | undefined, draft: WorkflowDraft) => WorkflowDraftPublishResult;
  restoreVersion: (workflowId: string | undefined, versionId: string) => WorkflowDraftRestoreResult;
  saveDraft: (workflowId: string | undefined, draft: WorkflowDraft) => WorkflowDraftSaveResult;
};

const WORKFLOW_SAVE_DEBOUNCE_MS = 500;

const workflowDraftRepository = createWorkflowDraftRepository();

export function createWorkflowDraftRepository(): SyncWorkflowDraftRepository {
  return createInMemoryWorkflowDraftRepository();
}

export function listWorkflowDocuments(): WorkflowListItem[] {
  return workflowDraftRepository.listDocuments();
}

export function getWorkflowDocument(workflowId: string | undefined): WorkflowDocument {
  return workflowDraftRepository.getDocument(workflowId);
}

export function getWorkflowName(workflowId: string | undefined) {
  return getWorkflowDocument(workflowId).name;
}

export function saveWorkflowDraft(
  workflowId: string | undefined,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftRepository.saveDraft(workflowId, draft).document;
}

export function publishWorkflowDraft(
  workflowId: string | undefined,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftRepository.publishDraft(workflowId, draft).document;
}

export function importWorkflowDraft(
  workflowId: string | undefined,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftRepository.importDraft(workflowId, draft).document;
}

export function restoreWorkflowVersion(
  workflowId: string | undefined,
  versionId: string,
): WorkflowDocument {
  return workflowDraftRepository.restoreVersion(workflowId, versionId).document;
}

export function cloneWorkflowDraftSnapshot(draft: WorkflowDraft): WorkflowDraft {
  return cloneWorkflowDraft(draft);
}

export function resetWorkflowDocumentsForTest() {
  workflowDraftRepository.reset();
}

export function useWorkflowDocument(
  workflowId: string | undefined,
  repository: WorkflowDraftRepository = workflowDraftRepository,
) {
  const [document, setDocument] = useState(() => repository.getDocument(workflowId));
  const [importState, setImportState] = useState<WorkflowDraftImportStatus>("idle");
  const [publishState, setPublishState] = useState<WorkflowDraftPublishStatus>("idle");
  const [restoreState, setRestoreState] = useState<WorkflowDraftRestoreStatus>("idle");
  const [saveState, setSaveState] = useState<WorkflowDraftSaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState(() => document.savedAt);
  const [lastSavedDraftHash, setLastSavedDraftHash] = useState(() => document.draftHash);
  const [lastPublishedDraftHash, setLastPublishedDraftHash] = useState(() => createWorkflowPublishedDraftHash(document));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishRequestRef = useRef(0);
  const restoreRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const pendingSaveRef = useRef<{
    draft: WorkflowDraft;
    requestId: number;
    workflowId: string;
  } | null>(null);
  const workflowIdRef = useRef(document.id);
  const flushPendingSave = useCallback((options: { updateState?: boolean } = {}) => {
    const { updateState = true } = options;
    const pendingSave = pendingSaveRef.current;

    if (!pendingSave) {
      return undefined;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    pendingSaveRef.current = null;
    let saveResult:
      | Promise<WorkflowDraftSaveResult | WorkflowDocument>
      | WorkflowDraftSaveResult
      | WorkflowDocument;

    try {
      saveResult = repository.saveDraft(pendingSave.workflowId, pendingSave.draft);
    }
    catch (error) {
      if (updateState && saveRequestRef.current === pendingSave.requestId) {
        setSaveState("error");
      }

      return undefined;
    }

    const handleSavedDocument = (saveResult: WorkflowDraftSaveResult | WorkflowDocument) => {
      const normalizedSaveResult = normalizeWorkflowDraftSaveResult(saveResult);
      const { document: savedDocument } = normalizedSaveResult;

      if (
        !updateState
        || saveRequestRef.current !== pendingSave.requestId
        || workflowIdRef.current !== pendingSave.workflowId
      ) {
        return normalizedSaveResult;
      }

      setSaveState("saved");
      setLastSavedAt(normalizedSaveResult.savedAt);
      setLastSavedDraftHash(normalizedSaveResult.draftHash);
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: savedDocument.conversion,
        draftHash: normalizedSaveResult.draftHash,
        nodes: savedDocument.nodes,
        revision: savedDocument.revision,
        savedAt: normalizedSaveResult.savedAt,
        trigger: savedDocument.trigger,
        updatedAt: normalizedSaveResult.updatedAt,
      }));

      return normalizedSaveResult;
    };

    const handleSaveError = (error: unknown) => {
      if (
        updateState
        && saveRequestRef.current === pendingSave.requestId
        && workflowIdRef.current === pendingSave.workflowId
      ) {
        setSaveState("error");
      }

      return undefined;
    };

    return Promise.resolve(saveResult).then(handleSavedDocument, handleSaveError);
  }, [repository]);

  useEffect(() => {
    flushPendingSave({ updateState: false });

    const nextDocument = repository.getDocument(workflowId);
    workflowIdRef.current = nextDocument.id;
    setDocument(nextDocument);
    setImportState("idle");
    setPublishState(getWorkflowPublishStateForDraft(nextDocument.draft, nextDocument));
    setRestoreState("idle");
    setSaveState("saved");
    setLastSavedAt(nextDocument.savedAt);
    setLastSavedDraftHash(nextDocument.draftHash);
    setLastPublishedDraftHash(createWorkflowPublishedDraftHash(nextDocument));

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [flushPendingSave, repository, workflowId]);

  const markDirty = useCallback((draft: WorkflowDraft) => {
    const draftToSave = cloneWorkflowDraft(draft);
    const nextDraftHash = createWorkflowDraftHash(draftToSave);
    setPublishState(getWorkflowPublishStateFromHashes(nextDraftHash, lastPublishedDraftHash));

    if (nextDraftHash === lastSavedDraftHash) {
      saveRequestRef.current += 1;
      pendingSaveRef.current = null;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setSaveState("saved");
      return;
    }

    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    pendingSaveRef.current = {
      draft: draftToSave,
      requestId: saveRequestId,
      workflowId: workflowIdRef.current,
    };
    setSaveState(saveTimerRef.current ? "dirty" : "saving");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      flushPendingSave();
    }, WORKFLOW_SAVE_DEBOUNCE_MS);
  }, [flushPendingSave, lastPublishedDraftHash, lastSavedDraftHash]);

  const importDraft = useCallback(async (draft: WorkflowDraft) => {
    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    const workflowIdToImport = workflowIdRef.current;
    const draftToImport = cloneWorkflowDraft(draft);

    setImportState("importing");
    pendingSaveRef.current = null;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const importResult = await Promise.resolve(
        repository.importDraft(workflowIdToImport, draftToImport),
      );
      const normalizedImportResult = normalizeWorkflowDraftImportResult(importResult);
      const { document: importedDocument } = normalizedImportResult;

      if (
        saveRequestRef.current !== saveRequestId
        || workflowIdRef.current !== workflowIdToImport
      ) {
        return normalizedImportResult;
      }

      setImportState("imported");
      setSaveState("saved");
      setLastSavedAt(normalizedImportResult.savedAt);
      setLastSavedDraftHash(normalizedImportResult.draftHash);
      setLastPublishedDraftHash(createWorkflowPublishedDraftHash(importedDocument));
      setPublishState(getWorkflowPublishStateForDraft(normalizedImportResult.draft, importedDocument));
      setDocument(importedDocument);

      return normalizedImportResult;
    }
    catch (error) {
      if (
        saveRequestRef.current === saveRequestId
        && workflowIdRef.current === workflowIdToImport
      ) {
        setImportState("error");
        setSaveState("error");
      }

      return undefined;
    }
  }, [repository]);

  const publishDraft = useCallback(async (draft: WorkflowDraft) => {
    const publishRequestId = publishRequestRef.current + 1;
    publishRequestRef.current = publishRequestId;
    const workflowIdToPublish = workflowIdRef.current;
    const draftToPublish = cloneWorkflowDraft(draft);

    setPublishState("publishing");

    try {
      await flushPendingSave();
      const publishResult = await Promise.resolve(
        repository.publishDraft(workflowIdToPublish, draftToPublish),
      );
      const normalizedPublishResult = normalizeWorkflowDraftPublishResult(publishResult);
      const { document: publishedDocument } = normalizedPublishResult;

      if (
        publishRequestRef.current !== publishRequestId
        || workflowIdRef.current !== workflowIdToPublish
      ) {
        return normalizedPublishResult;
      }

      setPublishState("published");
      setSaveState("saved");
      setLastSavedAt(publishedDocument.savedAt);
      setLastSavedDraftHash(normalizedPublishResult.draftHash);
      setLastPublishedDraftHash(normalizedPublishResult.draftHash);
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: publishedDocument.conversion,
        currentVersion: normalizedPublishResult.version,
        draftHash: normalizedPublishResult.draftHash,
        nodes: publishedDocument.nodes,
        publishedAt: normalizedPublishResult.publishedAt,
        publishedDraft: cloneWorkflowDraft(normalizedPublishResult.draft),
        publishedRevision: normalizedPublishResult.publishedRevision,
        revision: publishedDocument.revision,
        savedAt: publishedDocument.savedAt,
        status: publishedDocument.status,
        trigger: publishedDocument.trigger,
        updatedAt: normalizedPublishResult.updatedAt,
        versionHistory: cloneWorkflowVersionHistory(publishedDocument.versionHistory),
      }));

      return normalizedPublishResult;
    }
    catch (error) {
      if (
        publishRequestRef.current === publishRequestId
        && workflowIdRef.current === workflowIdToPublish
      ) {
        setPublishState("error");
      }

      return undefined;
    }
  }, [flushPendingSave, repository]);

  const restoreVersion = useCallback(async (versionId: string) => {
    const restoreRequestId = restoreRequestRef.current + 1;
    restoreRequestRef.current = restoreRequestId;
    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    const workflowIdToRestore = workflowIdRef.current;

    setRestoreState("restoring");
    pendingSaveRef.current = null;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const restoreResult = await Promise.resolve(
        repository.restoreVersion(workflowIdToRestore, versionId),
      );
      const normalizedRestoreResult = normalizeWorkflowDraftRestoreResult(restoreResult);
      const { document: restoredDocument } = normalizedRestoreResult;

      if (
        restoreRequestRef.current !== restoreRequestId
        || saveRequestRef.current !== saveRequestId
        || workflowIdRef.current !== workflowIdToRestore
      ) {
        return normalizedRestoreResult;
      }

      setRestoreState("restored");
      setSaveState("saved");
      setLastSavedAt(normalizedRestoreResult.savedAt);
      setLastSavedDraftHash(normalizedRestoreResult.draftHash);
      setLastPublishedDraftHash(createWorkflowPublishedDraftHash(restoredDocument));
      setPublishState(getWorkflowPublishStateForDraft(normalizedRestoreResult.draft, restoredDocument));
      setDocument(restoredDocument);

      return normalizedRestoreResult;
    }
    catch (error) {
      if (
        restoreRequestRef.current === restoreRequestId
        && saveRequestRef.current === saveRequestId
        && workflowIdRef.current === workflowIdToRestore
      ) {
        setRestoreState("error");
        setSaveState("error");
      }

      return undefined;
    }
  }, [repository]);

  useEffect(() => () => {
    flushPendingSave({ updateState: false });
  }, [flushPendingSave]);

  return useMemo(() => ({
    document,
    importDraft,
    importState,
    lastSavedAt,
    lastSavedDraftHash,
    markDirty,
    publishDraft,
    publishState,
    restoreState,
    restoreVersion,
    saveState,
  }), [document, importDraft, importState, lastSavedAt, lastSavedDraftHash, markDirty, publishDraft, publishState, restoreState, restoreVersion, saveState]);
}

function createWorkflowPublishedDraftHash(
  document: WorkflowDocument,
) {
  return document.publishedDraft ? createWorkflowDraftHash(document.publishedDraft) : undefined;
}

function getWorkflowPublishStateForDraft(
  draft: WorkflowDraft,
  document: WorkflowDocument,
): WorkflowDraftPublishStatus {
  return getWorkflowPublishStateFromHashes(
    createWorkflowDraftHash(draft),
    createWorkflowPublishedDraftHash(document),
  );
}

function getWorkflowPublishStateFromHashes(
  draftHash: string,
  publishedDraftHash: string | undefined,
): WorkflowDraftPublishStatus {
  return publishedDraftHash && draftHash === publishedDraftHash ? "published" : "idle";
}

function cloneWorkflowDocument(document: WorkflowDocument): WorkflowDocument {
  const draft = cloneWorkflowDraft(document.draft);

  return {
    ...document,
    currentVersion: document.currentVersion ? { ...document.currentVersion } : null,
    draft,
    draftHash: document.draftHash ?? createWorkflowDraftHash(draft),
    publishedDraft: document.publishedDraft ? cloneWorkflowDraft(document.publishedDraft) : null,
    versionHistory: cloneWorkflowVersionHistory(document.versionHistory),
  };
}

function normalizeWorkflowDraftSaveResult(
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

function normalizeWorkflowDraftImportResult(
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

function normalizeWorkflowDraftPublishResult(
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
  const publishedAt = document.publishedAt ?? document.updatedAt;
  const publishedRevision = document.publishedRevision ?? document.revision;
  const version = document.currentVersion ?? createWorkflowPublishedVersion(
    document.id,
    publishedRevision,
    publishedAt,
  );
  const draft = document.publishedDraft ? cloneWorkflowDraft(document.publishedDraft) : cloneWorkflowDraft(document.draft);

  return {
    document,
    draft,
    draftHash: document.draftHash,
    publishedAt,
    publishedRevision,
    revision: document.revision,
    updatedAt: document.updatedAt,
    version,
  };
}

function normalizeWorkflowDraftRestoreResult(
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

function cloneWorkflowVersionHistory(versionHistory: WorkflowVersionHistoryItem[]) {
  return versionHistory.map(cloneWorkflowVersionHistoryItem);
}

function cloneWorkflowVersionHistoryItem(version: WorkflowVersionHistoryItem): WorkflowVersionHistoryItem {
  return {
    ...version,
    draft: cloneWorkflowDraft(version.draft),
  };
}

function cloneWorkflowDraft(draft: WorkflowDraft): WorkflowDraft {
  const sanitizedDraft = hydrateWorkflowDraft(draft);

  return {
    edges: sanitizedDraft.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
    })),
    nodes: sanitizedDraft.nodes.map((node) => ({
      ...node,
      data: { ...node.data },
      position: { ...node.position },
    })),
    viewport: { ...sanitizedDraft.viewport },
  };
}

export function createWorkflowDraftHash(draft: WorkflowDraft): string {
  const serializedDraft = JSON.stringify(canonicalizeWorkflowDraft(draft));
  let hash = 2166136261;

  for (let index = 0; index < serializedDraft.length; index += 1) {
    hash ^= serializedDraft.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `draft_${(hash >>> 0).toString(36)}_${serializedDraft.length.toString(36)}`;
}

function getWorkflowTrigger(draft: WorkflowDraft) {
  return draft.nodes.find((node) => node.data.kind === "trigger")?.data.audience;
}

function getWorkflowConversion(draft: WorkflowDraft) {
  const conversion = draft.nodes.find((node) => node.data.kind === "goal")?.data.conversion;
  return typeof conversion === "number" ? `${conversion}%` : undefined;
}

export function createInMemoryWorkflowDraftRepository(): SyncWorkflowDraftRepository {
  let workflowDocuments = createWorkflowDocuments();

  function getWorkflowDocumentIndex(workflowId: string | undefined) {
    const documentIndex = workflowDocuments.findIndex((workflow) => workflow.id === workflowId);
    return documentIndex >= 0 ? documentIndex : 0;
  }

  return {
    getDocument: (workflowId) => cloneWorkflowDocument(
      workflowDocuments[getWorkflowDocumentIndex(workflowId)],
    ),
    importDraft: (workflowId, draft) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const nextDraft = cloneWorkflowDraft(draft);
      const importedAt = "刚刚";
      const nextDraftHash = createWorkflowDraftHash(nextDraft);
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        draft: nextDraft,
        draftHash: nextDraftHash,
        nodes: nextDraft.nodes.length,
        revision: currentDocument.revision + 1,
        savedAt: importedAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: importedAt,
      };

      workflowDocuments[documentIndex] = nextDocument;
      return {
        document: cloneWorkflowDocument(nextDocument),
        draft: cloneWorkflowDraft(nextDraft),
        draftHash: nextDraftHash,
        importedAt,
        revision: nextDocument.revision,
        savedAt: importedAt,
        updatedAt: importedAt,
      };
    },
    listDocuments: () => workflowDocuments.map(({
      currentVersion: _currentVersion,
      draft: _draft,
      draftHash: _draftHash,
      publishedAt: _publishedAt,
      publishedDraft: _publishedDraft,
      publishedRevision: _publishedRevision,
      revision: _revision,
      savedAt: _savedAt,
      versionHistory: _versionHistory,
      ...workflow
    }) => workflow),
    publishDraft: (workflowId, draft) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const nextDraft = cloneWorkflowDraft(draft);
      const shouldCreateDraftRevision = !isWorkflowDraftEqual(currentDocument.draft, nextDraft);
      const nextRevision = shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision;
      const publishedAt = "刚刚";
      const version = createWorkflowVersionHistoryItem(currentDocument.id, nextRevision, publishedAt, nextDraft);
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : currentDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        currentVersion: version,
        draft: nextDraft,
        draftHash: nextDraftHash,
        nodes: nextDraft.nodes.length,
        publishedAt,
        publishedDraft: cloneWorkflowDraft(nextDraft),
        publishedRevision: nextRevision,
        revision: nextRevision,
        savedAt: publishedAt,
        status: "Published",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: publishedAt,
        versionHistory: [
          version,
          ...currentDocument.versionHistory.filter((historyVersion) => historyVersion.id !== version.id),
        ],
      };

      workflowDocuments[documentIndex] = nextDocument;
      return normalizeWorkflowDraftPublishResult(nextDocument);
    },
    reset: () => {
      workflowDocuments = createWorkflowDocuments();
    },
    restoreVersion: (workflowId, versionId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const restoredVersion = currentDocument.versionHistory.find((version) => version.id === versionId);

      if (!restoredVersion) {
        throw new Error(`Unknown workflow version: ${versionId}`);
      }

      const nextDraft = cloneWorkflowDraft(restoredVersion.draft);
      const restoredAt = "刚刚";
      const nextDraftHash = createWorkflowDraftHash(nextDraft);
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        currentVersion: {
          id: restoredVersion.id,
          name: restoredVersion.name,
          publishedAt: restoredVersion.publishedAt,
          revision: restoredVersion.revision,
        },
        draft: nextDraft,
        draftHash: nextDraftHash,
        nodes: nextDraft.nodes.length,
        revision: currentDocument.revision + 1,
        savedAt: restoredAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: restoredAt,
      };

      workflowDocuments[documentIndex] = nextDocument;
      return {
        document: cloneWorkflowDocument(nextDocument),
        draft: cloneWorkflowDraft(nextDraft),
        draftHash: nextDraftHash,
        restoredAt,
        restoredVersion: cloneWorkflowVersionHistoryItem(restoredVersion),
        revision: nextDocument.revision,
        savedAt: restoredAt,
        updatedAt: restoredAt,
      };
    },
    saveDraft: (workflowId, draft) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const nextDraft = cloneWorkflowDraft(draft);
      const shouldCreateDraftRevision = !isWorkflowDraftEqual(currentDocument.draft, nextDraft);
      const savedAt = shouldCreateDraftRevision ? "刚刚" : currentDocument.savedAt;
      const updatedAt = shouldCreateDraftRevision ? "刚刚" : currentDocument.updatedAt;
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : currentDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        draft: nextDraft,
        draftHash: nextDraftHash,
        nodes: nextDraft.nodes.length,
        revision: shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision,
        savedAt,
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt,
      };

      workflowDocuments[documentIndex] = nextDocument;
      return normalizeWorkflowDraftSaveResult(nextDocument);
    },
  };
}

function createWorkflowPublishedVersion(
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

function createWorkflowVersionHistoryItem(
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

function createWorkflowDocuments(): WorkflowDocument[] {
  const newcomerConversionDraft = createInitialDraft();
  const vipReactivationDraft: WorkflowDraft = {
    edges: createInitialEdges(),
    nodes: createInitialNodes().map((node) =>
      node.id === "trigger"
        ? {
            ...node,
            data: {
              ...node.data,
              audience: "90 天未复购会员",
              title: "复购唤醒触发",
            },
          }
        : node,
    ),
    viewport: createInitialDraft().viewport,
  };
  const liveFollowUpDraft: WorkflowDraft = {
    edges: createInitialEdges(),
    nodes: createInitialNodes().map((node) =>
      node.id === "trigger"
        ? {
            ...node,
            data: {
              ...node.data,
              audience: "直播间互动但未下单客户",
              title: "直播互动触发",
            },
          }
        : node,
    ),
    viewport: createInitialDraft().viewport,
  };

  return [
    {
      conversion: "18.4%",
      currentVersion: null,
      draft: newcomerConversionDraft,
      draftHash: createWorkflowDraftHash(newcomerConversionDraft),
      entered: "124.8万",
      id: "newcomer-conversion",
      name: "新人转化旅程",
      nodes: 8,
      owner: "运营主管",
      publishedAt: null,
      publishedDraft: null,
      publishedRevision: null,
      revision: 1,
      savedAt: "18:20",
      status: "Draft",
      trigger: "近 30 天新入会且未首购客户",
      updatedAt: "今天 18:20",
      versionHistory: [],
    },
    {
      conversion: "23.1%",
      currentVersion: createWorkflowPublishedVersion("vip-reactivation", 1, "昨天 21:04"),
      draft: vipReactivationDraft,
      draftHash: createWorkflowDraftHash(vipReactivationDraft),
      entered: "86.3万",
      id: "vip-reactivation",
      name: "会员复购唤醒",
      nodes: 12,
      owner: "增长运营",
      publishedAt: "昨天 21:04",
      publishedDraft: vipReactivationDraft,
      publishedRevision: 1,
      revision: 1,
      savedAt: "昨天 21:04",
      status: "Published",
      trigger: "90 天未复购会员",
      updatedAt: "昨天 21:04",
      versionHistory: [
        createWorkflowVersionHistoryItem("vip-reactivation", 1, "昨天 21:04", vipReactivationDraft),
      ],
    },
    {
      conversion: "9.7%",
      currentVersion: null,
      draft: liveFollowUpDraft,
      draftHash: createWorkflowDraftHash(liveFollowUpDraft),
      entered: "42.6万",
      id: "live-follow-up",
      name: "直播后跟进",
      nodes: 6,
      owner: "直播运营",
      publishedAt: null,
      publishedDraft: null,
      publishedRevision: null,
      revision: 1,
      savedAt: "7月4日 16:12",
      status: "Paused",
      trigger: "直播间互动但未下单客户",
      updatedAt: "7月4日 16:12",
      versionHistory: [],
    },
  ];
}

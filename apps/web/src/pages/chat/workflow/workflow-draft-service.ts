import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloneWorkflowDraft,
  cloneWorkflowVersionHistory,
  createWorkflowDraftHash,
  createWorkflowPublishedDraftHash,
  getWorkflowPublishStateForDraft,
  getWorkflowPublishStateFromHashes,
  normalizeWorkflowDraftImportResult,
  normalizeWorkflowDraftPublishResult,
  normalizeWorkflowDraftRestoreResult,
  normalizeWorkflowDraftSaveResult,
} from "./workflow-draft-persistence";
import { createInMemoryWorkflowDraftRepository } from "./workflow-in-memory-repository";
import { createHttpWorkflowDraftRepository } from "./workflow-http-repository";
import { WorkflowRepositoryError } from "./workflow-repository-types";
import type {
  WorkflowDocument,
  WorkflowDraftImportStatus,
  WorkflowDraftPublishStatus,
  WorkflowDraftRepository,
  WorkflowDraftRestoreStatus,
  WorkflowDraftSaveResult,
  WorkflowDraftSaveStatus,
  WorkflowListItem,
} from "./workflow-repository-types";
import type { WorkflowDraft } from "./types";

export * from "./workflow-repository-types";
export { createWorkflowDraftHash } from "./workflow-draft-persistence";
export { createInMemoryWorkflowDraftRepository } from "./workflow-in-memory-repository";

const WORKFLOW_SAVE_DEBOUNCE_MS = 500;
const workflowDraftTestRepository = createInMemoryWorkflowDraftRepository();
const workflowDraftRepository = import.meta.env.MODE === "test"
  ? workflowDraftTestRepository
  : createHttpWorkflowDraftRepository();

export function createWorkflowDraftRepository(): WorkflowDraftRepository {
  return import.meta.env.MODE === "test"
    ? createInMemoryWorkflowDraftRepository()
    : createHttpWorkflowDraftRepository();
}

export function listWorkflowDocuments(): WorkflowListItem[] {
  return workflowDraftTestRepository.listDocuments();
}

export function getWorkflowDocument(workflowId: string): WorkflowDocument {
  return workflowDraftTestRepository.getDocument(workflowId);
}

export function getWorkflowName(workflowId: string) {
  return getWorkflowDocument(workflowId).name;
}

export function saveWorkflowDraft(
  workflowId: string,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftTestRepository.saveDraft(workflowId, draft).document;
}

export function publishWorkflowDraft(
  workflowId: string,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftTestRepository.publishDraft(workflowId, draft).document;
}

export function importWorkflowDraft(
  workflowId: string,
  draft: WorkflowDraft,
): WorkflowDocument {
  return workflowDraftTestRepository.importDraft(workflowId, draft).document;
}

export function restoreWorkflowVersion(
  workflowId: string,
  versionId: string,
): WorkflowDocument {
  return workflowDraftTestRepository.restoreVersion(workflowId, versionId).document;
}

export function cloneWorkflowDraftSnapshot(draft: WorkflowDraft): WorkflowDraft {
  return cloneWorkflowDraft(draft);
}

export function resetWorkflowDocumentsForTest() {
  workflowDraftTestRepository.reset();
}

export function getWorkflowDraftRepository(): WorkflowDraftRepository {
  return workflowDraftRepository;
}

function getSynchronousWorkflowDocument(
  repository: WorkflowDraftRepository,
  workflowId: string,
) {
  const document = repository.getDocument(workflowId);

  if (document instanceof Promise) {
    throw new Error("Async workflow repositories require a preloaded document");
  }

  return document;
}

export function useWorkflowDocument(
  workflowId: string,
  repository: WorkflowDraftRepository = workflowDraftTestRepository,
  initialDocument?: WorkflowDocument,
) {
  const [document, setDocument] = useState(() => initialDocument ?? getSynchronousWorkflowDocument(repository, workflowId));
  const [importState, setImportState] = useState<WorkflowDraftImportStatus>("idle");
  const [publishState, setPublishState] = useState<WorkflowDraftPublishStatus>("idle");
  const [publishError, setPublishError] = useState<WorkflowRepositoryError | null>(null);
  const [restoreState, setRestoreState] = useState<WorkflowDraftRestoreStatus>("idle");
  const [saveState, setSaveState] = useState<WorkflowDraftSaveStatus>("saved");
  const [saveError, setSaveError] = useState<WorkflowRepositoryError | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(() => document.savedAt);
  const [lastSavedDraftHash, setLastSavedDraftHash] = useState(() => document.draftHash);
  const [lastPublishedDraftHash, setLastPublishedDraftHash] = useState(() => createWorkflowPublishedDraftHash(document));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishRequestRef = useRef(0);
  const publishingRef = useRef(false);
  const restoreRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const pendingSaveRef = useRef<{
    draft: WorkflowDraft;
    requestId: number;
    workflowId: string;
  } | null>(null);
  const failedSaveRef = useRef<{
    draft: WorkflowDraft;
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
        failedSaveRef.current = {
          draft: pendingSave.draft,
          workflowId: pendingSave.workflowId,
        };
        setSaveError(normalizeWorkflowRepositoryError(error));
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
      failedSaveRef.current = null;
      setSaveError(null);
      setLastSavedAt(normalizedSaveResult.savedAt);
      setLastSavedDraftHash(normalizedSaveResult.draftHash);
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: savedDocument.conversion,
        draft: cloneWorkflowDraft(normalizedSaveResult.draft),
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
        failedSaveRef.current = {
          draft: pendingSave.draft,
          workflowId: pendingSave.workflowId,
        };
        setSaveError(normalizeWorkflowRepositoryError(error));
        setSaveState("error");
      }

      return undefined;
    };

    return Promise.resolve(saveResult).then(handleSavedDocument, handleSaveError);
  }, [repository]);

  useEffect(() => {
    flushPendingSave({ updateState: false });

    const nextDocument = initialDocument ?? getSynchronousWorkflowDocument(repository, workflowId);
    workflowIdRef.current = nextDocument.id;
    publishingRef.current = false;
    setDocument(nextDocument);
    setImportState("idle");
    setPublishState(getWorkflowPublishStateForDraft(nextDocument.draft, nextDocument));
    setPublishError(null);
    setRestoreState("idle");
    setSaveState("saved");
    setSaveError(null);
    failedSaveRef.current = null;
    setLastSavedAt(nextDocument.savedAt);
    setLastSavedDraftHash(nextDocument.draftHash);
    setLastPublishedDraftHash(createWorkflowPublishedDraftHash(nextDocument));

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [flushPendingSave, initialDocument, repository, workflowId]);

  const markDirty = useCallback((draft: WorkflowDraft) => {
    const draftToSave = cloneWorkflowDraft(draft);
    const nextDraftHash = createWorkflowDraftHash(draftToSave);

    if (publishingRef.current) {
      return;
    }

    setPublishState(getWorkflowPublishStateFromHashes(nextDraftHash, lastPublishedDraftHash));
    setPublishError(null);

    if (nextDraftHash === lastSavedDraftHash) {
      saveRequestRef.current += 1;
      pendingSaveRef.current = null;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setSaveState("saved");
      setSaveError(null);
      failedSaveRef.current = null;
      return;
    }

    publishRequestRef.current += 1;
    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    pendingSaveRef.current = {
      draft: draftToSave,
      requestId: saveRequestId,
      workflowId: workflowIdRef.current,
    };
    failedSaveRef.current = null;
    setSaveError(null);
    setSaveState(saveTimerRef.current ? "dirty" : "saving");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      flushPendingSave();
    }, WORKFLOW_SAVE_DEBOUNCE_MS);
  }, [flushPendingSave, lastPublishedDraftHash, lastSavedDraftHash]);

  const retrySave = useCallback(() => {
    const failedSave = failedSaveRef.current;

    if (!failedSave || failedSave.workflowId !== workflowIdRef.current) {
      return undefined;
    }

    const requestId = saveRequestRef.current + 1;
    saveRequestRef.current = requestId;
    pendingSaveRef.current = {
      draft: cloneWorkflowDraft(failedSave.draft),
      requestId,
      workflowId: failedSave.workflowId,
    };
    failedSaveRef.current = null;
    setSaveError(null);
    setSaveState("saving");
    return flushPendingSave();
  }, [flushPendingSave]);

  const importDraft = useCallback(async (draft: WorkflowDraft) => {
    const saveRequestId = saveRequestRef.current + 1;
    saveRequestRef.current = saveRequestId;
    publishRequestRef.current += 1;
    publishingRef.current = false;
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
      setSaveError(null);
      failedSaveRef.current = null;
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

    publishingRef.current = true;
    setPublishState("publishing");
    setPublishError(null);

    try {
      const flushedSaveResult = await flushPendingSave();
      const expectedBaseDraftHash = flushedSaveResult?.draftHash ?? lastSavedDraftHash;
      const publishResult = await Promise.resolve(
        repository.publishDraft(workflowIdToPublish, draftToPublish, {
          expectedBaseDraftHash,
        }),
      );
      const normalizedPublishResult = normalizeWorkflowDraftPublishResult(publishResult);
      const { document: publishedDocument } = normalizedPublishResult;

      if (
        publishRequestRef.current !== publishRequestId
        || workflowIdRef.current !== workflowIdToPublish
      ) {
        return normalizedPublishResult;
      }

      publishingRef.current = false;
      setPublishState("published");
      setPublishError(null);
      setSaveState("saved");
      setSaveError(null);
      failedSaveRef.current = null;
      setLastSavedAt(publishedDocument.savedAt);
      setLastSavedDraftHash(normalizedPublishResult.draftHash);
      if (!normalizedPublishResult.validatedOnly) {
        setLastPublishedDraftHash(normalizedPublishResult.draftHash);
      }
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: publishedDocument.conversion,
        currentVersion: normalizedPublishResult.version,
        draft: cloneWorkflowDraft(normalizedPublishResult.draft),
        draftHash: normalizedPublishResult.draftHash,
        nodes: publishedDocument.nodes,
        publishedAt: normalizedPublishResult.publishedAt,
        publishedDraft: normalizedPublishResult.validatedOnly
          ? currentDocument.publishedDraft
          : cloneWorkflowDraft(normalizedPublishResult.draft),
        publishedRevision: normalizedPublishResult.publishedRevision,
        revision: publishedDocument.revision,
        savedAt: publishedDocument.savedAt,
        status: publishedDocument.status,
        trigger: publishedDocument.trigger,
        updatedAt: normalizedPublishResult.updatedAt,
        versionHistory: cloneWorkflowVersionHistory(publishedDocument.versionHistory),
        draftVersion: publishedDocument.draftVersion,
        runtimeStatus: publishedDocument.runtimeStatus,
        validatedDraftVersion: publishedDocument.validatedDraftVersion,
      }));

      return normalizedPublishResult;
    }
    catch (error) {
      if (
        publishRequestRef.current === publishRequestId
        && workflowIdRef.current === workflowIdToPublish
      ) {
        publishingRef.current = false;
        setPublishError(normalizeWorkflowRepositoryError(error));
        setPublishState("error");
      }

      return undefined;
    }
  }, [flushPendingSave, lastSavedDraftHash, repository]);

  const enableDocument = useCallback(async () => {
    if (!repository.enableDocument) {
      return undefined;
    }

    const publishRequestId = publishRequestRef.current + 1;
    publishRequestRef.current = publishRequestId;
    const workflowIdToEnable = workflowIdRef.current;
    publishingRef.current = true;
    setPublishState("publishing");
    setPublishError(null);

    try {
      await flushPendingSave();
      const enabledDocument = await Promise.resolve(repository.enableDocument(workflowIdToEnable));

      if (
        publishRequestRef.current !== publishRequestId
        || workflowIdRef.current !== workflowIdToEnable
      ) {
        return enabledDocument;
      }

      const draftHash = createWorkflowDraftHash(enabledDocument.draft);
      publishingRef.current = false;
      setPublishState("published");
      setSaveState("saved");
      setSaveError(null);
      setLastSavedAt(enabledDocument.savedAt);
      setLastSavedDraftHash(draftHash);
      setLastPublishedDraftHash(createWorkflowPublishedDraftHash(enabledDocument));
      setDocument(enabledDocument);
      return enabledDocument;
    }
    catch (error) {
      if (
        publishRequestRef.current === publishRequestId
        && workflowIdRef.current === workflowIdToEnable
      ) {
        publishingRef.current = false;
        setPublishError(normalizeWorkflowRepositoryError(error));
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
    publishRequestRef.current += 1;
    publishingRef.current = false;
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
      setSaveError(null);
      failedSaveRef.current = null;
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
    enableDocument,
    importDraft,
    importState,
    lastSavedAt,
    lastSavedDraftHash,
    markDirty,
    publishDraft,
    publishError,
    publishState,
    restoreState,
    restoreVersion,
    retrySave,
    saveError,
    saveState,
  }), [document, enableDocument, importDraft, importState, lastSavedAt, lastSavedDraftHash, markDirty, publishDraft, publishError, publishState, restoreState, restoreVersion, retrySave, saveError, saveState]);
}

export function normalizeWorkflowRepositoryError(error: unknown) {
  if (error instanceof WorkflowRepositoryError) {
    return error;
  }

  if (error instanceof TypeError) {
    return new WorkflowRepositoryError("network", error.message, { cause: error });
  }

  if (error instanceof Error) {
    return new WorkflowRepositoryError("server", error.message, { cause: error });
  }

  return new WorkflowRepositoryError("server", "Unknown workflow repository error");
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloneWorkflowDraft,
  createWorkflowDraftHash,
  createWorkflowPublishedHash,
  createWorkflowPublishHash,
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
export { createWorkflowDraftHash, createWorkflowPublishHash } from "./workflow-draft-persistence";
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
  workflowDraftTestRepository.saveDraft(workflowId, draft);
  const submitted = workflowDraftTestRepository.submitReview(workflowId);
  const reviewId = submitted.currentReview?.id;
  if (!reviewId) {
    throw new Error("Workflow review was not created");
  }
  workflowDraftTestRepository.approveReview(workflowId, reviewId);
  return workflowDraftTestRepository.publishReview(workflowId, reviewId).document;
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
  const [publishState, setPublishState] = useState<WorkflowDraftPublishStatus>(
    () => getWorkflowPublishStateForDraft(document.draft, document),
  );
  const [publishError, setPublishError] = useState<WorkflowRepositoryError | null>(null);
  const [lifecycleActionState, setLifecycleActionState] = useState<"enabling" | "idle" | "pausing" | "resuming">("idle");
  const [metadataUpdateState, setMetadataUpdateState] = useState<"idle" | "updating">("idle");
  const [restoreState, setRestoreState] = useState<WorkflowDraftRestoreStatus>("idle");
  const [saveState, setSaveState] = useState<WorkflowDraftSaveStatus>("saved");
  const [saveError, setSaveError] = useState<WorkflowRepositoryError | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(() => document.savedAt);
  const [lastSavedDraftHash, setLastSavedDraftHash] = useState(() => document.draftHash);
  const [lastPublishedPublishHash, setLastPublishedPublishHash] = useState(() => createWorkflowPublishedHash(document));
  const [currentPublishHash, setCurrentPublishHash] = useState(() => createWorkflowPublishHash(document.draft));
  const [currentReviewPublishHash, setCurrentReviewPublishHash] = useState<string | null>(
    () => document.currentReview ? createWorkflowPublishHash(document.draft) : null,
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightSaveRef = useRef<Promise<WorkflowDraftSaveResult | undefined> | null>(null);
  const publishRequestRef = useRef(0);
  const publishingRef = useRef(false);
  const metadataUpdatingRef = useRef(false);
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
  const flushPendingSave = useCallback(function flushPendingSave(
    options: { updateState?: boolean } = {},
  ): Promise<WorkflowDraftSaveResult | undefined> | undefined {
    const { updateState = true } = options;
    const inFlightSave = inFlightSaveRef.current;

    if (inFlightSave) {
      return pendingSaveRef.current
        ? inFlightSave.then(() => flushPendingSave(options))
        : inFlightSave;
    }

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

      return Promise.reject(error);
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
      setCurrentPublishHash(createWorkflowPublishHash(normalizedSaveResult.draft));
      if (savedDocument.currentReview) {
        setCurrentReviewPublishHash(createWorkflowPublishHash(normalizedSaveResult.draft));
      }
      setDocument((currentDocument) => ({
        ...currentDocument,
        conversion: savedDocument.conversion,
        currentReview: savedDocument.currentReview ?? currentDocument.currentReview,
        draft: cloneWorkflowDraft(normalizedSaveResult.draft),
        draftHash: normalizedSaveResult.draftHash,
        draftVersion: savedDocument.draftVersion,
        nodes: savedDocument.nodes,
        permissions: savedDocument.permissions,
        revision: savedDocument.revision,
        runtimeStatus: savedDocument.runtimeStatus,
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

      throw error;
    };

    const savePromise = Promise.resolve(saveResult).then(
      (result) => {
        inFlightSaveRef.current = null;
        const normalizedResult = handleSavedDocument(result);
        if (pendingSaveRef.current) {
          void flushPendingSave(options)?.catch(() => undefined);
        }
        return normalizedResult;
      },
      (error) => {
        inFlightSaveRef.current = null;
        if (pendingSaveRef.current) {
          void flushPendingSave(options)?.catch(() => undefined);
        }
        return handleSaveError(error);
      },
    );
    inFlightSaveRef.current = savePromise;
    return savePromise;
  }, [repository]);

  useEffect(() => {
    void flushPendingSave({ updateState: false })?.catch(() => undefined);

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
    setLastPublishedPublishHash(createWorkflowPublishedHash(nextDocument));
    setCurrentPublishHash(createWorkflowPublishHash(nextDocument.draft));
    setCurrentReviewPublishHash(nextDocument.currentReview
      ? createWorkflowPublishHash(nextDocument.draft)
      : null);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [flushPendingSave, initialDocument, repository, workflowId]);

  const markDirty = useCallback((draft: WorkflowDraft) => {
    const draftToSave = cloneWorkflowDraft(draft);
    const nextDraftHash = createWorkflowDraftHash(draftToSave);
    const nextPublishHash = createWorkflowPublishHash(draftToSave);

    if (publishingRef.current) {
      return;
    }

    setCurrentPublishHash(nextPublishHash);
    setPublishState(getWorkflowPublishStateFromHashes(nextPublishHash, lastPublishedPublishHash));
    setPublishError(null);

    if (nextDraftHash === lastSavedDraftHash) {
      saveRequestRef.current += 1;
      const inFlightSave = inFlightSaveRef.current;
      pendingSaveRef.current = inFlightSave
        ? {
            draft: draftToSave,
            requestId: saveRequestRef.current,
            workflowId: workflowIdRef.current,
          }
        : null;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      setSaveState(inFlightSave ? "saving" : "saved");
      setSaveError(null);
      failedSaveRef.current = null;
      if (inFlightSave) {
        void flushPendingSave()?.catch(() => undefined);
      }
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
      void flushPendingSave()?.catch(() => undefined);
    }, WORKFLOW_SAVE_DEBOUNCE_MS);
  }, [flushPendingSave, lastPublishedPublishHash, lastSavedDraftHash]);

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
    return flushPendingSave()?.catch(() => undefined);
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
      setLastPublishedPublishHash(createWorkflowPublishedHash(importedDocument));
      setCurrentPublishHash(createWorkflowPublishHash(normalizedImportResult.draft));
      setCurrentReviewPublishHash(importedDocument.currentReview
        ? createWorkflowPublishHash(normalizedImportResult.draft)
        : null);
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

  const [reviewActionState, setReviewActionState] = useState<
    "idle" | "submitting" | "approving" | "rejecting" | "withdrawing"
  >("idle");

  const applyReviewDocument = useCallback((nextDocument: WorkflowDocument) => {
    setDocument(nextDocument);
    const nextPublishHash = createWorkflowPublishHash(nextDocument.draft);
    setCurrentPublishHash(nextPublishHash);
    setCurrentReviewPublishHash(nextDocument.currentReview ? nextPublishHash : null);
    setPublishState(getWorkflowPublishStateForDraft(nextDocument.draft, nextDocument));
  }, []);

  const submitReview = useCallback(async () => {
    const requestId = publishRequestRef.current + 1;
    publishRequestRef.current = requestId;
    const workflowIdToSubmit = workflowIdRef.current;
    setReviewActionState("submitting");
    setPublishError(null);

    try {
      await flushPendingSave();
      const submittedDocument = await Promise.resolve(repository.submitReview(workflowIdToSubmit));
      if (publishRequestRef.current !== requestId || workflowIdRef.current !== workflowIdToSubmit) {
        return submittedDocument;
      }
      applyReviewDocument(submittedDocument);
      setReviewActionState("idle");
      setSaveState("saved");
      return submittedDocument;
    } catch (error) {
      const normalizedError = normalizeWorkflowRepositoryError(error);
      if (publishRequestRef.current === requestId && workflowIdRef.current === workflowIdToSubmit) {
        setReviewActionState("idle");
        setPublishError(normalizedError);
      }
      throw normalizedError;
    }
  }, [applyReviewDocument, flushPendingSave, repository]);

  const runReviewDecision = useCallback(async (
    reviewId: string,
    action: "approve" | "reject" | "withdraw",
    comment?: string,
  ) => {
    const requestId = publishRequestRef.current + 1;
    publishRequestRef.current = requestId;
    const workflowIdToUpdate = workflowIdRef.current;
    setReviewActionState(action === "approve" ? "approving" : action === "reject" ? "rejecting" : "withdrawing");
    setPublishError(null);
    try {
      const nextDocument = action === "approve"
        ? await Promise.resolve(repository.approveReview(workflowIdToUpdate, reviewId, comment))
        : action === "reject"
          ? await Promise.resolve(repository.rejectReview(workflowIdToUpdate, reviewId, comment ?? ""))
          : await Promise.resolve(repository.withdrawReview(workflowIdToUpdate, reviewId));
      if (publishRequestRef.current !== requestId || workflowIdRef.current !== workflowIdToUpdate) {
        return nextDocument;
      }
      applyReviewDocument(nextDocument);
      setReviewActionState("idle");
      return nextDocument;
    } catch (error) {
      const normalizedError = normalizeWorkflowRepositoryError(error);
      if (publishRequestRef.current === requestId && workflowIdRef.current === workflowIdToUpdate) {
        setReviewActionState("idle");
        setPublishError(normalizedError);
      }
      throw normalizedError;
    }
  }, [applyReviewDocument, repository]);

  const publishReview = useCallback(async (reviewId: string) => {
    const requestId = publishRequestRef.current + 1;
    publishRequestRef.current = requestId;
    const workflowIdToPublish = workflowIdRef.current;
    publishingRef.current = true;
    setPublishState("publishing");
    setPublishError(null);
    try {
      const publishResult = await Promise.resolve(repository.publishReview(workflowIdToPublish, reviewId));
      const normalizedPublishResult = normalizeWorkflowDraftPublishResult(publishResult);
      const { document: publishedDocument } = normalizedPublishResult;
      if (publishRequestRef.current !== requestId || workflowIdRef.current !== workflowIdToPublish) {
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
      setCurrentPublishHash(createWorkflowPublishHash(normalizedPublishResult.draft));
      setCurrentReviewPublishHash(null);
      setLastPublishedPublishHash(createWorkflowPublishHash(normalizedPublishResult.draft));
      setDocument(publishedDocument);
      return normalizedPublishResult;
    } catch (error) {
      const normalizedError = normalizeWorkflowRepositoryError(error);
      if (publishRequestRef.current === requestId && workflowIdRef.current === workflowIdToPublish) {
        publishingRef.current = false;
        setPublishError(normalizedError);
        setPublishState("error");
      }
      throw normalizedError;
    }
  }, [repository]);

  const restoreVersion = useCallback(async (versionId: string) => {
    const restoreRequestId = restoreRequestRef.current + 1;
    restoreRequestRef.current = restoreRequestId;
    publishRequestRef.current += 1;
    publishingRef.current = false;
    const workflowIdToRestore = workflowIdRef.current;

    setRestoreState("restoring");

    try {
      await flushPendingSave();

      if (
        restoreRequestRef.current !== restoreRequestId
        || workflowIdRef.current !== workflowIdToRestore
      ) {
        return undefined;
      }

      const saveRequestId = saveRequestRef.current + 1;
      saveRequestRef.current = saveRequestId;
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
      setLastPublishedPublishHash(createWorkflowPublishedHash(restoredDocument));
      setCurrentPublishHash(createWorkflowPublishHash(normalizedRestoreResult.draft));
      setCurrentReviewPublishHash(restoredDocument.currentReview
        ? createWorkflowPublishHash(normalizedRestoreResult.draft)
        : null);
      setPublishState(getWorkflowPublishStateForDraft(normalizedRestoreResult.draft, restoredDocument));
      setDocument(restoredDocument);

      return normalizedRestoreResult;
    }
    catch (error) {
      if (
        restoreRequestRef.current === restoreRequestId
        && workflowIdRef.current === workflowIdToRestore
      ) {
        setRestoreState("error");
        setSaveState("error");
      }

      return undefined;
    }
  }, [flushPendingSave, repository]);

  const restoreReview = useCallback(async (reviewId: string) => {
    const restoreRequestId = restoreRequestRef.current + 1;
    restoreRequestRef.current = restoreRequestId;
    publishRequestRef.current += 1;
    publishingRef.current = false;
    const workflowIdToRestore = workflowIdRef.current;
    setRestoreState("restoring");

    try {
      await flushPendingSave();
      if (restoreRequestRef.current !== restoreRequestId
        || workflowIdRef.current !== workflowIdToRestore) return undefined;
      const restoredDocument = await Promise.resolve(
        repository.restoreReview(workflowIdToRestore, reviewId),
      );
      const nextPublishHash = createWorkflowPublishHash(restoredDocument.draft);
      setRestoreState("restored");
      setSaveState("saved");
      setSaveError(null);
      failedSaveRef.current = null;
      setLastSavedAt(restoredDocument.savedAt);
      setLastSavedDraftHash(restoredDocument.draftHash);
      setLastPublishedPublishHash(createWorkflowPublishedHash(restoredDocument));
      setCurrentPublishHash(nextPublishHash);
      setCurrentReviewPublishHash(restoredDocument.currentReview ? nextPublishHash : null);
      setPublishState(getWorkflowPublishStateForDraft(restoredDocument.draft, restoredDocument));
      setDocument(restoredDocument);
      return restoredDocument;
    } catch (error) {
      if (restoreRequestRef.current === restoreRequestId
        && workflowIdRef.current === workflowIdToRestore) {
        setRestoreState("error");
      }
      throw normalizeWorkflowRepositoryError(error);
    }
  }, [flushPendingSave, repository]);

  const updateMetadata = useCallback(async (metadata: { description: string; name: string }) => {
    const normalizedMetadata = {
      description: metadata.description.trim(),
      name: metadata.name.trim(),
    };
    if (!normalizedMetadata.name || metadataUpdatingRef.current) {
      return false;
    }
    if (normalizedMetadata.name === document.name
      && normalizedMetadata.description === document.description) return true;

    metadataUpdatingRef.current = true;
    setMetadataUpdateState("updating");

    try {
      const updatedDocument = await Promise.resolve(
        repository.updateDocumentMetadata(workflowIdRef.current, normalizedMetadata),
      );
      setDocument((currentDocument) => ({
        ...currentDocument,
        description: updatedDocument.description,
        name: updatedDocument.name,
        updatedAt: updatedDocument.updatedAt,
      }));
      return true;
    }
    finally {
      metadataUpdatingRef.current = false;
      setMetadataUpdateState("idle");
    }
  }, [document.description, document.name, repository]);

  const listReviews = useCallback(
    () => Promise.resolve(repository.listReviews(workflowIdRef.current)),
    [repository],
  );

  const operateDocument = useCallback(async (action: "enable" | "pause" | "resume") => {
    const operation = {
      enable: repository.enableDocument,
      pause: repository.pauseDocument,
      resume: repository.resumeDocument,
    }[action];
    if (!operation || lifecycleActionState !== "idle") return undefined;
    const pendingState: "enabling" | "pausing" | "resuming" = ({
      enable: "enabling",
      pause: "pausing",
      resume: "resuming",
    } as const)[action];
    setLifecycleActionState(pendingState);
    try {
      const nextDocument = await Promise.resolve(operation(workflowIdRef.current));
      setDocument(nextDocument);
      return nextDocument;
    } catch (error) {
      throw normalizeWorkflowRepositoryError(error);
    } finally {
      setLifecycleActionState("idle");
    }
  }, [lifecycleActionState, repository]);

  const enableDocument = useCallback(
    () => operateDocument("enable"),
    [operateDocument],
  );
  const pauseDocument = useCallback(
    () => operateDocument("pause"),
    [operateDocument],
  );
  const resumeDocument = useCallback(
    () => operateDocument("resume"),
    [operateDocument],
  );

  useEffect(() => () => {
    void flushPendingSave({ updateState: false })?.catch(() => undefined);
  }, [flushPendingSave]);

  const visibleDocument = useMemo(() => ({
    ...document,
    currentReview: currentReviewPublishHash === currentPublishHash
      ? document.currentReview
      : null,
  }), [currentPublishHash, currentReviewPublishHash, document]);

  return useMemo(() => ({
    document: visibleDocument,
    enableDocument,
    hasUnpublishedChanges: document.publishedRevision === null
      || currentPublishHash !== lastPublishedPublishHash,
    lifecycleActionState,
    reviewActionState,
    submitReview,
    approveReview: (reviewId: string, comment?: string) => runReviewDecision(reviewId, "approve", comment),
    rejectReview: (reviewId: string, reason: string) => runReviewDecision(reviewId, "reject", reason),
    withdrawReview: (reviewId: string) => runReviewDecision(reviewId, "withdraw"),
    publishReview,
    importDraft,
    importState,
    lastSavedAt,
    lastSavedDraftHash,
    listReviews,
    markDirty,
    metadataUpdateState,
    pauseDocument,
    publishError,
    publishState,
    updateMetadata,
    restoreState,
    restoreReview,
    restoreVersion,
    resumeDocument,
    retrySave,
    saveError,
    saveState,
  }), [importDraft, importState, lastPublishedPublishHash, lastSavedAt, lastSavedDraftHash, listReviews, markDirty, metadataUpdateState, publishReview, publishError, publishState, restoreReview, reviewActionState, restoreState, restoreVersion, retrySave, runReviewDecision, saveError, saveState, submitReview, updateMetadata, visibleDocument]);
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

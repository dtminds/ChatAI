import {
  WORKFLOW_DESCRIPTION_MAX_LENGTH,
  WORKFLOW_NAME_MAX_LENGTH,
  type WorkflowCapabilitySummary,
  type WorkflowPublishReview,
  type WorkflowType,
} from "@chatai/contracts";
import {
  createInitialDraft,
  createInitialEdges,
  createInitialNodes,
  createNewWorkflowDraft,
} from "./graph";
import { isWorkflowGraphEqual } from "./workflow-draft-normalizer";
import {
  cloneWorkflowDocument,
  cloneWorkflowDraft,
  cloneWorkflowVersionHistoryItem,
  createWorkflowDraftHash,
  createWorkflowPublishHash,
  createWorkflowPublishedVersion,
  createWorkflowVersionHistoryItem,
  getWorkflowConversion,
  getWorkflowTrigger,
  normalizeWorkflowDraftSaveResult,
} from "./workflow-draft-persistence";
import { WorkflowRepositoryError } from "./workflow-repository-types";
import type {
  SyncWorkflowDraftRepository,
  WorkflowDocument,
  WorkflowDocumentPermissions,
  WorkflowListInput,
  WorkflowListPage,
} from "./workflow-repository-types";
import type { WorkflowDraft, WorkflowNode } from "./types";

export function createInMemoryWorkflowDraftRepository(): SyncWorkflowDraftRepository {
  let workflowDocuments = createWorkflowDocuments();
  let workflowIdSequence = 0;
  let reviewIdSequence = 0;
  const reviewHistory = new Map<string, WorkflowPublishReview[]>();
  const reviewDrafts = new Map<string, WorkflowDraft>();
  const createdDocumentIdsByRequest = new Map<string, string>();

  function listDocuments(input: WorkflowListInput = {}): WorkflowListPage {
    const normalizedQuery = input?.query?.toLocaleLowerCase();
    const filteredDocuments = workflowDocuments
      .filter(item => matchesListStatus(item, input?.status ?? "all"))
      .filter(item => !normalizedQuery
        || item.name.toLocaleLowerCase().includes(normalizedQuery));
    const candidates = filteredDocuments
      .filter(item => !input?.cursor || item.id.localeCompare(input.cursor, undefined, { numeric: true }) < 0)
      .slice(0, (input?.limit ?? 20) + 1);
    const items = candidates.slice(0, input?.limit ?? 20).map(cloneWorkflowDocument);
    return {
      items,
      nextCursor: candidates.length > items.length ? items.at(-1)?.id ?? null : null,
      total: filteredDocuments.length,
    };
  }

  function getWorkflowDocumentIndex(workflowId: string) {
    const documentIndex = workflowDocuments.findIndex((workflow) => workflow.id === workflowId);

    if (documentIndex < 0) {
      throw new WorkflowRepositoryError("not-found", `Unknown workflow document: ${workflowId}`);
    }

    return documentIndex;
  }

  return {
    createDocument: (input) => {
      const clientRequestId = input.clientRequestId?.trim();
      const name = input.name?.trim();
      const description = input.description?.trim() ?? "";

      if (input.name !== undefined && !name) {
        throw new WorkflowRepositoryError("validation", "Workflow name is required");
      }
      if (name && name.length > WORKFLOW_NAME_MAX_LENGTH) {
        throw new WorkflowRepositoryError("validation", "Workflow name is too long");
      }
      if (description.length > WORKFLOW_DESCRIPTION_MAX_LENGTH) {
        throw new WorkflowRepositoryError("validation", "Workflow description is too long");
      }
      const existingDocumentId = clientRequestId
        ? createdDocumentIdsByRequest.get(clientRequestId)
        : undefined;

      if (existingDocumentId) {
        const existingDocument = workflowDocuments[getWorkflowDocumentIndex(existingDocumentId)];
        if (existingDocument.workflowType !== input.workflowType) {
          throw new WorkflowRepositoryError(
            "conflict",
            "Create request id is already bound to another Workflow type",
          );
        }
        return cloneWorkflowDocument(existingDocument);
      }

      workflowIdSequence += 1;
      const document = createNewWorkflowDocument(
        `workflow-${workflowIdSequence.toString(36)}`,
        name,
        description,
        input.workflowType,
      );
      workflowDocuments = [document, ...workflowDocuments];

      if (clientRequestId) {
        createdDocumentIdsByRequest.set(clientRequestId, document.id);
      }

      return cloneWorkflowDocument(document);
    },
    deleteDocument: (workflowId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      for (const review of reviewHistory.get(workflowId) ?? []) {
        reviewDrafts.delete(review.id);
      }
      workflowDocuments.splice(documentIndex, 1);
      reviewHistory.delete(workflowId);
    },
    enableDocument: (workflowId) => updateRuntimeStatus(workflowId, "active"),
    getCapacityOverview: () => ({
      capacityRejectedCountToday: 0,
      status: "normal",
      usagePercent: 37,
    }),
    getTenantOverview: () => ({
      activeWorkflowCount: workflowDocuments.filter(document => document.runtimeStatus === "active").length,
      recentFailedRunCount: 231,
      recentSuccessRatePercent: 98.2,
      todayRunCount: 12_847,
      todayRunCountChangePercent: 12,
      totalWorkflowCount: workflowDocuments.length,
    }),
    getDocument: (workflowId) => cloneWorkflowDocument(
      workflowDocuments[getWorkflowDocumentIndex(workflowId)],
    ),
    getVersion: (workflowId, revision) => {
      const version = workflowDocuments[getWorkflowDocumentIndex(workflowId)].versionHistory
        .find(item => item.revision === revision);
      if (!version) throw new WorkflowRepositoryError("not-found", "Workflow 版本不存在");
      return cloneWorkflowVersionHistoryItem(version);
    },
    importDraft: (workflowId, draft) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const nextDraft = cloneWorkflowDraft(draft);
      const importedAt = "刚刚";
      const nextDraftHash = createWorkflowDraftHash(nextDraft);
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        draft: nextDraft,
        draftHash: nextDraftHash,
        hasUnpublishedChanges: currentDocument.publishedDraft === null
          || !isWorkflowGraphEqual(currentDocument.publishedDraft, nextDraft),
        nodes: nextDraft.nodes.length,
        revision: currentDocument.revision + 1,
        savedAt: importedAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: importedAt,
      };

      workflowDocuments[documentIndex] = withCurrentReview(nextDocument);
      return {
        document: cloneWorkflowDocument(workflowDocuments[documentIndex]),
        draft: cloneWorkflowDraft(nextDraft),
        draftHash: nextDraftHash,
        importedAt,
        revision: nextDocument.revision,
        savedAt: importedAt,
        updatedAt: importedAt,
      };
    },
    listDocuments,
    pauseDocument: (workflowId) => updateRuntimeStatus(workflowId, "paused"),
    submitReview: (workflowId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      if (currentDocument.currentReview?.status === "pending"
        || currentDocument.currentReview?.status === "approved") {
        throw new WorkflowRepositoryError("conflict", "Workflow review already exists", {
          apiCode: "WORKFLOW_REVIEW_LOCKED",
        });
      }
      if (currentDocument.publishedDraft
        && isWorkflowGraphEqual(currentDocument.publishedDraft, currentDocument.draft)) {
        throw new WorkflowRepositoryError("conflict", "Workflow has no unpublished changes", {
          apiCode: "WORKFLOW_NO_UNPUBLISHED_CHANGES",
        });
      }
      const review = createReview(currentDocument);
      reviewHistory.set(workflowId, [review, ...(reviewHistory.get(workflowId) ?? [])]);
      reviewDrafts.set(review.id, cloneWorkflowDraft(currentDocument.draft));
      workflowDocuments[documentIndex] = withReview(currentDocument, review);
      return cloneWorkflowDocument(workflowDocuments[documentIndex]);
    },
    listReviews: (workflowId, cursor) => {
      const candidates = (reviewHistory.get(workflowId) ?? [])
        .filter(review => cursor === undefined || Number(review.id) < Number(cursor))
        .slice(0, 21);
      const items = candidates.slice(0, 20).map(review => ({
        ...review,
        changeSummary: { ...review.changeSummary },
      }));
      return {
        items,
        nextCursor: candidates.length > items.length ? items.at(-1)!.id : null,
      };
    },
    listVersions: (workflowId, cursor) => {
      const candidates = workflowDocuments[getWorkflowDocumentIndex(workflowId)].versionHistory
        .filter(version => cursor === undefined || version.revision < Number(cursor))
        .slice(0, 21);
      const items = candidates.slice(0, 20).map(cloneWorkflowVersionHistoryItem);
      return {
        items,
        nextCursor: candidates.length > items.length ? String(items.at(-1)!.revision) : null,
      };
    },
    approveReview: (workflowId, reviewId, comment) => decideReview(
      workflowId, reviewId, "approved", ["pending"], comment,
    ),
    rejectReview: (workflowId, reviewId, reason) => {
      if (!reason.trim()) throw new WorkflowRepositoryError("validation", "Workflow review rejection reason is required");
      return decideReview(workflowId, reviewId, "rejected", ["pending"], reason);
    },
    withdrawReview: (workflowId, reviewId) => decideReview(
      workflowId, reviewId, "withdrawn", ["pending"],
    ),
    publishReview: (workflowId, reviewId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const review = requireReview(workflowId, reviewId);
      if (review.status !== "approved") {
        throw new WorkflowRepositoryError("conflict", "Workflow review is not approved");
      }
      const candidateDraft = reviewDrafts.get(review.id);
      if (!candidateDraft) throw new WorkflowRepositoryError("conflict", "Workflow review candidate is unavailable");
      if (review.basePublishedRevision !== currentDocument.publishedRevision
        || createWorkflowPublishHash(candidateDraft) !== createWorkflowPublishHash(currentDocument.draft)) {
        throw new WorkflowRepositoryError("conflict", "Workflow review no longer matches the current draft");
      }
      const publishedAt = "刚刚";
      const nextRevision = (currentDocument.publishedRevision ?? 0) + 1;
      const publishedDraft = cloneWorkflowDraft(currentDocument.draft);
      const version = createWorkflowVersionHistoryItem(currentDocument.id, nextRevision, publishedAt, publishedDraft);
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        currentReview: null,
        currentVersion: version,
        hasUnpublishedChanges: false,
        publishedAt,
        publishedDraft,
        publishedRevision: nextRevision,
        permissions: {
          ...currentDocument.permissions,
          canEdit: currentDocument.runtimeStatus !== "stopped",
          canPublish: currentDocument.runtimeStatus !== "stopped",
        },
        status: currentDocument.runtimeStatus === "active" ? "Published" : currentDocument.runtimeStatus === "paused" ? "Paused" : "Published",
        updatedAt: publishedAt,
        versionHistory: [version, ...currentDocument.versionHistory],
        versionHistoryNextCursor: currentDocument.versionHistoryNextCursor,
      };
      workflowDocuments[documentIndex] = nextDocument;
      replaceReview(workflowId, {
        ...review,
        publishedAt,
        publishedBySubUserId: "reviewer-user",
        resultingRevision: nextRevision,
      });
      return {
        document: cloneWorkflowDocument(nextDocument),
        draft: cloneWorkflowDraft(publishedDraft),
        draftHash: createWorkflowDraftHash(publishedDraft),
        publishedAt,
        publishedRevision: nextRevision,
        revision: currentDocument.revision,
        updatedAt: publishedAt,
        version,
      };
    },
    reset: () => {
      workflowDocuments = createWorkflowDocuments();
      workflowIdSequence = 0;
      reviewIdSequence = 0;
      createdDocumentIdsByRequest.clear();
      reviewHistory.clear();
      reviewDrafts.clear();
    },
    updateDocumentMetadata: (workflowId, metadata) => {
      const normalizedName = metadata.name.trim();
      const normalizedDescription = metadata.description.trim();

      if (!normalizedName) {
        throw new WorkflowRepositoryError("validation", "Workflow name is required");
      }
      if (normalizedName.length > WORKFLOW_NAME_MAX_LENGTH) {
        throw new WorkflowRepositoryError("validation", "Workflow name is too long");
      }
      if (normalizedDescription.length > WORKFLOW_DESCRIPTION_MAX_LENGTH) {
        throw new WorkflowRepositoryError("validation", "Workflow description is too long");
      }

      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const nextDocument = {
        ...currentDocument,
        description: normalizedDescription,
        name: normalizedName,
        updatedAt: "刚刚",
      };
      workflowDocuments[documentIndex] = withCurrentReview(nextDocument);
      return cloneWorkflowDocument(workflowDocuments[documentIndex]);
    },
    resumeDocument: (workflowId) => updateRuntimeStatus(workflowId, "active"),
    restoreVersion: (workflowId, version) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const restoredVersion = cloneWorkflowVersionHistoryItem(version);

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
        hasUnpublishedChanges: currentDocument.publishedDraft === null
          || !isWorkflowGraphEqual(currentDocument.publishedDraft, nextDraft),
        nodes: nextDraft.nodes.length,
        revision: currentDocument.revision + 1,
        savedAt: restoredAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: restoredAt,
      };

      workflowDocuments[documentIndex] = withCurrentReview(nextDocument);
      return {
        document: cloneWorkflowDocument(workflowDocuments[documentIndex]),
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
      assertEditable(currentDocument);
      const nextDraft = cloneWorkflowDraft(draft);
      const shouldCreateDraftRevision = !isWorkflowGraphEqual(currentDocument.draft, nextDraft);
      const persistedDraft = shouldCreateDraftRevision ? nextDraft : currentDocument.draft;
      const savedAt = shouldCreateDraftRevision ? "刚刚" : currentDocument.savedAt;
      const updatedAt = shouldCreateDraftRevision ? "刚刚" : currentDocument.updatedAt;
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : currentDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        draft: persistedDraft,
        draftHash: nextDraftHash,
        hasUnpublishedChanges: currentDocument.publishedDraft === null
          || !isWorkflowGraphEqual(currentDocument.publishedDraft, persistedDraft),
        nodes: persistedDraft.nodes.length,
        revision: shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision,
        savedAt,
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt,
      };

      workflowDocuments[documentIndex] = withCurrentReview(nextDocument, !shouldCreateDraftRevision);
      return normalizeWorkflowDraftSaveResult(workflowDocuments[documentIndex]);
    },
    restoreReview: (workflowId, reviewId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const review = requireReview(workflowId, reviewId);
      if (review.status === "pending" || review.resultingRevision !== null) {
        throw new WorkflowRepositoryError("conflict", "Workflow review cannot be restored");
      }
      const reviewDraft = reviewDrafts.get(reviewId);
      if (!reviewDraft) throw new WorkflowRepositoryError("not-found", "Workflow review candidate is unavailable");
      const nextDraft = cloneWorkflowDraft(reviewDraft);
      const nextDocument = withCurrentReview({
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        draft: nextDraft,
        draftHash: createWorkflowDraftHash(nextDraft),
        hasUnpublishedChanges: currentDocument.publishedDraft === null
          || !isWorkflowGraphEqual(currentDocument.publishedDraft, nextDraft),
        nodes: nextDraft.nodes.length,
        revision: currentDocument.revision + 1,
        savedAt: "刚刚",
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: "刚刚",
      });
      workflowDocuments[documentIndex] = nextDocument;
      return cloneWorkflowDocument(nextDocument);
    },
    stopDocument: (workflowId) => updateRuntimeStatus(workflowId, "stopped"),
  };

  function updateRuntimeStatus(
    workflowId: string,
    runtimeStatus: NonNullable<WorkflowDocument["runtimeStatus"]>,
  ) {
    const documentIndex = getWorkflowDocumentIndex(workflowId);
    const currentDocument = workflowDocuments[documentIndex];
    if (runtimeStatus === "stopped" && currentDocument.currentReview?.status === "pending") {
      replaceReview(workflowId, {
        ...currentDocument.currentReview,
        reviewedAt: "刚刚",
        reviewedBySubUserId: "reviewer-user",
        status: "withdrawn",
      });
    }
    const nextDocument = withCurrentReview({
      ...currentDocument,
      runtimeStatus,
      status: runtimeStatus === "active"
        ? "Published"
        : runtimeStatus === "paused"
          ? "Paused"
          : runtimeStatus === "stopped"
            ? "Stopped"
            : currentDocument.publishedRevision === null
              ? "Draft"
              : "Published",
      updatedAt: "刚刚",
    });
    workflowDocuments[documentIndex] = nextDocument;
    return cloneWorkflowDocument(nextDocument);
  }

  function createReview(document: WorkflowDocument): WorkflowPublishReview {
    reviewIdSequence += 1;
    return {
      basePublishedRevision: document.publishedRevision,
      changeSummary: {
        addedNodes: document.publishedDraft ? [] : document.draft.nodes.map(node => ({
          id: node.id,
          kind: node.data.kind,
          title: node.data.title,
        })),
        changedNodes: [],
        firstPublication: document.publishedRevision === null,
        pathChanged: document.publishedRevision !== null,
        removedNodes: [],
        triggerChanged: document.publishedRevision !== null,
      },
      checkedAt: "刚刚",
      id: `review-${reviewIdSequence}`,
      publishedAt: null,
      publishedBySubUserId: null,
      resultingRevision: null,
      reviewComment: null,
      reviewedAt: null,
      reviewedBySubUserId: null,
      sourceDraftVersion: document.draftVersion ?? document.revision,
      status: "pending",
      submittedAt: "刚刚",
      submittedBySubUserId: "review-submitter",
      workflowId: document.id,
    };
  }

  function decideReview(
    workflowId: string,
    reviewId: string,
    status: "approved" | "rejected" | "withdrawn",
    allowedStatuses: WorkflowPublishReview["status"][],
    comment?: string,
  ) {
    const documentIndex = getWorkflowDocumentIndex(workflowId);
    const currentDocument = workflowDocuments[documentIndex];
    const review = requireReview(workflowId, reviewId);
    if (!allowedStatuses.includes(review.status)) {
      throw new WorkflowRepositoryError("conflict", "Workflow review is not in the expected state");
    }
    const nextReview: WorkflowPublishReview = {
      ...review,
      reviewComment: comment?.trim() || null,
      reviewedAt: "刚刚",
      reviewedBySubUserId: "reviewer-user",
      status,
    };
    replaceReview(workflowId, nextReview);
    const nextDocument = withCurrentReview(currentDocument);
    workflowDocuments[documentIndex] = nextDocument;
    return cloneWorkflowDocument(nextDocument);
  }

  function requireReview(workflowId: string, reviewId: string) {
    const review = (reviewHistory.get(workflowId) ?? []).find(item => item.id === reviewId);
    if (!review) throw new WorkflowRepositoryError("not-found", "Workflow review not found");
    return review;
  }

  function replaceReview(workflowId: string, review: WorkflowPublishReview) {
    reviewHistory.set(workflowId, (reviewHistory.get(workflowId) ?? []).map(item =>
      item.id === review.id ? review : item));
  }

  function assertEditable(document: WorkflowDocument) {
    if (document.currentReview?.status === "pending") {
      throw new WorkflowRepositoryError("conflict", "Workflow is locked for review", {
        apiCode: "WORKFLOW_REVIEW_LOCKED",
      });
    }
  }

  function withCurrentReview(document: WorkflowDocument, preserveUpdatedAt = false) {
    const publishHash = createWorkflowPublishHash(document.draft);
    const review = (reviewHistory.get(document.id) ?? []).find(candidate => {
      const candidateDraft = reviewDrafts.get(candidate.id);
      return candidateDraft !== undefined
        && candidate.basePublishedRevision === document.publishedRevision
        && createWorkflowPublishHash(candidateDraft) === publishHash
        && (candidate.status === "pending"
          || candidate.status === "approved"
          || candidate.status === "rejected");
    }) ?? null;
    return withReview(document, review, preserveUpdatedAt);
  }
}

function withReview(
  document: WorkflowDocument,
  review: WorkflowPublishReview | null,
  preserveUpdatedAt = false,
): WorkflowDocument {
  const locked = review?.status === "pending";
  return {
    ...document,
    currentReview: review,
    permissions: {
      ...document.permissions,
      canEdit: !locked && document.runtimeStatus !== "stopped",
      canPublish: document.runtimeStatus !== "stopped",
    },
    updatedAt: preserveUpdatedAt ? document.updatedAt : "刚刚",
  };
}

function createWorkflowDocuments(): WorkflowDocument[] {
  const newcomerConversionDraft = createInitialDraft();
  const vipReactivationDraft: WorkflowDraft = {
    edges: createInitialEdges(),
    nodes: createInitialNodes().map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              triggers: [{
                tagIds: [203],
                type: "contact.tag_added" as const,
              }],
              title: "复购唤醒触发",
            },
          }
        : node,
    ),
    viewport: createInitialDraft().viewport,
  };
  const liveFollowUpDraft: WorkflowDraft = {
    edges: createInitialEdges(),
    nodes: createInitialNodes().map((node) => {
      if (node.id !== "start") return node;
      const startNode = node as WorkflowNode<"start">;
      return {
        ...startNode,
        data: {
          ...startNode.data,
          triggers: [{ keywords: [], type: "message.received" as const }],
          title: "直播互动触发",
        },
      } as WorkflowNode<"start">;
    }),
    viewport: createInitialDraft().viewport,
  };

  return [
    {
      capabilitySummary: createInMemoryCapabilitySummary(),
      conversion: "18.4%",
      currentReview: null,
      currentVersion: null,
      description: "引导新客户完成首次购买",
      draft: newcomerConversionDraft,
      draftHash: createWorkflowDraftHash(newcomerConversionDraft),
      entered: "124.8万",
      hasUnpublishedChanges: true,
      id: "newcomer-conversion",
      inProgressRunCount: 248,
      lastRunAt: "今天 18:20",
      managedAccountCount: 4,
      managedAccounts: [
        { avatarUrl: "", id: 101, name: "销售一组" },
        { avatarUrl: "", id: 102, name: "销售二组" },
        { avatarUrl: "", id: 103, name: "客户服务" },
      ],
      name: "新人转化旅程",
      nodes: 8,
      owner: "运营主管",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: null,
      publishedDraft: null,
      publishedRevision: null,
      successRatePercent: 96,
      revision: 1,
      runtimeStatus: "inactive",
      savedAt: "18:20",
      status: "Draft",
      trigger: "近 30 天新入会且未首购客户",
      totalRunCount: 1_248_000,
      updatedAt: "今天 18:20",
      wecomMemberCount: 0,
      wecomMembers: [],
      versionHistory: [],
      versionHistoryNextCursor: null,
      workflowType: "chatai_sop",
    },
    {
      capabilitySummary: createInMemoryCapabilitySummary(),
      conversion: "23.1%",
      currentReview: null,
      currentVersion: createWorkflowPublishedVersion("vip-reactivation", 1, "昨天 21:04"),
      description: "唤醒长期未复购的会员客户",
      draft: vipReactivationDraft,
      draftHash: createWorkflowDraftHash(vipReactivationDraft),
      entered: "86.3万",
      hasUnpublishedChanges: false,
      id: "vip-reactivation",
      inProgressRunCount: 120,
      lastRunAt: "昨天 21:04",
      managedAccountCount: 2,
      managedAccounts: [
        { avatarUrl: "", id: 101, name: "销售一组" },
        { avatarUrl: "", id: 102, name: "销售二组" },
      ],
      name: "会员复购唤醒",
      nodes: 12,
      owner: "增长运营",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: "昨天 21:04",
      publishedDraft: vipReactivationDraft,
      publishedRevision: 1,
      successRatePercent: 91,
      revision: 1,
      runtimeStatus: "active",
      savedAt: "昨天 21:04",
      status: "Published",
      trigger: "90 天未复购会员",
      totalRunCount: 863_000,
      updatedAt: "昨天 21:04",
      wecomMemberCount: 0,
      wecomMembers: [],
      versionHistory: [
        createWorkflowVersionHistoryItem("vip-reactivation", 1, "昨天 21:04", vipReactivationDraft),
      ],
      versionHistoryNextCursor: null,
      workflowType: "chatai_sop",
    },
    {
      capabilitySummary: createInMemoryCapabilitySummary(),
      conversion: "9.7%",
      currentReview: null,
      currentVersion: createWorkflowPublishedVersion("live-follow-up", 1, "7月4日 16:12"),
      description: "直播结束后继续跟进高意向客户",
      draft: liveFollowUpDraft,
      draftHash: createWorkflowDraftHash(liveFollowUpDraft),
      entered: "42.6万",
      hasUnpublishedChanges: false,
      id: "live-follow-up",
      inProgressRunCount: 86,
      lastRunAt: "7月4日 16:12",
      managedAccountCount: 1,
      managedAccounts: [{ avatarUrl: "", id: 103, name: "客户服务" }],
      name: "直播后跟进",
      nodes: 6,
      owner: "直播运营",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: "7月4日 16:12",
      publishedDraft: liveFollowUpDraft,
      publishedRevision: 1,
      successRatePercent: 88,
      revision: 1,
      runtimeStatus: "paused",
      savedAt: "7月4日 16:12",
      status: "Paused",
      trigger: "直播间互动但未下单客户",
      totalRunCount: 426_000,
      updatedAt: "7月4日 16:12",
      wecomMemberCount: 0,
      wecomMembers: [],
      versionHistory: [
        createWorkflowVersionHistoryItem("live-follow-up", 1, "7月4日 16:12", liveFollowUpDraft),
      ],
      versionHistoryNextCursor: null,
      workflowType: "chatai_sop",
    },
  ];
}

function createNewWorkflowDocument(
  id: string,
  name: string | undefined,
  description: string | undefined,
  workflowType: WorkflowType,
): WorkflowDocument {
  if (workflowType === "member_sop") {
    throw new Error("member_sop is not available");
  }
  const draft = createNewWorkflowDraft(workflowType);

  return {
    capabilitySummary: createInMemoryCapabilitySummary(),
    conversion: "0%",
    currentReview: null,
    currentVersion: null,
    description: description?.trim() || "",
    draft,
    draftHash: createWorkflowDraftHash(draft),
    entered: "0",
    hasUnpublishedChanges: true,
    id,
    inProgressRunCount: 0,
    lastRunAt: null,
    managedAccountCount: 0,
    managedAccounts: [],
    name: name?.trim() || "未命名工作流",
    nodes: draft.nodes.length,
    owner: "运营主管",
    permissions: createDefaultWorkflowPermissions(),
    publishedAt: null,
    publishedDraft: null,
    publishedRevision: null,
    successRatePercent: null,
    revision: 1,
    runtimeStatus: "inactive",
    savedAt: "刚刚",
    status: "Draft",
    trigger: "待配置进入条件",
    totalRunCount: 0,
    updatedAt: "刚刚",
    wecomMemberCount: 0,
    wecomMembers: [],
    versionHistory: [],
    versionHistoryNextCursor: null,
    workflowType,
  };
}

function createInMemoryCapabilitySummary(): WorkflowCapabilitySummary {
  return {
    runtimeSupportedNodeKinds: [
      "start",
      "wait",
      "wait-event",
      "branch",
      "ratio-split",
      "message-query",
      "end",
    ],
  };
}

function matchesListStatus(
  workflow: WorkflowDocument,
  status: NonNullable<WorkflowListInput["status"]>,
) {
  if (status === "all") return true;
  if (status === "active") return workflow.runtimeStatus === "active";
  if (status === "ready") {
    return workflow.runtimeStatus === "paused"
      || (workflow.runtimeStatus === "inactive" && workflow.publishedRevision !== null);
  }
  if (status === "draft") return workflow.publishedRevision === null;
  return workflow.runtimeStatus === "stopped";
}

function createDefaultWorkflowPermissions(): WorkflowDocumentPermissions {
  return {
    canEdit: true,
    canPublish: true,
  };
}

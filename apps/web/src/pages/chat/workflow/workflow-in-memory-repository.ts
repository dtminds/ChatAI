import type {
  WorkflowCapabilitySummary,
  WorkflowPublishReview,
  WorkflowType,
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
} from "./workflow-repository-types";
import type { WorkflowDraft, WorkflowNode } from "./types";

export function createInMemoryWorkflowDraftRepository(): SyncWorkflowDraftRepository {
  let workflowDocuments = createWorkflowDocuments();
  let workflowIdSequence = 0;
  let reviewIdSequence = 0;
  const reviewHistory = new Map<string, WorkflowPublishReview[]>();
  const reviewDrafts = new Map<string, WorkflowDraft>();
  const createdDocumentIdsByRequest = new Map<string, string>();

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
      if (name && name.length > 100) {
        throw new WorkflowRepositoryError("validation", "Workflow name is too long");
      }
      if (description.length > 1000) {
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
      for (const review of reviewHistory.get(workflowId) ?? []) reviewDrafts.delete(review.id);
      workflowDocuments.splice(documentIndex, 1);
      reviewHistory.delete(workflowId);
    },
    enableDocument: (workflowId) => updateRuntimeStatus(workflowId, "active"),
    getDocument: (workflowId) => cloneWorkflowDocument(
      workflowDocuments[getWorkflowDocumentIndex(workflowId)],
    ),
    importDraft: (workflowId, draft) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const editableDocument = invalidateApprovedReview(workflowId, currentDocument);
      const nextDraft = cloneWorkflowDraft(draft);
      const importedAt = "刚刚";
      const nextDraftHash = createWorkflowDraftHash(nextDraft);
      const nextDocument: WorkflowDocument = {
        ...editableDocument,
        conversion: getWorkflowConversion(nextDraft) ?? editableDocument.conversion,
        draft: nextDraft,
        draftHash: nextDraftHash,
        hasUnpublishedChanges: editableDocument.publishedDraft === null
          || !isWorkflowGraphEqual(editableDocument.publishedDraft, nextDraft),
        nodes: nextDraft.nodes.length,
        revision: editableDocument.revision + 1,
        savedAt: importedAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? editableDocument.trigger,
        updatedAt: importedAt,
      };

      workflowDocuments[documentIndex] = collapseRejectedReview(nextDocument);
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
    listDocuments: () => workflowDocuments.map(cloneWorkflowDocument),
    pauseDocument: (workflowId) => updateRuntimeStatus(workflowId, "paused"),
    submitReview: (workflowId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
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
    listReviews: (workflowId) => (reviewHistory.get(workflowId) ?? []).map(review => ({ ...review, changeSummary: { ...review.changeSummary } })),
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
      if (review.basePublishedRevision !== currentDocument.publishedRevision
        || review.sourceDraftVersion !== (currentDocument.draftVersion ?? currentDocument.revision)) {
        throw new WorkflowRepositoryError("conflict", "Workflow review no longer matches the current draft");
      }
      const publishedAt = "刚刚";
      const nextRevision = (currentDocument.publishedRevision ?? 0) + 1;
      const candidateDraft = reviewDrafts.get(review.id);
      if (!candidateDraft) throw new WorkflowRepositoryError("conflict", "Workflow review candidate is unavailable");
      const publishedDraft = cloneWorkflowDraft(candidateDraft);
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
      };
      workflowDocuments[documentIndex] = nextDocument;
      replaceReview(workflowId, {
        ...review,
        publishedAt,
        publishedBySubUserId: "reviewer-user",
        resultingRevision: nextRevision,
        status: "published",
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
      if (normalizedDescription.length > 1000) {
        throw new WorkflowRepositoryError("validation", "Workflow description is too long");
      }

      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const editableDocument = invalidateApprovedReview(workflowId, currentDocument);
      const nextDocument = {
        ...editableDocument,
        description: normalizedDescription,
        name: normalizedName,
        updatedAt: "刚刚",
      };
      workflowDocuments[documentIndex] = nextDocument;
      return cloneWorkflowDocument(nextDocument);
    },
    resumeDocument: (workflowId) => updateRuntimeStatus(workflowId, "active"),
    restoreVersion: (workflowId, versionId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      assertEditable(currentDocument);
      const restoredVersion = currentDocument.versionHistory.find((version) => version.id === versionId);

      if (!restoredVersion) {
        throw new WorkflowRepositoryError("not-found", `Unknown workflow version: ${versionId}`);
      }

      const editableDocument = invalidateApprovedReview(workflowId, currentDocument);
      const nextDraft = cloneWorkflowDraft(restoredVersion.draft);
      const restoredAt = "刚刚";
      const nextDraftHash = createWorkflowDraftHash(nextDraft);
      const nextDocument: WorkflowDocument = {
        ...editableDocument,
        conversion: getWorkflowConversion(nextDraft) ?? editableDocument.conversion,
        currentVersion: {
          id: restoredVersion.id,
          name: restoredVersion.name,
          publishedAt: restoredVersion.publishedAt,
          revision: restoredVersion.revision,
        },
        draft: nextDraft,
        draftHash: nextDraftHash,
        hasUnpublishedChanges: editableDocument.publishedDraft === null
          || !isWorkflowGraphEqual(editableDocument.publishedDraft, nextDraft),
        nodes: nextDraft.nodes.length,
        revision: editableDocument.revision + 1,
        savedAt: restoredAt,
        status: "Draft",
        trigger: getWorkflowTrigger(nextDraft) ?? editableDocument.trigger,
        updatedAt: restoredAt,
      };

      workflowDocuments[documentIndex] = collapseRejectedReview(nextDocument);
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
      const editableDocument = shouldCreateDraftRevision
        ? invalidateApprovedReview(workflowId, currentDocument)
        : currentDocument;
      const persistedDraft = shouldCreateDraftRevision ? nextDraft : editableDocument.draft;
      const savedAt = shouldCreateDraftRevision ? "刚刚" : editableDocument.savedAt;
      const updatedAt = shouldCreateDraftRevision ? "刚刚" : editableDocument.updatedAt;
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : editableDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...editableDocument,
        conversion: getWorkflowConversion(nextDraft) ?? editableDocument.conversion,
        draft: persistedDraft,
        draftHash: nextDraftHash,
        hasUnpublishedChanges: editableDocument.publishedDraft === null
          || !isWorkflowGraphEqual(editableDocument.publishedDraft, persistedDraft),
        nodes: persistedDraft.nodes.length,
        revision: shouldCreateDraftRevision ? editableDocument.revision + 1 : editableDocument.revision,
        savedAt,
        trigger: getWorkflowTrigger(nextDraft) ?? editableDocument.trigger,
        updatedAt,
      };

      workflowDocuments[documentIndex] = collapseRejectedReview(nextDocument);
      return normalizeWorkflowDraftSaveResult(workflowDocuments[documentIndex]);
    },
    stopDocument: (workflowId) => updateRuntimeStatus(workflowId, "stopped"),
  };

  function updateRuntimeStatus(
    workflowId: string,
    runtimeStatus: NonNullable<WorkflowDocument["runtimeStatus"]>,
  ) {
    const documentIndex = getWorkflowDocumentIndex(workflowId);
    const currentDocument = workflowDocuments[documentIndex];
    const nextDocument: WorkflowDocument = {
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
    };
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
      reviewedAt: status === "withdrawn" ? null : "刚刚",
      reviewedBySubUserId: status === "withdrawn" ? null : "reviewer-user",
      status,
    };
    replaceReview(workflowId, nextReview);
    const nextDocument = withReview(
      currentDocument,
      status === "withdrawn" ? null : nextReview,
    );
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

  function invalidateApprovedReview(workflowId: string, document: WorkflowDocument) {
    const review = document.currentReview;
    if (review?.status !== "approved") return document;
    replaceReview(workflowId, {
      ...review,
      status: "obsolete",
    });
    return withReview(document, null);
  }
}

function withReview(
  document: WorkflowDocument,
  review: WorkflowPublishReview | null,
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
    updatedAt: "刚刚",
  };
}

function collapseRejectedReview(document: WorkflowDocument): WorkflowDocument {
  if (document.publishedRevision === null
    || document.currentReview?.status !== "rejected"
    || document.hasUnpublishedChanges) return document;
  return withReview(document, null);
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
      canOperate: true,
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
      name: "新人转化旅程",
      nodes: 8,
      owner: "运营主管",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: null,
      publishedDraft: null,
      publishedRevision: null,
      revision: 1,
      runtimeStatus: "inactive",
      savedAt: "18:20",
      status: "Draft",
      trigger: "近 30 天新入会且未首购客户",
      updatedAt: "今天 18:20",
      versionHistory: [],
      workflowType: "chatai_sop",
    },
    {
      canOperate: true,
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
      name: "会员复购唤醒",
      nodes: 12,
      owner: "增长运营",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: "昨天 21:04",
      publishedDraft: vipReactivationDraft,
      publishedRevision: 1,
      revision: 1,
      runtimeStatus: "active",
      savedAt: "昨天 21:04",
      status: "Published",
      trigger: "90 天未复购会员",
      updatedAt: "昨天 21:04",
      versionHistory: [
        createWorkflowVersionHistoryItem("vip-reactivation", 1, "昨天 21:04", vipReactivationDraft),
      ],
      workflowType: "chatai_sop",
    },
    {
      canOperate: true,
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
      name: "直播后跟进",
      nodes: 6,
      owner: "直播运营",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: "7月4日 16:12",
      publishedDraft: liveFollowUpDraft,
      publishedRevision: 1,
      revision: 1,
      runtimeStatus: "paused",
      savedAt: "7月4日 16:12",
      status: "Paused",
      trigger: "直播间互动但未下单客户",
      updatedAt: "7月4日 16:12",
      versionHistory: [
        createWorkflowVersionHistoryItem("live-follow-up", 1, "7月4日 16:12", liveFollowUpDraft),
      ],
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
    canOperate: true,
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
    name: name?.trim() || "未命名 Workflow",
    nodes: draft.nodes.length,
    owner: "运营主管",
    permissions: createDefaultWorkflowPermissions(),
    publishedAt: null,
    publishedDraft: null,
    publishedRevision: null,
    revision: 1,
    runtimeStatus: "inactive",
    savedAt: "刚刚",
    status: "Draft",
    trigger: "待配置进入条件",
    updatedAt: "刚刚",
    versionHistory: [],
    workflowType,
  };
}

function createInMemoryCapabilitySummary(): WorkflowCapabilitySummary {
  return {
    runtimeSupportedNodeKinds: ["start", "wait", "wait-event", "branch", "message-query", "end"],
  };
}

function createDefaultWorkflowPermissions(): WorkflowDocumentPermissions {
  return {
    canEdit: true,
    canOperate: true,
    canPublish: true,
  };
}

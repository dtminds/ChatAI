import {
  createInitialDraft,
  createInitialEdges,
  createInitialNodes,
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
  normalizeWorkflowDraftPublishResult,
  normalizeWorkflowDraftSaveResult,
} from "./workflow-draft-persistence";
import { WorkflowRepositoryError } from "./workflow-repository-types";
import type {
  SyncWorkflowDraftRepository,
  WorkflowDocument,
  WorkflowDocumentPermissions,
} from "./workflow-repository-types";
import type { WorkflowDraft } from "./types";

export function createInMemoryWorkflowDraftRepository(): SyncWorkflowDraftRepository {
  let workflowDocuments = createWorkflowDocuments();
  let workflowIdSequence = 0;
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
      const clientRequestId = input?.clientRequestId?.trim();
      const name = input?.name?.trim();
      const description = input?.description?.trim() ?? "";

      if (input?.name !== undefined && !name) {
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
        return cloneWorkflowDocument(
          workflowDocuments[getWorkflowDocumentIndex(existingDocumentId)],
        );
      }

      workflowIdSequence += 1;
      const document = createNewWorkflowDocument(
        `workflow-${workflowIdSequence.toString(36)}`,
        name,
        description,
      );
      workflowDocuments = [document, ...workflowDocuments];

      if (clientRequestId) {
        createdDocumentIdsByRequest.set(clientRequestId, document.id);
      }

      return cloneWorkflowDocument(document);
    },
    deleteDocument: (workflowId) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      workflowDocuments.splice(documentIndex, 1);
    },
    enableDocument: (workflowId) => updateRuntimeStatus(workflowId, "active"),
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
      permissions: _permissions,
      publishedAt: _publishedAt,
      publishedDraft: _publishedDraft,
      publishedRevision: _publishedRevision,
      revision: _revision,
      savedAt: _savedAt,
      validatedDraftVersion: _validatedDraftVersion,
      versionHistory: _versionHistory,
      ...workflow
    }) => ({
      ...workflow,
      activationReady: workflow.runtimeStatus === "inactive"
        && _validatedDraftVersion !== undefined
        && _validatedDraftVersion === _revision,
      canOperate: _permissions.canOperate,
    })),
    pauseDocument: (workflowId) => updateRuntimeStatus(workflowId, "paused"),
    publishDraft: (workflowId, draft, options) => {
      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];

      if (
        options?.expectedBaseDraftHash
        && currentDocument.draftHash !== options.expectedBaseDraftHash
      ) {
        throw new WorkflowRepositoryError(
          "conflict",
          "Workflow draft has changed since publish started",
        );
      }

      const nextDraft = cloneWorkflowDraft(draft);
      const shouldCreateDraftRevision = !isWorkflowGraphEqual(currentDocument.draft, nextDraft);
      const persistedDraft = shouldCreateDraftRevision ? nextDraft : currentDocument.draft;
      const nextDraftRevision = shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision;
      const shouldCreatePublishedRevision = currentDocument.publishedRevision === null
        || !currentDocument.publishedDraft
        || createWorkflowPublishHash(currentDocument.publishedDraft) !== createWorkflowPublishHash(nextDraft);
      const nextPublishedRevision = shouldCreatePublishedRevision
        ? nextDraftRevision
        : currentDocument.publishedRevision;
      const publishedAt = shouldCreatePublishedRevision ? "刚刚" : currentDocument.publishedAt;
      const createdVersion = shouldCreatePublishedRevision
        ? createWorkflowVersionHistoryItem(currentDocument.id, nextDraftRevision, "刚刚", persistedDraft)
        : null;
      const currentVersion = createdVersion ?? currentDocument.currentVersion;
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : currentDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        currentVersion,
        draft: persistedDraft,
        draftHash: nextDraftHash,
        nodes: persistedDraft.nodes.length,
        publishedAt,
        publishedDraft: shouldCreatePublishedRevision
          ? cloneWorkflowDraft(persistedDraft)
          : currentDocument.publishedDraft,
        publishedRevision: nextPublishedRevision,
        revision: nextDraftRevision,
        savedAt: shouldCreatePublishedRevision ? "刚刚" : currentDocument.savedAt,
        status: "Published",
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt: shouldCreatePublishedRevision ? "刚刚" : currentDocument.updatedAt,
        validatedDraftVersion: nextDraftRevision,
        versionHistory: createdVersion
          ? [
              createdVersion,
              ...currentDocument.versionHistory.filter((historyVersion) => historyVersion.id !== createdVersion.id),
            ]
          : currentDocument.versionHistory,
      };

      workflowDocuments[documentIndex] = nextDocument;
      if (!shouldCreatePublishedRevision && currentVersion && nextPublishedRevision !== null && publishedAt) {
        return {
          document: cloneWorkflowDocument(nextDocument),
          draft: cloneWorkflowDraft(persistedDraft),
          draftHash: nextDraftHash,
          publishedAt,
          publishedRevision: nextPublishedRevision,
          revision: nextDraftRevision,
          updatedAt: nextDocument.updatedAt,
          validatedOnly: false,
          version: { ...currentVersion },
        };
      }
      return normalizeWorkflowDraftPublishResult(nextDocument);
    },
    reset: () => {
      workflowDocuments = createWorkflowDocuments();
      workflowIdSequence = 0;
      createdDocumentIdsByRequest.clear();
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
      const nextDocument = {
        ...currentDocument,
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
      const restoredVersion = currentDocument.versionHistory.find((version) => version.id === versionId);

      if (!restoredVersion) {
        throw new WorkflowRepositoryError("not-found", `Unknown workflow version: ${versionId}`);
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
        nodes: persistedDraft.nodes.length,
        revision: shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision,
        savedAt,
        trigger: getWorkflowTrigger(nextDraft) ?? currentDocument.trigger,
        updatedAt,
      };

      workflowDocuments[documentIndex] = nextDocument;
      return normalizeWorkflowDraftSaveResult(nextDocument);
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
                tagIds: ["tag-repurchase"],
                type: "customer.tag_added" as const,
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
    nodes: createInitialNodes().map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              triggers: [{
                keywords: ["直播", "活动"],
                match: "keywords" as const,
                type: "message.received" as const,
              }],
              title: "直播互动触发",
            },
          }
        : node,
    ),
    viewport: createInitialDraft().viewport,
  };

  return [
    {
      activationReady: true,
      canOperate: true,
      conversion: "18.4%",
      currentVersion: null,
      description: "引导新客户完成首次购买",
      draft: newcomerConversionDraft,
      draftHash: createWorkflowDraftHash(newcomerConversionDraft),
      entered: "124.8万",
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
      validatedDraftVersion: 1,
      versionHistory: [],
    },
    {
      activationReady: false,
      canOperate: true,
      conversion: "23.1%",
      currentVersion: createWorkflowPublishedVersion("vip-reactivation", 1, "昨天 21:04"),
      description: "唤醒长期未复购的会员客户",
      draft: vipReactivationDraft,
      draftHash: createWorkflowDraftHash(vipReactivationDraft),
      entered: "86.3万",
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
      validatedDraftVersion: 1,
      versionHistory: [
        createWorkflowVersionHistoryItem("vip-reactivation", 1, "昨天 21:04", vipReactivationDraft),
      ],
    },
    {
      activationReady: false,
      canOperate: true,
      conversion: "9.7%",
      currentVersion: null,
      description: "直播结束后继续跟进高意向客户",
      draft: liveFollowUpDraft,
      draftHash: createWorkflowDraftHash(liveFollowUpDraft),
      entered: "42.6万",
      id: "live-follow-up",
      name: "直播后跟进",
      nodes: 6,
      owner: "直播运营",
      permissions: createDefaultWorkflowPermissions(),
      publishedAt: null,
      publishedDraft: null,
      publishedRevision: null,
      revision: 1,
      runtimeStatus: "paused",
      savedAt: "7月4日 16:12",
      status: "Paused",
      trigger: "直播间互动但未下单客户",
      updatedAt: "7月4日 16:12",
      validatedDraftVersion: 1,
      versionHistory: [],
    },
  ];
}

function createNewWorkflowDocument(id: string, name?: string, description?: string): WorkflowDocument {
  const draft = createInitialDraft();

  return {
    activationReady: false,
    canOperate: true,
    conversion: "0%",
    currentVersion: null,
    description: description?.trim() || "",
    draft,
    draftHash: createWorkflowDraftHash(draft),
    entered: "0",
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
    validatedDraftVersion: null,
    versionHistory: [],
  };
}

function createDefaultWorkflowPermissions(): WorkflowDocumentPermissions {
  return {
    canEdit: true,
    canOperate: true,
    canPublish: true,
  };
}

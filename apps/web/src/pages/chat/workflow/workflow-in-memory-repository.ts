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
        input?.name,
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
      versionHistory: _versionHistory,
      ...workflow
    }) => workflow),
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
      const nextRevision = shouldCreateDraftRevision ? currentDocument.revision + 1 : currentDocument.revision;
      const publishedAt = "刚刚";
      const version = createWorkflowVersionHistoryItem(currentDocument.id, nextRevision, publishedAt, persistedDraft);
      const nextDraftHash = shouldCreateDraftRevision
        ? createWorkflowDraftHash(nextDraft)
        : currentDocument.draftHash;
      const nextDocument: WorkflowDocument = {
        ...currentDocument,
        conversion: getWorkflowConversion(nextDraft) ?? currentDocument.conversion,
        currentVersion: version,
        draft: persistedDraft,
        draftHash: nextDraftHash,
        nodes: persistedDraft.nodes.length,
        publishedAt,
        publishedDraft: cloneWorkflowDraft(persistedDraft),
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
      workflowIdSequence = 0;
      createdDocumentIdsByRequest.clear();
    },
    renameDocument: (workflowId, name) => {
      const normalizedName = name.trim();

      if (!normalizedName) {
        throw new WorkflowRepositoryError("validation", "Workflow name is required");
      }

      const documentIndex = getWorkflowDocumentIndex(workflowId);
      const currentDocument = workflowDocuments[documentIndex];
      const nextDocument = {
        ...currentDocument,
        name: normalizedName,
        updatedAt: "刚刚",
      };
      workflowDocuments[documentIndex] = nextDocument;
      return cloneWorkflowDocument(nextDocument);
    },
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
      node.id === "start"
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
      permissions: createDefaultWorkflowPermissions(),
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
      permissions: createDefaultWorkflowPermissions(),
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
      permissions: createDefaultWorkflowPermissions(),
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

function createNewWorkflowDocument(id: string, name?: string): WorkflowDocument {
  const draft = createInitialDraft();

  return {
    conversion: "0%",
    currentVersion: null,
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
    savedAt: "刚刚",
    status: "Draft",
    trigger: "待配置进入条件",
    updatedAt: "刚刚",
    versionHistory: [],
  };
}

function createDefaultWorkflowPermissions(): WorkflowDocumentPermissions {
  return {
    canEdit: true,
    canPublish: true,
  };
}

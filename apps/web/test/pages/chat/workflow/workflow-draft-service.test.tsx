import { act, renderHook, waitFor } from "@testing-library/react";
import type { WorkflowStartTrigger } from "@chatai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
  createWorkflowDraftHash,
  getWorkflowDocument,
  getWorkflowName,
  importWorkflowDraft,
  listWorkflowDocuments,
  publishWorkflowDraft,
  resetWorkflowDocumentsForTest,
  restoreWorkflowVersion,
  saveWorkflowDraft,
  useWorkflowDocument,
  WorkflowRepositoryError,
} from "@/pages/chat/workflow/workflow-draft-service";
import { createInitialDraft } from "@/pages/chat/workflow/graph";
import type {
  WorkflowDocument,
  WorkflowDraftRepository,
  SyncWorkflowDraftRepository,
  WorkflowVersionHistoryItem,
} from "@/pages/chat/workflow/workflow-draft-service";
import { isChatAiStartNodeData, type WorkflowDraft } from "@/pages/chat/workflow/types";

function getBranchPaths(draft: WorkflowDraft | null | undefined) {
  const data = draft?.nodes.find((node) => node.id === "branch-intent")?.data;

  return data?.kind === "branch" ? data.branchPaths ?? [] : [];
}
describe("workflow draft service", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
  });

  it("returns cloned workflow documents by route id", () => {
    const document = getWorkflowDocument("vip-reactivation");
    const clonedDocument = getWorkflowDocument("vip-reactivation");

    expect(document.name).toBe("会员复购唤醒");
    expect(document.draftHash).toBe(createWorkflowDraftHash(document.draft));
    expect(document.draft.nodes.find((node) => node.id === "start")?.data.title).toBe("复购唤醒触发");
    expect(document.draft.nodes).not.toBe(clonedDocument.draft.nodes);
    expect(listWorkflowDocuments().map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);
    expect(() => getWorkflowName("missing-workflow")).toThrow("Unknown workflow document");
  });

  it("initializes publish equality from an already-published document", () => {
    const publishedDocument = publishWorkflowDraft(
      "newcomer-conversion",
      getWorkflowDocument("newcomer-conversion").draft,
    );

    const { result } = renderHook(() => useWorkflowDocument(
      publishedDocument.id,
      undefined,
      publishedDocument,
    ));

    expect(result.current.publishState).toBe("published");
    expect(result.current.hasUnpublishedChanges).toBe(false);
  });

  it("keeps exact version lookups out of the paginated history", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const template = baseRepository.getDocument("vip-reactivation").versionHistory[0]!;
    const createVersion = (revision: number): WorkflowVersionHistoryItem => ({
      ...template,
      id: `vip-reactivation-r${revision}`,
      name: `版本 ${revision}`,
      revision,
    });
    const firstPage = Array.from({ length: 20 }, (_, index) => createVersion(100 - index));
    const secondPage = Array.from({ length: 20 }, (_, index) => createVersion(80 - index));
    const exactVersion = createVersion(50);
    const initialDocument = {
      ...baseRepository.getDocument("vip-reactivation"),
      currentVersion: firstPage[0]!,
      publishedRevision: 100,
      versionHistory: firstPage,
      versionHistoryNextCursor: "81",
    };
    const getVersion = vi.fn(() => exactVersion);
    const listVersions = vi.fn(() => ({ items: secondPage, nextCursor: "61" }));
    const repository: WorkflowDraftRepository = {
      ...baseRepository,
      getDocument: () => initialDocument,
      getVersion,
      listVersions,
    };
    const { result } = renderHook(() => useWorkflowDocument(
      initialDocument.id,
      repository,
      initialDocument,
    ));

    await act(async () => {
      await result.current.getVersion(50);
    });
    expect(result.current.document.versionHistory.map(version => version.revision))
      .toEqual(Array.from({ length: 20 }, (_, index) => 100 - index));

    await act(async () => {
      await result.current.listVersions("81");
    });
    expect(result.current.document.versionHistory.map(version => version.revision))
      .toEqual(Array.from({ length: 40 }, (_, index) => 100 - index));
    expect(getVersion).toHaveBeenCalledWith(initialDocument.id, 50);
    expect(listVersions).toHaveBeenCalledWith(initialDocument.id, "81");
  });

  it("creates independent workflow documents with idempotent request keys", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const newDocument = repository.createDocument({
      clientRequestId: "create-request-1",
      workflowType: "chatai_sop",
    });
    const repeatedResult = repository.createDocument({
      clientRequestId: "create-request-1",
      workflowType: "chatai_sop",
    });

    expect(newDocument.id).toBe("workflow-1");
    expect(newDocument.name).toBe("未命名 Workflow");
    expect(newDocument.draft.nodes.map((node) => node.data.kind)).toEqual(["start", "end"]);
    expect(repeatedResult.id).toBe(newDocument.id);
    expect(() => repository.createDocument({
      clientRequestId: "create-request-1",
      workflowType: "wecom_sop",
    })).toThrow(expect.objectContaining({ code: "conflict" }));
    expect(repository.listDocuments().items.map((workflow) => workflow.id)).toEqual([
      "workflow-1",
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);

    repository.saveDraft(newDocument.id, createDraftWithStartSourceMarker("新建 Workflow 人群"));

    expect(getStartSourceMarker(repository.getDocument(newDocument.id).draft))
      .toBe("新建 Workflow 人群");
    expect(getStartSourceMarker(repository.getDocument("newcomer-conversion").draft)).toBeNull();
  });

  it("searches workflow names only", () => {
    const repository = createInMemoryWorkflowDraftRepository();

    expect(repository.listDocuments({ query: "会员" }).items.map(item => item.id))
      .toEqual(["vip-reactivation"]);
    expect(repository.listDocuments({ query: "长期未复购" }).items).toEqual([]);
    expect(repository.listDocuments({ query: "添加好友" }).items).toEqual([]);
  });

  it("validates workflow metadata when creating in-memory documents", () => {
    const repository = createInMemoryWorkflowDraftRepository();

    expect(() => repository.createDocument({ name: " ", workflowType: "chatai_sop" }))
      .toThrow(WorkflowRepositoryError);
    expect(() => repository.createDocument({
      name: "名".repeat(101),
      workflowType: "chatai_sop",
    })).toThrow(WorkflowRepositoryError);
    expect(() => repository.createDocument({
      description: "描".repeat(1001),
      name: "有效名称",
      workflowType: "chatai_sop",
    })).toThrow(WorkflowRepositoryError);
  });

  it("renames and deletes workflow documents through the repository boundary", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const createdDocument = repository.createDocument({ workflowType: "chatai_sop" });

    expect(repository.updateDocumentMetadata(createdDocument.id, {
      description: "召回沉默客户",
      name: "活动召回",
    })).toMatchObject({ description: "召回沉默客户", name: "活动召回" });
    repository.deleteDocument(createdDocument.id);

    expect(repository.listDocuments().items.map((workflow) => workflow.id)).not.toContain(createdDocument.id);
    expect(() => repository.getDocument(createdDocument.id)).toThrow(WorkflowRepositoryError);
  });

  it("updates active workflow metadata without reloading its draft", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const initialDocument = baseRepository.getDocument("newcomer-conversion");
    let resolveUpdate!: (document: WorkflowDocument) => void;
    const updateDocumentMetadata = vi.fn(() => new Promise<WorkflowDocument>((resolve) => {
      resolveUpdate = resolve;
    }));
    const repository = { ...baseRepository, updateDocumentMetadata };
    const { result } = renderHook(() => useWorkflowDocument(
      initialDocument.id,
      repository,
      initialDocument,
    ));

    let firstUpdate!: Promise<boolean>;
    await act(async () => {
      firstUpdate = result.current.updateMetadata({
        description: "引导新客完成首购",
        name: "新客首购旅程",
      });
      expect(await result.current.updateMetadata({ description: "重复提交", name: "重复提交" })).toBe(false);
    });

    await act(async () => {
      resolveUpdate({
        ...initialDocument,
        description: "引导新客完成首购",
        name: "新客首购旅程",
      });
      expect(await firstUpdate).toBe(true);
    });

    expect(updateDocumentMetadata).toHaveBeenCalledOnce();
    expect(result.current.document.description).toBe("引导新客完成首购");
    expect(result.current.document.name).toBe("新客首购旅程");
    expect(result.current.document.draft).toEqual(initialDocument.draft);
    expect(result.current.metadataUpdateState).toBe("idle");
  });

  it("rejects unknown workflow ids instead of mutating the first document", () => {
    expect(() => getWorkflowDocument("missing-workflow")).toThrow("Unknown workflow document");
    expect(() => saveWorkflowDraft("missing-workflow", createDraftWithStartSourceMarker("错误 id 保存的人群")))
      .toThrow("Unknown workflow document");
    expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").draft)).toBeNull();
  });

  it("debounces mock draft saving state", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion"));

      expect(result.current.saveState).toBe("saved");

      const nextDraft = createDraftWithStartSourceMarker("已保存的人群");

      act(() => {
        result.current.markDirty(nextDraft);
      });
      expect(result.current.saveState).toBe("saving");

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("再次修改的人群"));
      });
      expect(result.current.saveState).toBe("dirty");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.lastSavedAt).toBe("刚刚");
      expect(result.current.document.updatedAt).toBe("刚刚");
      expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").draft)).toBe("再次修改的人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("does not schedule a save when the dirty draft matches the last saved hash", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

      act(() => {
        result.current.markDirty(result.current.document.draft);
      });

      expect(result.current.saveState).toBe("saved");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(repository.pendingSaves).toHaveLength(0);
      expect(result.current.lastSavedDraftHash).toBe(result.current.document.draftHash);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("flushes pending draft saves when the hook unmounts", () => {
    vi.useFakeTimers();

    try {
      const { result, unmount } = renderHook(() => useWorkflowDocument("newcomer-conversion"));
      const nextDraft = createDraftWithStartSourceMarker("卸载前保存的人群");

      act(() => {
        result.current.markDirty(nextDraft);
      });

      unmount();

      expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").draft)).toBe("卸载前保存的人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("flushes the previous workflow draft before switching documents", () => {
    vi.useFakeTimers();

    try {
      const { rerender, result } = renderHook(
        ({ workflowId }) => useWorkflowDocument(workflowId),
        { initialProps: { workflowId: "newcomer-conversion" } },
      );
      const nextDraft = createDraftWithStartSourceMarker("切换前保存的人群");

      act(() => {
        result.current.markDirty(nextDraft);
      });

      rerender({ workflowId: "vip-reactivation" });

      expect(result.current.document.id).toBe("vip-reactivation");
      expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").draft)).toBe("切换前保存的人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("saves sanitized draft snapshots through the mock repository", () => {
    const initialDraftHash = getWorkflowDocument("live-follow-up").draftHash;
    const draft = {
      ...createInitialDraft(),
      nodes: createInitialDraft().nodes.map((node) =>
        node.id === "message-welcome"
          ? {
              ...node,
              data: {
                ...node.data,
                onDelete: () => undefined,
                selected: true,
                title: "已持久化动作",
              },
              selected: true,
            }
          : node,
      ),
    };

    const savedDocument = saveWorkflowDraft("live-follow-up", draft);
    const savedNode = savedDocument.draft.nodes.find((node) => node.id === "message-welcome");

    expect(savedNode?.data.title).toBe("已持久化动作");
    expect(savedNode?.selected).toBe(false);
    expect(savedNode?.data.onDelete).toBeUndefined();
    expect(savedDocument.revision).toBe(2);
    expect(savedDocument.draftHash).not.toBe(initialDraftHash);
    expect(savedDocument.draftHash).toBe(createWorkflowDraftHash(savedDocument.draft));
    expect(getWorkflowDocument("live-follow-up").draft.nodes.find((node) => node.id === "message-welcome")?.data.title)
      .toBe("已持久化动作");
    expect(getWorkflowDocument("live-follow-up").draftHash).toBe(savedDocument.draftHash);
  });

  it("keeps revision and draft hash stable when saving an unchanged draft", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");
    const saveResult = repository.saveDraft("newcomer-conversion", document.draft);

    expect(saveResult.revision).toBe(document.revision);
    expect(saveResult.draftHash).toBe(document.draftHash);
    expect(saveResult.savedAt).toBe(document.savedAt);
    expect(saveResult.updatedAt).toBe(document.updatedAt);
  });

  it("keeps draft hash, revision, and persisted draft stable for viewport-only saves", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");
    const viewportOnlyDraft = {
      ...document.draft,
      viewport: { x: 320, y: 180, zoom: 0.72 },
    };
    const saveResult = repository.saveDraft("newcomer-conversion", viewportOnlyDraft);

    expect(createWorkflowDraftHash(viewportOnlyDraft)).toBe(document.draftHash);
    expect(saveResult.revision).toBe(document.revision);
    expect(saveResult.draftHash).toBe(document.draftHash);
    expect(saveResult.savedAt).toBe(document.savedAt);
    expect(saveResult.updatedAt).toBe(document.updatedAt);
    expect(repository.getDocument("newcomer-conversion").draft.viewport).toEqual(document.draft.viewport);
  });

  it("publishes the current draft as a versioned snapshot", () => {
    const draft = createDraftWithStartSourceMarker("发布版本的人群");
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", draft);

    expect(publishedDocument.status).toBe("Published");
    expect(publishedDocument.publishedAt).toBe("刚刚");
    expect(publishedDocument.publishedRevision).toBe(1);
    expect(publishedDocument.currentVersion).toEqual(expect.objectContaining({
      id: "newcomer-conversion-r1",
      revision: 1,
    }));
    expect(publishedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r1"]);
    expect(getStartSourceMarker(publishedDocument.versionHistory[0]?.draft ?? createInitialDraft()))
      .toBe("发布版本的人群");
    expect(getStartSourceMarker(publishedDocument.publishedDraft ?? createInitialDraft())).toBe("发布版本的人群");
    expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").publishedDraft ?? createInitialDraft()))
      .toBe("发布版本的人群");
  });

  it("deep-clones nested node config in published snapshots and version history", () => {
    const draft = createDraftWithBranchPaths();
    const sourceBranchPaths = getBranchPaths(draft);
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", draft);
    const storedDocument = getWorkflowDocument("newcomer-conversion");
    const publishedBranchPaths = getBranchPaths(publishedDocument.publishedDraft);
    const versionBranchPaths = getBranchPaths(publishedDocument.versionHistory[0]?.draft);
    const storedBranchPaths = getBranchPaths(storedDocument.publishedDraft);
    const publishedSnapshot = structuredClone(publishedBranchPaths);

    expect(versionBranchPaths).toEqual(publishedSnapshot);
    expect(storedBranchPaths).toEqual(publishedSnapshot);
    expect(publishedBranchPaths).not.toBe(sourceBranchPaths);
    expect(publishedBranchPaths?.[0]).not.toBe(sourceBranchPaths[0]);
    expect(versionBranchPaths).not.toBe(sourceBranchPaths);
    expect(versionBranchPaths?.[0]).not.toBe(sourceBranchPaths[0]);
    expect(storedBranchPaths).not.toBe(publishedBranchPaths);
    expect(storedBranchPaths?.[0]).not.toBe(publishedBranchPaths?.[0]);

    sourceBranchPaths[0]!.label = "外部串改";
    expect(publishedBranchPaths).toEqual(publishedSnapshot);
    expect(versionBranchPaths).toEqual(publishedSnapshot);
    expect(storedBranchPaths).toEqual(publishedSnapshot);
  });

  it("imports a sanitized draft without overwriting the published snapshot", () => {
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartSourceMarker("已发布的人群"));
    const importedDocument = importWorkflowDraft("newcomer-conversion", createDraftWithStartSourceMarker("导入草稿的人群"));

    expect(getStartSourceMarker(publishedDocument.publishedDraft ?? createInitialDraft())).toBe("已发布的人群");
    expect(importedDocument.status).toBe("Draft");
    expect(importedDocument.revision).toBe(3);
    expect(getStartSourceMarker(importedDocument.draft)).toBe("导入草稿的人群");
    expect(getStartSourceMarker(importedDocument.publishedDraft ?? createInitialDraft())).toBe("已发布的人群");
    expect(importedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r1"]);
  });

  it("restores a published version into the editable draft without deleting version history", () => {
    const firstPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartSourceMarker("第一版人群"));
    const secondPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartSourceMarker("第二版人群"));
    const restoredDocument = restoreWorkflowVersion(
      "newcomer-conversion",
      requireCurrentVersionSnapshot(firstPublishedDocument),
    );

    expect(secondPublishedDocument.currentVersion?.id).toBe("newcomer-conversion-r2");
    expect(restoredDocument.status).toBe("Draft");
    expect(restoredDocument.revision).toBe(4);
    expect(restoredDocument.currentVersion?.id).toBe("newcomer-conversion-r1");
    expect(getStartSourceMarker(restoredDocument.draft)).toBe("第一版人群");
    expect(getStartSourceMarker(restoredDocument.publishedDraft ?? createInitialDraft())).toBe("第二版人群");
    expect(restoredDocument.versionHistory.map((version) => version.id)).toEqual([
      "newcomer-conversion-r2",
      "newcomer-conversion-r1",
    ]);
  });

  it("keeps draft repositories isolated behind the persistence boundary", () => {
    const firstRepository = createInMemoryWorkflowDraftRepository();
    const secondRepository = createInMemoryWorkflowDraftRepository();
    const draft = createDraftWithStartSourceMarker("独立仓库保存的人群");

    firstRepository.saveDraft("newcomer-conversion", draft);

    expect(getStartSourceMarker(firstRepository.getDocument("newcomer-conversion").draft))
      .toBe("独立仓库保存的人群");
    expect(getStartSourceMarker(secondRepository.getDocument("newcomer-conversion").draft)).toBeNull();
  });

  it("keeps the in-memory repository available as an explicit test fixture", () => {
    const repository = createInMemoryWorkflowDraftRepository();

    repository.saveDraft("newcomer-conversion", createDraftWithStartSourceMarker("工厂仓库保存的人群"));

    expect(getStartSourceMarker(repository.getDocument("newcomer-conversion").draft)).toBe("工厂仓库保存的人群");
    expect(getStartSourceMarker(getWorkflowDocument("newcomer-conversion").draft)).toBeNull();
  });

  it("keeps saving state until an async repository save resolves", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));
      const nextDraft = createDraftWithStartSourceMarker("异步保存的人群");
      const initialDraftHash = result.current.lastSavedDraftHash;

      act(() => {
        result.current.markDirty(nextDraft);
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.saveState).toBe("saving");
      expect(repository.pendingSaves).toHaveLength(1);

      await act(async () => {
        repository.resolveSave(0);
        await Promise.resolve();
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.lastSavedAt).toBe("刚刚");
      expect(result.current.lastSavedDraftHash).not.toBe(initialDraftHash);
      expect(result.current.lastSavedDraftHash).toBe(result.current.document.draftHash);
      expect(getStartSourceMarker(result.current.document.draft)).toBe("异步保存的人群");
      expect(result.current.document.revision).toBe(2);
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("synchronizes lifecycle versions from a successful save response", async () => {
    vi.useFakeTimers();

    try {
      const baseRepository = createInMemoryWorkflowDraftRepository();
      const initialDocument = baseRepository.getDocument("newcomer-conversion");
      initialDocument.draftVersion = 7;
      initialDocument.runtimeStatus = "inactive";
      const repository: WorkflowDraftRepository = {
        ...baseRepository,
        saveDraft: (workflowId, draft) => {
          const saved = baseRepository.saveDraft(workflowId, draft);
          return {
            ...saved,
            document: {
              ...saved.document,
              draftVersion: 8,
              runtimeStatus: "inactive",
            },
          };
        },
      };
      const { result } = renderHook(() => useWorkflowDocument(
        initialDocument.id,
        repository,
        initialDocument,
      ));

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("发布检查后的新修改"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.document).toMatchObject({
        draftVersion: 8,
        runtimeStatus: "inactive",
      });
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("marks the current draft save as failed when an async repository save rejects", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("保存失败的人群"));
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      await act(async () => {
        repository.rejectSave(0);
        await Promise.resolve();
      });

      expect(result.current.saveState).toBe("error");
      expect(result.current.saveError?.code).toBe("server");

      await act(async () => {
        const retryPromise = result.current.retrySave();
        expect(repository.pendingSaves).toHaveLength(2);
        repository.resolveSave(1);
        await retryPromise;
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.saveError).toBeNull();
      expect(getStartSourceMarker(result.current.document.draft)).toBe("保存失败的人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("does not apply stale async save results after switching workflow documents", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { rerender, result } = renderHook(
        ({ workflowId }) => useWorkflowDocument(workflowId, repository),
        { initialProps: { workflowId: "newcomer-conversion" } },
      );

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("旧工作流保存结果"));
      });

      rerender({ workflowId: "vip-reactivation" });
      expect(result.current.document.id).toBe("vip-reactivation");

      await act(async () => {
        repository.resolveSave(0);
        await Promise.resolve();
      });

      expect(result.current.document.id).toBe("vip-reactivation");
      expect(result.current.document.trigger).toBe("90 天未复购会员");
      expect(getStartSourceMarker(repository.getDocument("newcomer-conversion").draft))
        .toBe("旧工作流保存结果");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("persists an undo that happens while an earlier save is in flight", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const initialDocument = repository.getDocument("newcomer-conversion");
      const { result } = renderHook(() => useWorkflowDocument(
        initialDocument.id,
        repository,
        initialDocument,
      ));

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("即将撤销的修改"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(repository.pendingSaves).toHaveLength(1);

      act(() => {
        result.current.markDirty(initialDocument.draft);
      });
      expect(result.current.saveState).not.toBe("saved");

      await act(async () => {
        repository.resolveSave(0);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(repository.pendingSaves).toHaveLength(2);

      await act(async () => {
        repository.resolveSave(1);
        await Promise.resolve();
      });
      expect(repository.getDocument(initialDocument.id).draftHash).toBe(initialDocument.draftHash);
      expect(result.current.saveState).toBe("saved");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("imports through an async repository and ignores stale import results after switching workflows", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await act(async () => {
      void result.current.importDraft(createDraftWithStartSourceMarker("旧工作流导入结果"));
    });

    await waitFor(() => {
      expect(repository.pendingImports).toHaveLength(1);
    });

    rerender({ workflowId: "vip-reactivation" });

    await act(async () => {
      repository.resolveImport(0);
      await Promise.resolve();
    });

    expect(result.current.document.id).toBe("vip-reactivation");
    expect(result.current.document.trigger).toBe("90 天未复购会员");
    expect(getStartSourceMarker(repository.getDocument("newcomer-conversion").draft)).toBe("旧工作流导入结果");
  });

  it("restores through an async repository and resets the hook document draft", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const publishedDocument = repository.getDocument("vip-reactivation");
    const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

    await act(async () => {
      const restorePromise = result.current.restoreVersion(requireCurrentVersionSnapshot(publishedDocument));
      await waitFor(() => {
        expect(repository.pendingRestores).toHaveLength(1);
      });
      repository.resolveRestore(0);
      await restorePromise;
    });

    expect(result.current.restoreState).toBe("restored");
    expect(result.current.saveState).toBe("saved");
    expect(result.current.document.status).toBe("Draft");
    expect(getStartTagIds(result.current.document.draft)).toEqual([203]);
  });

  it("waits for an in-flight save before restoring a version", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const publishedDocument = repository.getDocument("vip-reactivation");
      const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("恢复前正在保存的修改"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(repository.pendingSaves).toHaveLength(1);

      let restorePromise: ReturnType<typeof result.current.restoreVersion>;
      act(() => {
        restorePromise = result.current.restoreVersion(requireCurrentVersionSnapshot(publishedDocument));
      });
      expect(repository.pendingRestores).toHaveLength(0);

      await act(async () => {
        repository.resolveSave(0);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(repository.pendingRestores).toHaveLength(1);

      await act(async () => {
        repository.resolveRestore(0);
        await restorePromise!;
      });
      expect(result.current.restoreState).toBe("restored");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("does not restore when the save required by restoring fails", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const publishedDocument = repository.getDocument("vip-reactivation");
      const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

      act(() => {
        result.current.markDirty(createDraftWithStartSourceMarker("保存失败时禁止恢复"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      let restorePromise: ReturnType<typeof result.current.restoreVersion>;
      act(() => {
        restorePromise = result.current.restoreVersion(requireCurrentVersionSnapshot(publishedDocument));
      });

      await act(async () => {
        repository.rejectSave(0);
        await restorePromise!;
      });

      expect(repository.pendingRestores).toHaveLength(0);
      expect(result.current.saveState).toBe("error");
      expect(result.current.saveError?.code).toBe("server");
      expect(result.current.restoreState).toBe("error");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("marks restore as failed when the async repository restore rejects", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const publishedDocument = repository.getDocument("vip-reactivation");
    const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

    await act(async () => {
      void result.current.restoreVersion(requireCurrentVersionSnapshot(publishedDocument));
    });

    await act(async () => {
      repository.rejectRestore(0);
      await Promise.resolve();
    });

    expect(result.current.restoreState).toBe("error");
    expect(result.current.saveState).toBe("error");
  });

  it("does not apply stale async restore results after switching workflow documents", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const publishedDocument = repository.getDocument("vip-reactivation");
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "vip-reactivation" } },
    );

    await act(async () => {
      void result.current.restoreVersion(requireCurrentVersionSnapshot(publishedDocument));
    });

    expect(repository.pendingRestores).toHaveLength(1);

    rerender({ workflowId: "newcomer-conversion" });

    await act(async () => {
      repository.resolveRestore(0);
      await Promise.resolve();
    });

    expect(result.current.document.id).toBe("newcomer-conversion");
    expect(result.current.document.trigger).toBe("近 30 天新入会且未首购客户");
    expect(getStartTagIds(repository.getDocument("vip-reactivation").draft)).toEqual([203]);
  });
});

function requireCurrentVersionSnapshot(document: WorkflowDocument) {
  const version = document.versionHistory.find(
    item => item.revision === document.currentVersion?.revision,
  );
  if (!version) throw new Error("Current Workflow version snapshot is unavailable");
  return version;
}

function createDraftWithStartSourceMarker(marker: string): WorkflowDraft {
  return {
    ...createInitialDraft(),
    nodes: createInitialDraft().nodes.map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: node.data.kind === "start" && isChatAiStartNodeData(node.data)
              ? { ...node.data, seatIds: encodeStartSourceMarker(marker) }
              : node.data,
          }
        : node,
    ),
  };
}

function getStartSourceMarker(draft: WorkflowDraft) {
  const start = draft.nodes.find(node => node.data.kind === "start");
  if (start?.data.kind !== "start" || !isChatAiStartNodeData(start.data)) return null;
  const value = String.fromCodePoint(...start.data.seatIds.map(id => id % 1_000_000));
  return value === String.fromCodePoint(101, 102) ? null : value;
}

function encodeStartSourceMarker(marker: string) {
  return [...marker].map((character, index) =>
    (index + 1) * 1_000_000 + character.codePointAt(0)!,
  );
}

function getStartTagIds(draft: WorkflowDraft) {
  const start = draft.nodes.find(node => node.data.kind === "start");
  if (start?.data.kind !== "start") return [];
  for (const trigger of start.data.triggers as WorkflowStartTrigger[]) {
    if (trigger.type === "contact.tag_added") return trigger.tagIds;
  }
  return [];
}

function createDraftWithBranchPaths(): WorkflowDraft {
  return {
    ...createInitialDraft(),
    nodes: createInitialDraft().nodes.map((node) =>
      node.id === "branch-intent"
        ? {
            ...node,
            data: {
              ...node.data,
              branchPaths: [
                {
                  conditions: [{
                    id: "condition-vip",
                    operator: "equals",
                    selector: ["subject", "id"],
                    value: "VIP",
                  }],
                  id: "branch-vip",
                  label: "如果",
                  logic: "all",
                },
                {
                  conditions: [{
                    id: "condition-regular",
                    operator: "equals",
                    selector: ["subject", "id"],
                    value: "普通客户",
                  }],
                  id: "branch-regular",
                  label: "否则如果",
                  logic: "all",
                },
                {
                  conditions: [],
                  id: "branch-default",
                  isDefault: true,
                  label: "否则",
                  logic: "all",
                },
              ],
            },
          }
        : node,
    ),
  };
}

function createDeferredWorkflowDraftRepository() {
  const baseRepository = createInMemoryWorkflowDraftRepository();
  type ImportResult = ReturnType<typeof baseRepository.importDraft>;
  type RestoreResult = ReturnType<typeof baseRepository.restoreVersion>;
  type SaveResult = ReturnType<typeof baseRepository.saveDraft>;
  const pendingImports: Array<{
    draft: WorkflowDraft;
    reject: (error: Error) => void;
    resolve: (document: ImportResult) => void;
    workflowId: string;
  }> = [];
  const pendingSaves: Array<{
    draft: WorkflowDraft;
    reject: (error: Error) => void;
    resolve: (document: SaveResult) => void;
    workflowId: string;
  }> = [];
  const pendingRestores: Array<{
    reject: (error: Error) => void;
    resolve: (document: RestoreResult) => void;
    version: WorkflowVersionHistoryItem;
    workflowId: string;
  }> = [];

  const repository: Omit<WorkflowDraftRepository, "getDocument" | "listDocuments">
    & Pick<SyncWorkflowDraftRepository, "getDocument" | "listDocuments">
    & {
    pendingImports: typeof pendingImports;
    pendingRestores: typeof pendingRestores;
    pendingSaves: typeof pendingSaves;
    rejectImport: (index: number) => void;
    rejectRestore: (index: number) => void;
    rejectSave: (index: number) => void;
    resolveImport: (index: number) => void;
    resolveRestore: (index: number) => void;
    resolveSave: (index: number) => void;
  } = {
    ...baseRepository,
    createDocument: baseRepository.createDocument,
    deleteDocument: baseRepository.deleteDocument,
    getDocument: baseRepository.getDocument,
    importDraft: (workflowId, draft) => new Promise((resolve, reject) => {
      pendingImports.push({
        draft,
        reject,
        resolve,
        workflowId,
      });
    }),
    listDocuments: baseRepository.listDocuments,
    pendingImports,
    pendingRestores,
    pendingSaves,
    rejectImport: (index) => {
      pendingImports[index]?.reject(new Error("import failed"));
    },
    rejectRestore: (index) => {
      pendingRestores[index]?.reject(new Error("restore failed"));
    },
    rejectSave: (index) => {
      pendingSaves[index]?.reject(new Error("save failed"));
    },
    updateDocumentMetadata: baseRepository.updateDocumentMetadata,
    resolveImport: (index) => {
      const pendingImport = pendingImports[index];

      if (!pendingImport) {
        return;
      }

      pendingImport.resolve(baseRepository.importDraft(pendingImport.workflowId, pendingImport.draft));
    },
    resolveRestore: (index) => {
      const pendingRestore = pendingRestores[index];

      if (!pendingRestore) {
        return;
      }

      pendingRestore.resolve(baseRepository.restoreVersion(pendingRestore.workflowId, pendingRestore.version));
    },
    resolveSave: (index) => {
      const pendingSave = pendingSaves[index];

      if (!pendingSave) {
        return;
      }

      pendingSave.resolve(baseRepository.saveDraft(pendingSave.workflowId, pendingSave.draft));
    },
    saveDraft: (workflowId, draft) => new Promise((resolve, reject) => {
      pendingSaves.push({
        draft,
        reject,
        resolve,
        workflowId,
      });
    }),
    restoreVersion: (workflowId, version) => new Promise((resolve, reject) => {
      pendingRestores.push({
        reject,
        resolve,
        version,
        workflowId,
      });
    }),
  };

  return repository;
}

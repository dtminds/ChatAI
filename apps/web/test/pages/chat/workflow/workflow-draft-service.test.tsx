import { act, renderHook, waitFor } from "@testing-library/react";
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
  WorkflowDraftRepository,
  WorkflowDraftPublishOptions,
  WorkflowDraftReader,
  WorkflowDraftWriter,
  SyncWorkflowDraftRepository,
} from "@/pages/chat/workflow/workflow-draft-service";
import type { WorkflowDraft } from "@/pages/chat/workflow/types";

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

  it("creates independent workflow documents with idempotent request keys", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const newDocument = repository.createDocument({ clientRequestId: "create-request-1" });
    const repeatedResult = repository.createDocument({ clientRequestId: "create-request-1" });

    expect(newDocument.id).toBe("workflow-1");
    expect(newDocument.name).toBe("未命名 Workflow");
    expect(newDocument.draft.nodes.map((node) => node.data.kind)).toEqual(["start", "wait", "branch", "message", "end"]);
    expect(repeatedResult.id).toBe(newDocument.id);
    expect(repository.listDocuments().map((workflow) => workflow.id)).toEqual([
      "workflow-1",
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);

    repository.saveDraft(newDocument.id, createDraftWithStartAudience("新建 Workflow 人群"));

    expect(repository.getDocument(newDocument.id).draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("新建 Workflow 人群");
    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("renames and deletes workflow documents through the repository boundary", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const createdDocument = repository.createDocument();

    expect(repository.renameDocument(createdDocument.id, "活动召回").name).toBe("活动召回");
    repository.deleteDocument(createdDocument.id);

    expect(repository.listDocuments().map((workflow) => workflow.id)).not.toContain(createdDocument.id);
    expect(() => repository.getDocument(createdDocument.id)).toThrow(WorkflowRepositoryError);
  });

  it("rejects unknown workflow ids instead of mutating the first document", () => {
    expect(() => getWorkflowDocument("missing-workflow")).toThrow("Unknown workflow document");
    expect(() => saveWorkflowDraft("missing-workflow", createDraftWithStartAudience("错误 id 保存的人群")))
      .toThrow("Unknown workflow document");
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("debounces mock draft saving state", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion"));

      expect(result.current.saveState).toBe("saved");

      const nextDraft = {
        ...createInitialDraft(),
        nodes: createInitialDraft().nodes.map((node) =>
          node.id === "start"
            ? {
                ...node,
                data: {
                  ...node.data,
                  audience: "已保存的人群",
                },
              }
            : node,
        ),
      };

      act(() => {
        result.current.markDirty(nextDraft);
      });
      expect(result.current.saveState).toBe("saving");

      act(() => {
        result.current.markDirty({
          ...nextDraft,
          nodes: nextDraft.nodes.map((node) =>
            node.id === "start"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    audience: "再次修改的人群",
                  },
                }
              : node,
          ),
        });
      });
      expect(result.current.saveState).toBe("dirty");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.lastSavedAt).toBe("刚刚");
      expect(result.current.document.updatedAt).toBe("刚刚");
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("再次修改的人群");
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
      const nextDraft = {
        ...createInitialDraft(),
        nodes: createInitialDraft().nodes.map((node) =>
          node.id === "start"
            ? {
                ...node,
                data: {
                  ...node.data,
                  audience: "卸载前保存的人群",
                },
              }
            : node,
        ),
      };

      act(() => {
        result.current.markDirty(nextDraft);
      });

      unmount();

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("卸载前保存的人群");
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
      const nextDraft = {
        ...createInitialDraft(),
        nodes: createInitialDraft().nodes.map((node) =>
          node.id === "start"
            ? {
                ...node,
                data: {
                  ...node.data,
                  audience: "切换前保存的人群",
                },
              }
            : node,
        ),
      };

      act(() => {
        result.current.markDirty(nextDraft);
      });

      rerender({ workflowId: "vip-reactivation" });

      expect(result.current.document.id).toBe("vip-reactivation");
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("切换前保存的人群");
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
    const draft = createDraftWithStartAudience("发布版本的人群");
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", draft);

    expect(publishedDocument.status).toBe("Published");
    expect(publishedDocument.publishedAt).toBe("刚刚");
    expect(publishedDocument.publishedRevision).toBe(2);
    expect(publishedDocument.currentVersion).toEqual(expect.objectContaining({
      id: "newcomer-conversion-r2",
      revision: 2,
    }));
    expect(publishedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r2"]);
    expect(publishedDocument.versionHistory[0]?.draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("发布版本的人群");
    expect(publishedDocument.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("发布版本的人群");
    expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
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

    expect(publishedBranchPaths).toEqual(sourceBranchPaths);
    expect(versionBranchPaths).toEqual(sourceBranchPaths);
    expect(storedBranchPaths).toEqual(sourceBranchPaths);
    expect(publishedBranchPaths).not.toBe(sourceBranchPaths);
    expect(publishedBranchPaths?.[0]).not.toBe(sourceBranchPaths[0]);
    expect(versionBranchPaths).not.toBe(sourceBranchPaths);
    expect(versionBranchPaths?.[0]).not.toBe(sourceBranchPaths[0]);
    expect(storedBranchPaths).not.toBe(publishedBranchPaths);
    expect(storedBranchPaths?.[0]).not.toBe(publishedBranchPaths?.[0]);

    sourceBranchPaths[0]!.label = "外部串改";
    expect(publishedBranchPaths?.[0]?.label).toBe("VIP");
    expect(versionBranchPaths?.[0]?.label).toBe("VIP");
    expect(storedBranchPaths?.[0]?.label).toBe("VIP");
  });

  it("imports a sanitized draft without overwriting the published snapshot", () => {
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartAudience("已发布的人群"));
    const importedDocument = importWorkflowDraft("newcomer-conversion", createDraftWithStartAudience("导入草稿的人群"));

    expect(publishedDocument.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("已发布的人群");
    expect(importedDocument.status).toBe("Draft");
    expect(importedDocument.revision).toBe(3);
    expect(importedDocument.draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("导入草稿的人群");
    expect(importedDocument.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("已发布的人群");
    expect(importedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r2"]);
  });

  it("restores a published version into the editable draft without deleting version history", () => {
    const firstPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartAudience("第一版人群"));
    const secondPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithStartAudience("第二版人群"));
    const restoredDocument = restoreWorkflowVersion("newcomer-conversion", firstPublishedDocument.currentVersion?.id ?? "");

    expect(secondPublishedDocument.currentVersion?.id).toBe("newcomer-conversion-r3");
    expect(restoredDocument.status).toBe("Draft");
    expect(restoredDocument.revision).toBe(4);
    expect(restoredDocument.currentVersion?.id).toBe("newcomer-conversion-r2");
    expect(restoredDocument.draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("第一版人群");
    expect(restoredDocument.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("第二版人群");
    expect(restoredDocument.versionHistory.map((version) => version.id)).toEqual([
      "newcomer-conversion-r3",
      "newcomer-conversion-r2",
    ]);
  });

  it("keeps draft repositories isolated behind the persistence boundary", () => {
    const firstRepository = createInMemoryWorkflowDraftRepository();
    const secondRepository = createInMemoryWorkflowDraftRepository();
    const draft = {
      ...createInitialDraft(),
      nodes: createInitialDraft().nodes.map((node) =>
        node.id === "start"
          ? {
              ...node,
              data: {
                ...node.data,
                audience: "独立仓库保存的人群",
              },
            }
          : node,
      ),
    };

    firstRepository.saveDraft("newcomer-conversion", draft);

    expect(firstRepository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("独立仓库保存的人群");
    expect(secondRepository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("keeps the in-memory repository available as an explicit test fixture", () => {
    const repository = createInMemoryWorkflowDraftRepository();

    repository.saveDraft("newcomer-conversion", createDraftWithStartAudience("工厂仓库保存的人群"));

    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("工厂仓库保存的人群");
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("treats the draft repository as a replaceable reader and writer contract", async () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const reader: WorkflowDraftReader = repository;
    const writer: WorkflowDraftWriter = repository;

    expect((await Promise.resolve(reader.listDocuments())).map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);

    writer.saveDraft("newcomer-conversion", createDraftWithStartAudience("通过 writer 保存的人群"));

    expect((await Promise.resolve(reader.getDocument("newcomer-conversion"))).draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("通过 writer 保存的人群");
  });

  it("keeps saving state until an async repository save resolves", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));
      const nextDraft = createDraftWithStartAudience("异步保存的人群");
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
      expect(result.current.document.trigger).toBe("异步保存的人群");
      expect(result.current.document.revision).toBe(2);
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
        result.current.markDirty(createDraftWithStartAudience("保存失败的人群"));
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
      expect(result.current.document.trigger).toBe("保存失败的人群");
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
        result.current.markDirty(createDraftWithStartAudience("旧工作流保存结果"));
      });

      rerender({ workflowId: "vip-reactivation" });
      expect(result.current.document.id).toBe("vip-reactivation");

      await act(async () => {
        repository.resolveSave(0);
        await Promise.resolve();
      });

      expect(result.current.document.id).toBe("vip-reactivation");
      expect(result.current.document.trigger).toBe("90 天未复购会员");
      expect(repository.getDocument("newcomer-conversion").trigger).toBe("旧工作流保存结果");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("publishes through an async repository and keeps the hook draft current", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      const publishPromise = result.current.publishDraft(createDraftWithStartAudience("异步发布的人群"));
      await waitFor(() => {
        expect(repository.pendingPublishes).toHaveLength(1);
      });
      repository.resolvePublish(0);
      await publishPromise;
    });

    expect(result.current.publishState).toBe("published");
    expect(result.current.document.status).toBe("Published");
    expect(result.current.document.publishedRevision).toBe(2);
    expect(result.current.document.draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("异步发布的人群");
    expect(result.current.document.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("异步发布的人群");
  });

  it("keeps publish state aligned with the editable draft and published snapshot", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion"));

      await act(async () => {
        await result.current.publishDraft(createDraftWithStartAudience("已发布的人群"));
      });

      expect(result.current.publishState).toBe("published");
      expect(result.current.document.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("已发布的人群");

      act(() => {
        result.current.markDirty(createDraftWithStartAudience("发布后的草稿修改"));
      });

      expect(result.current.publishState).toBe("idle");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("发布后的草稿修改");
      expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("已发布的人群");

      act(() => {
        result.current.markDirty(createDraftWithStartAudience("已发布的人群"));
      });

      expect(result.current.publishState).toBe("published");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps published state for viewport-only dirty events", async () => {
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion"));

    await act(async () => {
      await result.current.publishDraft(result.current.document.draft);
    });

    expect(result.current.publishState).toBe("published");

    act(() => {
      result.current.markDirty({
        ...result.current.document.draft,
        viewport: { x: 320, y: 180, zoom: 0.72 },
      });
    });

    expect(result.current.publishState).toBe("published");
    expect(result.current.saveState).toBe("saved");
  });

  it("marks publish as failed when the async repository publish rejects", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      void result.current.publishDraft(createDraftWithStartAudience("发布失败的人群"));
    });

    await act(async () => {
      repository.rejectPublish(0);
      await Promise.resolve();
    });

    expect(result.current.publishState).toBe("error");
    expect(result.current.publishError?.code).toBe("server");
    expect(result.current.document.status).toBe("Draft");
  });

  it("exposes publish conflicts separately from retryable publish failures", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const repository: WorkflowDraftRepository = {
      ...baseRepository,
      publishDraft: () => {
        throw new WorkflowRepositoryError("conflict", "stale draft");
      },
    };
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      await result.current.publishDraft(result.current.document.draft);
    });

    expect(result.current.publishState).toBe("error");
    expect(result.current.publishError?.code).toBe("conflict");
  });

  it("imports through an async repository and ignores stale import results after switching workflows", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await act(async () => {
      void result.current.importDraft(createDraftWithStartAudience("旧工作流导入结果"));
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
    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("旧工作流导入结果");
  });

  it("keeps published snapshots cloned behind the repository boundary", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const publishedDocument = repository.publishDraft("newcomer-conversion", createDraftWithStartAudience("发布克隆的人群")).document;
    const fetchedDocument = repository.getDocument("newcomer-conversion");

    publishedDocument.publishedDraft?.nodes.splice(0, 1);
    publishedDocument.versionHistory[0]?.draft.nodes.splice(0, 1);
    if (publishedDocument.currentVersion) {
      publishedDocument.currentVersion.name = "被外部改坏的版本";
    }

    expect(fetchedDocument.publishedDraft?.nodes).toHaveLength(createInitialDraft().nodes.length);
    expect(fetchedDocument.versionHistory[0]?.draft.nodes).toHaveLength(createInitialDraft().nodes.length);
    expect(fetchedDocument.currentVersion?.name).toBe("版本 2");
  });

  it("keeps an existing revision when publishing an unchanged draft", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");
    const publishedDocument = repository.publishDraft("newcomer-conversion", document.draft).document;

    expect(publishedDocument.revision).toBe(1);
    expect(publishedDocument.publishedRevision).toBe(1);
  });

  it("keeps an existing revision and published draft when publishing a viewport-only draft", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");
    const publishedDocument = repository.publishDraft("newcomer-conversion", {
      ...document.draft,
      viewport: { x: 320, y: 180, zoom: 0.72 },
    }).document;

    expect(publishedDocument.revision).toBe(1);
    expect(publishedDocument.publishedRevision).toBe(1);
    expect(publishedDocument.draftHash).toBe(document.draftHash);
    expect(publishedDocument.draft.viewport).toEqual(document.draft.viewport);
    expect(publishedDocument.publishedDraft?.viewport).toEqual(document.draft.viewport);
  });

  it("rejects stale repository publishes when the saved draft hash changed", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");

    repository.saveDraft("newcomer-conversion", createDraftWithStartAudience("并发保存的人群"));

    expect(() => repository.publishDraft("newcomer-conversion", document.draft, {
      expectedBaseDraftHash: document.draftHash,
    })).toThrow("Workflow draft has changed since publish started");
    expect(repository.getDocument("newcomer-conversion").publishedDraft).toBeNull();
    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("并发保存的人群");
  });

  it("does not apply stale async publish results after switching workflow documents", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await act(async () => {
      void result.current.publishDraft(createDraftWithStartAudience("旧工作流发布结果"));
    });

    expect(repository.pendingPublishes).toHaveLength(1);

    rerender({ workflowId: "vip-reactivation" });

    await act(async () => {
      repository.resolvePublish(0);
      await Promise.resolve();
    });

    expect(result.current.document.id).toBe("vip-reactivation");
    expect(result.current.document.publishedAt).toBe("昨天 21:04");
    expect(repository.getDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("旧工作流发布结果");
  });

  it("ignores direct dirty writes while a publish is in progress", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

      await act(async () => {
        void result.current.publishDraft(createDraftWithStartAudience("旧发布请求的人群"));
      });

      expect(repository.pendingPublishes).toHaveLength(1);
      expect(result.current.publishState).toBe("publishing");

      act(() => {
        result.current.markDirty(createDraftWithStartAudience("发布期间继续编辑的人群"));
      });

      expect(result.current.publishState).toBe("publishing");
      expect(repository.pendingSaves).toHaveLength(0);

      await act(async () => {
        repository.resolvePublish(0);
        await Promise.resolve();
      });

      expect(result.current.publishState).toBe("published");
      expect(result.current.document.status).toBe("Published");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("旧发布请求的人群");
      expect(repository.getDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
        .toBe("旧发布请求的人群");
    }
    finally {
      vi.useRealTimers();
    }
  });

  it("keeps async publish results valid after a no-op dirty event", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      void result.current.publishDraft(createDraftWithStartAudience("异步发布的人群"));
    });

    expect(repository.pendingPublishes).toHaveLength(1);
    expect(result.current.publishState).toBe("publishing");

    act(() => {
      result.current.markDirty(result.current.document.draft);
    });

    expect(result.current.saveState).toBe("saved");
    expect(result.current.publishState).toBe("publishing");

    await act(async () => {
      repository.resolvePublish(0);
      await Promise.resolve();
    });

    expect(result.current.publishState).toBe("published");
    expect(result.current.document.status).toBe("Published");
    expect(result.current.document.publishedDraft?.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("异步发布的人群");
  });

  it("restores through an async repository and resets the hook document draft", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const publishedDocument = repository.getDocument("vip-reactivation");
    const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

    await act(async () => {
      const restorePromise = result.current.restoreVersion(publishedDocument.currentVersion?.id ?? "");
      await waitFor(() => {
        expect(repository.pendingRestores).toHaveLength(1);
      });
      repository.resolveRestore(0);
      await restorePromise;
    });

    expect(result.current.restoreState).toBe("restored");
    expect(result.current.saveState).toBe("saved");
    expect(result.current.document.status).toBe("Draft");
    expect(result.current.document.draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("90 天未复购会员");
  });

  it("marks restore as failed when the async repository restore rejects", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const publishedDocument = repository.getDocument("vip-reactivation");
    const { result } = renderHook(() => useWorkflowDocument("vip-reactivation", repository));

    await act(async () => {
      void result.current.restoreVersion(publishedDocument.currentVersion?.id ?? "");
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
      void result.current.restoreVersion(publishedDocument.currentVersion?.id ?? "");
    });

    expect(repository.pendingRestores).toHaveLength(1);

    rerender({ workflowId: "newcomer-conversion" });

    await act(async () => {
      repository.resolveRestore(0);
      await Promise.resolve();
    });

    expect(result.current.document.id).toBe("newcomer-conversion");
    expect(result.current.document.trigger).toBe("近 30 天新入会且未首购客户");
    expect(repository.getDocument("vip-reactivation").draft.nodes.find((node) => node.id === "start")?.data.audience)
      .toBe("90 天未复购会员");
  });
});

function createDraftWithStartAudience(audience: string): WorkflowDraft {
  return {
    ...createInitialDraft(),
    nodes: createInitialDraft().nodes.map((node) =>
      node.id === "start"
        ? {
            ...node,
            data: {
              ...node.data,
              audience,
            },
          }
        : node,
    ),
  };
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
                { id: "branch-vip", label: "VIP", operator: "IF", title: "CASE 1" },
                { id: "branch-regular", label: "普通客户", operator: "ELIF", title: "CASE 2" },
                { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 3" },
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
  type PublishResult = ReturnType<typeof baseRepository.publishDraft>;
  type RestoreResult = ReturnType<typeof baseRepository.restoreVersion>;
  type SaveResult = ReturnType<typeof baseRepository.saveDraft>;
  const pendingImports: Array<{
    draft: WorkflowDraft;
    reject: (error: Error) => void;
    resolve: (document: ImportResult) => void;
    workflowId: string;
  }> = [];
  const pendingPublishes: Array<{
    draft: WorkflowDraft;
    options?: WorkflowDraftPublishOptions;
    reject: (error: Error) => void;
    resolve: (document: PublishResult) => void;
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
    versionId: string;
    workflowId: string;
  }> = [];

  const repository: Omit<WorkflowDraftRepository, "getDocument" | "listDocuments">
    & Pick<SyncWorkflowDraftRepository, "getDocument" | "listDocuments">
    & {
    pendingImports: typeof pendingImports;
    pendingPublishes: typeof pendingPublishes;
    pendingRestores: typeof pendingRestores;
    pendingSaves: typeof pendingSaves;
    rejectImport: (index: number) => void;
    rejectPublish: (index: number) => void;
    rejectRestore: (index: number) => void;
    rejectSave: (index: number) => void;
    resolveImport: (index: number) => void;
    resolvePublish: (index: number) => void;
    resolveRestore: (index: number) => void;
    resolveSave: (index: number) => void;
  } = {
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
    pendingPublishes,
    pendingRestores,
    pendingSaves,
    publishDraft: (workflowId, draft, options) => new Promise((resolve, reject) => {
      pendingPublishes.push({
        draft,
        options,
        reject,
        resolve,
        workflowId,
      });
    }),
    rejectPublish: (index) => {
      pendingPublishes[index]?.reject(new Error("publish failed"));
    },
    rejectImport: (index) => {
      pendingImports[index]?.reject(new Error("import failed"));
    },
    rejectRestore: (index) => {
      pendingRestores[index]?.reject(new Error("restore failed"));
    },
    rejectSave: (index) => {
      pendingSaves[index]?.reject(new Error("save failed"));
    },
    renameDocument: baseRepository.renameDocument,
    resolveImport: (index) => {
      const pendingImport = pendingImports[index];

      if (!pendingImport) {
        return;
      }

      pendingImport.resolve(baseRepository.importDraft(pendingImport.workflowId, pendingImport.draft));
    },
    resolvePublish: (index) => {
      const pendingPublish = pendingPublishes[index];

      if (!pendingPublish) {
        return;
      }

      pendingPublish.resolve(baseRepository.publishDraft(
        pendingPublish.workflowId,
        pendingPublish.draft,
        pendingPublish.options,
      ));
    },
    resolveRestore: (index) => {
      const pendingRestore = pendingRestores[index];

      if (!pendingRestore) {
        return;
      }

      pendingRestore.resolve(baseRepository.restoreVersion(pendingRestore.workflowId, pendingRestore.versionId));
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
    restoreVersion: (workflowId, versionId) => new Promise((resolve, reject) => {
      pendingRestores.push({
        reject,
        resolve,
        versionId,
        workflowId,
      });
    }),
  };

  return repository;
}

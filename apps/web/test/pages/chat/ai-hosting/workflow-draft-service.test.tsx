import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
  createWorkflowDraftHash,
  createWorkflowDraftRepository,
  getWorkflowDocument,
  getWorkflowName,
  importWorkflowDraft,
  listWorkflowDocuments,
  publishWorkflowDraft,
  resetWorkflowDocumentsForTest,
  restoreWorkflowVersion,
  saveWorkflowDraft,
  useWorkflowDocument,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";
import { createInitialDraft } from "@/pages/chat/ai-hosting/workflow/graph";
import type {
  WorkflowDraftRepository,
  WorkflowDraftReader,
  WorkflowDraftWriter,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

describe("workflow draft service", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
  });

  it("returns cloned workflow documents by route id", () => {
    const document = getWorkflowDocument("vip-reactivation");
    const clonedDocument = getWorkflowDocument("vip-reactivation");

    expect(document.name).toBe("会员复购唤醒");
    expect(document.draftHash).toBe(createWorkflowDraftHash(document.draft));
    expect(document.draft.nodes.find((node) => node.id === "trigger")?.data.title).toBe("复购唤醒触发");
    expect(document.draft.nodes).not.toBe(clonedDocument.draft.nodes);
    expect(listWorkflowDocuments().map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);
    expect(getWorkflowName("missing-workflow")).toBe("新人转化旅程");
  });

  it("debounces mock draft saving state", async () => {
    vi.useFakeTimers();

    try {
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion"));

      expect(result.current.saveState).toBe("saved");

      const nextDraft = {
        ...createInitialDraft(),
        nodes: createInitialDraft().nodes.map((node) =>
          node.id === "trigger"
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
            node.id === "trigger"
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
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
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
          node.id === "trigger"
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

      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
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
          node.id === "trigger"
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
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
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
        node.id === "action-message"
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
    const savedNode = savedDocument.draft.nodes.find((node) => node.id === "action-message");

    expect(savedNode?.data.title).toBe("已持久化动作");
    expect(savedNode?.selected).toBe(false);
    expect(savedNode?.data.onDelete).toBeUndefined();
    expect(savedDocument.revision).toBe(2);
    expect(savedDocument.draftHash).not.toBe(initialDraftHash);
    expect(savedDocument.draftHash).toBe(createWorkflowDraftHash(savedDocument.draft));
    expect(getWorkflowDocument("live-follow-up").draft.nodes.find((node) => node.id === "action-message")?.data.title)
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

  it("publishes the current draft as a versioned snapshot", () => {
    const draft = createDraftWithTriggerAudience("发布版本的人群");
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", draft);

    expect(publishedDocument.status).toBe("Published");
    expect(publishedDocument.publishedAt).toBe("刚刚");
    expect(publishedDocument.publishedRevision).toBe(2);
    expect(publishedDocument.currentVersion).toEqual(expect.objectContaining({
      id: "newcomer-conversion-r2",
      revision: 2,
    }));
    expect(publishedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r2"]);
    expect(publishedDocument.versionHistory[0]?.draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("发布版本的人群");
    expect(publishedDocument.publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("发布版本的人群");
    expect(getWorkflowDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("发布版本的人群");
  });

  it("imports a sanitized draft without overwriting the published snapshot", () => {
    const publishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithTriggerAudience("已发布的人群"));
    const importedDocument = importWorkflowDraft("newcomer-conversion", createDraftWithTriggerAudience("导入草稿的人群"));

    expect(publishedDocument.publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("已发布的人群");
    expect(importedDocument.status).toBe("Draft");
    expect(importedDocument.revision).toBe(3);
    expect(importedDocument.draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("导入草稿的人群");
    expect(importedDocument.publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("已发布的人群");
    expect(importedDocument.versionHistory.map((version) => version.id)).toEqual(["newcomer-conversion-r2"]);
  });

  it("restores a published version into the editable draft without deleting version history", () => {
    const firstPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithTriggerAudience("第一版人群"));
    const secondPublishedDocument = publishWorkflowDraft("newcomer-conversion", createDraftWithTriggerAudience("第二版人群"));
    const restoredDocument = restoreWorkflowVersion("newcomer-conversion", firstPublishedDocument.currentVersion?.id ?? "");

    expect(secondPublishedDocument.currentVersion?.id).toBe("newcomer-conversion-r3");
    expect(restoredDocument.status).toBe("Draft");
    expect(restoredDocument.revision).toBe(4);
    expect(restoredDocument.currentVersion?.id).toBe("newcomer-conversion-r2");
    expect(restoredDocument.draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("第一版人群");
    expect(restoredDocument.publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
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
        node.id === "trigger"
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

    expect(firstRepository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("独立仓库保存的人群");
    expect(secondRepository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("creates the default repository through the replaceable repository factory", () => {
    const repository = createWorkflowDraftRepository();

    repository.saveDraft("newcomer-conversion", createDraftWithTriggerAudience("工厂仓库保存的人群"));

    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("工厂仓库保存的人群");
    expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
  });

  it("treats the draft repository as a replaceable reader and writer contract", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const reader: WorkflowDraftReader = repository;
    const writer: WorkflowDraftWriter = repository;

    expect(reader.listDocuments().map((workflow) => workflow.id)).toEqual([
      "newcomer-conversion",
      "vip-reactivation",
      "live-follow-up",
    ]);

    writer.saveDraft("newcomer-conversion", createDraftWithTriggerAudience("通过 writer 保存的人群"));

    expect(reader.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("通过 writer 保存的人群");
  });

  it("keeps saving state until an async repository save resolves", async () => {
    vi.useFakeTimers();

    try {
      const repository = createDeferredWorkflowDraftRepository();
      const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));
      const nextDraft = createDraftWithTriggerAudience("异步保存的人群");
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
        result.current.markDirty(createDraftWithTriggerAudience("保存失败的人群"));
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      await act(async () => {
        repository.rejectSave(0);
        await Promise.resolve();
      });

      expect(result.current.saveState).toBe("error");
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
        result.current.markDirty(createDraftWithTriggerAudience("旧工作流保存结果"));
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

  it("publishes through an async repository without replacing the controller draft input", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      const publishPromise = result.current.publishDraft(createDraftWithTriggerAudience("异步发布的人群"));
      await waitFor(() => {
        expect(repository.pendingPublishes).toHaveLength(1);
      });
      repository.resolvePublish(0);
      await publishPromise;
    });

    expect(result.current.publishState).toBe("published");
    expect(result.current.document.status).toBe("Published");
    expect(result.current.document.publishedRevision).toBe(2);
    expect(result.current.document.draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("近 30 天新入会且未首购客户");
    expect(result.current.document.publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("异步发布的人群");
  });

  it("marks publish as failed when the async repository publish rejects", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { result } = renderHook(() => useWorkflowDocument("newcomer-conversion", repository));

    await act(async () => {
      void result.current.publishDraft(createDraftWithTriggerAudience("发布失败的人群"));
    });

    await act(async () => {
      repository.rejectPublish(0);
      await Promise.resolve();
    });

    expect(result.current.publishState).toBe("error");
    expect(result.current.document.status).toBe("Draft");
  });

  it("imports through an async repository and ignores stale import results after switching workflows", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await act(async () => {
      void result.current.importDraft(createDraftWithTriggerAudience("旧工作流导入结果"));
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
    expect(repository.getDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("旧工作流导入结果");
  });

  it("keeps published snapshots cloned behind the repository boundary", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const publishedDocument = repository.publishDraft("newcomer-conversion", createDraftWithTriggerAudience("发布克隆的人群")).document;
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

  it("does not apply stale async publish results after switching workflow documents", async () => {
    const repository = createDeferredWorkflowDraftRepository();
    const { rerender, result } = renderHook(
      ({ workflowId }) => useWorkflowDocument(workflowId, repository),
      { initialProps: { workflowId: "newcomer-conversion" } },
    );

    await act(async () => {
      void result.current.publishDraft(createDraftWithTriggerAudience("旧工作流发布结果"));
    });

    expect(repository.pendingPublishes).toHaveLength(1);

    rerender({ workflowId: "vip-reactivation" });

    await act(async () => {
      repository.resolvePublish(0);
      await Promise.resolve();
    });

    expect(result.current.document.id).toBe("vip-reactivation");
    expect(result.current.document.publishedAt).toBe("昨天 21:04");
    expect(repository.getDocument("newcomer-conversion").publishedDraft?.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("旧工作流发布结果");
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
    expect(result.current.document.draft.nodes.find((node) => node.id === "trigger")?.data.audience)
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
    expect(repository.getDocument("vip-reactivation").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
      .toBe("90 天未复购会员");
  });
});

function createDraftWithTriggerAudience(audience: string): WorkflowDraft {
  return {
    ...createInitialDraft(),
    nodes: createInitialDraft().nodes.map((node) =>
      node.id === "trigger"
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
    workflowId: string | undefined;
  }> = [];
  const pendingPublishes: Array<{
    draft: WorkflowDraft;
    reject: (error: Error) => void;
    resolve: (document: PublishResult) => void;
    workflowId: string | undefined;
  }> = [];
  const pendingSaves: Array<{
    draft: WorkflowDraft;
    reject: (error: Error) => void;
    resolve: (document: SaveResult) => void;
    workflowId: string | undefined;
  }> = [];
  const pendingRestores: Array<{
    reject: (error: Error) => void;
    resolve: (document: RestoreResult) => void;
    versionId: string;
    workflowId: string | undefined;
  }> = [];

  const repository: WorkflowDraftRepository & {
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
    publishDraft: (workflowId, draft) => new Promise((resolve, reject) => {
      pendingPublishes.push({
        draft,
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
    reset: baseRepository.reset,
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

      pendingPublish.resolve(baseRepository.publishDraft(pendingPublish.workflowId, pendingPublish.draft));
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

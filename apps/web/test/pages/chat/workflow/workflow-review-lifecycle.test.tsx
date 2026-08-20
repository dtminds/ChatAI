import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInMemoryWorkflowDraftRepository,
  createWorkflowDraftHash,
  getWorkflowDocument,
  publishWorkflowDraft,
  resetWorkflowDocumentsForTest,
  useWorkflowDocument,
  WorkflowRepositoryError,
} from "@/pages/chat/workflow/workflow-draft-service";
import type { WorkflowDraft } from "@/pages/chat/workflow/types";

describe("workflow draft service", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
  });

  it("returns isolated document snapshots", () => {
    const first = getWorkflowDocument("vip-reactivation");
    const second = getWorkflowDocument("vip-reactivation");

    expect(first.draftHash).toBe(createWorkflowDraftHash(first.draft));
    expect(first.draft.nodes).not.toBe(second.draft.nodes);
    expect(first.versionHistory).not.toBe(second.versionHistory);
  });

  it("creates, saves, renames, and deletes documents through the repository", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const created = repository.createDocument({
      clientRequestId: "create-review-workflow",
      name: "审核流程",
      workflowType: "chatai_sop",
    });
    const changedDraft = renameStartNode(created.draft, "新的开始节点");

    repository.saveDraft(created.id, changedDraft);
    repository.updateDocumentMetadata(created.id, {
      description: "待审核的流程",
      name: "审核流程 v2",
    });

    expect(repository.getDocument(created.id)).toMatchObject({
      description: "待审核的流程",
      hasUnpublishedChanges: true,
      name: "审核流程 v2",
    });
    expect(repository.getDocument(created.id).draft.nodes[0]?.data.title).toBe("新的开始节点");

    repository.deleteDocument(created.id);
    expect(() => repository.getDocument(created.id)).toThrow(WorkflowRepositoryError);
  });

  it("freezes editing while a review is pending", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const document = repository.getDocument("newcomer-conversion");
    const submitted = repository.submitReview(document.id);

    expect(submitted.currentReview?.status).toBe("pending");
    expect(submitted.permissions.canEdit).toBe(false);
    expect(() => repository.saveDraft(document.id, renameStartNode(document.draft, "禁止修改")))
      .toThrow(expect.objectContaining({ apiCode: "WORKFLOW_REVIEW_LOCKED" }));
  });

  it("allows editing after approval without rewriting the historical decision", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const submitted = repository.submitReview("newcomer-conversion");
    const reviewId = submitted.currentReview!.id;
    const approved = repository.approveReview("newcomer-conversion", reviewId, "同意发布");

    expect(approved.currentReview).toMatchObject({
      reviewComment: "同意发布",
      status: "approved",
    });
    expect(approved.permissions).toMatchObject({ canEdit: true, canPublish: true });

    const editable = repository.saveDraft(
      "newcomer-conversion",
      renameStartNode(approved.draft, "审核后修改"),
    ).document;
    expect(editable.currentReview).toBeNull();
    expect(editable.permissions.canEdit).toBe(true);
    expect(repository.listReviews("newcomer-conversion").items).toEqual([
      expect.objectContaining({ id: reviewId, status: "approved" }),
    ]);
  });

  it("restores an approved review snapshot as the current publish candidate", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const submitted = repository.submitReview("newcomer-conversion");
    const reviewId = submitted.currentReview!.id;
    const approved = repository.approveReview("newcomer-conversion", reviewId);
    repository.saveDraft(
      approved.id,
      renameStartNode(approved.draft, "审核后修改"),
    );

    const restored = repository.restoreReview(approved.id, reviewId);

    expect(restored.currentReview).toMatchObject({ id: reviewId, status: "approved" });
    expect(restored.draft.nodes[0]?.data.title).toBe(approved.draft.nodes[0]?.data.title);
  });

  it("keeps an explicit rejected review while restoring edit access", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const submitted = repository.submitReview("newcomer-conversion");
    const rejected = repository.rejectReview(
      "newcomer-conversion",
      submitted.currentReview!.id,
      "进入条件需要调整",
    );

    expect(rejected.currentReview).toMatchObject({
      reviewComment: "进入条件需要调整",
      status: "rejected",
    });
    expect(rejected.permissions.canEdit).toBe(true);

    const resubmitted = repository.submitReview("newcomer-conversion");
    expect(resubmitted.currentReview?.status).toBe("pending");
    expect(repository.listReviews("newcomer-conversion").items).toHaveLength(2);
  });

  it("drops the rejected current state after the draft returns to published semantics", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const published = repository.getDocument("vip-reactivation");
    repository.saveDraft(published.id, renameStartNode(published.draft, "待修正版本"));
    const submitted = repository.submitReview(published.id);
    repository.rejectReview(published.id, submitted.currentReview!.id, "无需继续发布");

    const restored = repository.saveDraft(published.id, published.publishedDraft!).document;

    expect(restored.currentReview).toBeNull();
    expect(restored.hasUnpublishedChanges).toBe(false);
    expect(repository.listReviews(published.id).items).toEqual([
      expect.objectContaining({ status: "rejected" }),
    ]);
  });

  it("rejects review submission when a published workflow has no semantic changes", () => {
    const repository = createInMemoryWorkflowDraftRepository();

    expect(() => repository.submitReview("vip-reactivation")).toThrow(expect.objectContaining({
      apiCode: "WORKFLOW_NO_UNPUBLISHED_CHANGES",
    }));
  });

  it("publishes only an approved review and does not enable the workflow", () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const submitted = repository.submitReview("newcomer-conversion");
    const reviewId = submitted.currentReview!.id;

    expect(() => repository.publishReview("newcomer-conversion", reviewId))
      .toThrow(expect.objectContaining({ code: "conflict" }));

    repository.approveReview("newcomer-conversion", reviewId);
    const published = repository.publishReview("newcomer-conversion", reviewId);

    expect(published.publishedRevision).toBe(1);
    expect(published.document).toMatchObject({
      hasUnpublishedChanges: false,
      publishedRevision: 1,
      runtimeStatus: "inactive",
    });
    expect(published.document.versionHistory).toHaveLength(1);
  });

  it("keeps the synchronous publish fixture aligned with the review lifecycle", () => {
    const source = getWorkflowDocument("newcomer-conversion");
    const published = publishWorkflowDraft(
      source.id,
      renameStartNode(source.draft, "已审核版本"),
    );

    expect(published.publishedRevision).toBe(1);
    expect(published.runtimeStatus).toBe("inactive");
    expect(published.draft.nodes[0]?.data.title).toBe("已审核版本");
  });

  it("flushes the pending save before submitting a review", async () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const initial = repository.getDocument("newcomer-conversion");
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));

    act(() => {
      result.current.markDirty(renameStartNode(initial.draft, "提交前保存"));
    });
    await act(async () => {
      await result.current.submitReview();
    });

    await waitFor(() => expect(result.current.document.currentReview?.status).toBe("pending"));
    expect(repository.getDocument(initial.id).draft.nodes[0]?.data.title).toBe("提交前保存");
    expect(result.current.saveState).toBe("saved");
  });

  it("does not submit a review when the required draft save fails", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const initial = baseRepository.getDocument("newcomer-conversion");
    const submitReview = vi.fn(baseRepository.submitReview);
    const repository = {
      ...baseRepository,
      saveDraft: vi.fn(async () => { throw new Error("save failed"); }),
      submitReview,
    };
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));

    act(() => {
      result.current.markDirty(renameStartNode(initial.draft, "保存失败版本"));
    });
    await act(async () => {
      await expect(result.current.submitReview()).rejects.toMatchObject({ code: "server" });
    });

    expect(submitReview).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe("error");
  });

  it("keeps an approved review after publication fails", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const initial = baseRepository.getDocument("newcomer-conversion");
    const repository = {
      ...baseRepository,
      publishReview: vi.fn(async () => { throw new Error("publish failed"); }),
    };
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));

    await act(async () => {
      await result.current.submitReview();
    });
    const reviewId = result.current.document.currentReview!.id;
    await act(async () => {
      await result.current.approveReview(reviewId);
      await expect(result.current.publishReview(reviewId)).rejects.toMatchObject({ code: "server" });
    });

    expect(result.current.document.currentReview?.status).toBe("approved");
    expect(result.current.publishState).toBe("error");
  });

  it("removes approval from the current draft on edit without changing its history", async () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const initial = repository.getDocument("newcomer-conversion");
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));

    await act(async () => {
      await result.current.submitReview();
    });
    const firstReviewId = result.current.document.currentReview!.id;
    await act(async () => {
      await result.current.approveReview(firstReviewId, "通过");
    });
    expect(result.current.document.currentReview?.status).toBe("approved");

    act(() => {
      result.current.markDirty(renameStartNode(result.current.document.draft, "审核后修改"));
    });
    expect(result.current.document.currentReview).toBeNull();
    await act(async () => {
      await result.current.submitReview();
    });
    const secondReviewId = result.current.document.currentReview!.id;
    expect(secondReviewId).not.toBe(firstReviewId);
    expect(repository.listReviews(initial.id).items).toEqual([
      expect.objectContaining({ id: secondReviewId, status: "pending" }),
      expect.objectContaining({ id: firstReviewId, status: "approved" }),
    ]);
    await act(async () => {
      await result.current.approveReview(secondReviewId);
      await result.current.publishReview(secondReviewId);
    });

    expect(result.current.document.publishedRevision).toBe(1);
    expect(result.current.publishState).toBe("published");
  });

  it("accepts the saved document when the server invalidates the current review", async () => {
    const baseRepository = createInMemoryWorkflowDraftRepository();
    const initial = baseRepository.getDocument("newcomer-conversion");
    const submitted = baseRepository.submitReview(initial.id);
    const approved = baseRepository.approveReview(initial.id, submitted.currentReview!.id);
    const repository = {
      ...baseRepository,
      saveDraft: vi.fn((workflowId: string, draft: WorkflowDraft) => {
        const saved = baseRepository.saveDraft(workflowId, draft);
        return {
          ...saved,
          document: {
            ...saved.document,
            currentReview: null,
          },
        };
      }),
    };
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, approved));
    const draftWithChangedEdgeMetadata = {
      ...approved.draft,
      edges: approved.draft.edges.map((edge, index) => index === 0
        ? { ...edge, data: { ...edge.data, label: "changed" } }
        : edge),
    };

    act(() => {
      result.current.markDirty(draftWithChangedEdgeMetadata);
    });
    await waitFor(() => expect(result.current.saveState).toBe("saved"));

    expect(result.current.document.currentReview).toBeNull();
  });

  it("keeps approval current for layout-only edits", async () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const initial = repository.getDocument("newcomer-conversion");
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));
    await act(async () => {
      await result.current.submitReview();
    });
    const reviewId = result.current.document.currentReview!.id;
    await act(async () => {
      await result.current.approveReview(reviewId);
    });

    act(() => {
      result.current.markDirty({
        ...result.current.document.draft,
        viewport: { x: 120, y: 80, zoom: 0.9 },
      });
    });

    expect(result.current.document.currentReview).toMatchObject({ id: reviewId, status: "approved" });
  });

  it("reactivates approval after a saved semantic edit is reverted", async () => {
    const repository = createInMemoryWorkflowDraftRepository();
    const initial = repository.getDocument("newcomer-conversion");
    const { result } = renderHook(() => useWorkflowDocument(initial.id, repository, initial));
    await act(async () => {
      await result.current.submitReview();
    });
    const reviewId = result.current.document.currentReview!.id;
    await act(async () => {
      await result.current.approveReview(reviewId);
    });
    const approvedDraft = result.current.document.draft;

    act(() => {
      result.current.markDirty(renameStartNode(approvedDraft, "审核后修改"));
    });
    await waitFor(() => expect(result.current.saveState).toBe("saved"));
    expect(result.current.document.currentReview).toBeNull();

    act(() => {
      result.current.markDirty(approvedDraft);
    });
    await waitFor(() => expect(result.current.document.currentReview).toMatchObject({
      id: reviewId,
      status: "approved",
    }));
  });
});

function renameStartNode(draft: WorkflowDraft, title: string): WorkflowDraft {
  return {
    ...draft,
    nodes: draft.nodes.map(node => node.data.kind === "start"
      ? { ...node, data: { ...node.data, title } }
      : node),
  };
}

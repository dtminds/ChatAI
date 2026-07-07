import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWorkflowDocument,
  getWorkflowName,
  listWorkflowDocuments,
  resetWorkflowDocumentsForTest,
  saveWorkflowDraft,
  useWorkflowDocument,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";
import { createInitialEdges, createInitialNodes } from "@/pages/chat/ai-hosting/workflow/graph";

describe("workflow draft service", () => {
  beforeEach(() => {
    resetWorkflowDocumentsForTest();
  });

  it("returns cloned workflow documents by route id", () => {
    const document = getWorkflowDocument("vip-reactivation");
    const clonedDocument = getWorkflowDocument("vip-reactivation");

    expect(document.name).toBe("会员复购唤醒");
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
        edges: createInitialEdges(),
        nodes: createInitialNodes().map((node) =>
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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.document.updatedAt).toBe("刚刚");
      expect(getWorkflowDocument("newcomer-conversion").draft.nodes.find((node) => node.id === "trigger")?.data.audience)
        .toBe("已保存的人群");
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
        edges: createInitialEdges(),
        nodes: createInitialNodes().map((node) =>
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
        edges: createInitialEdges(),
        nodes: createInitialNodes().map((node) =>
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
    const draft = {
      edges: createInitialEdges(),
      nodes: createInitialNodes().map((node) =>
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
    expect(getWorkflowDocument("live-follow-up").draft.nodes.find((node) => node.id === "action-message")?.data.title)
      .toBe("已持久化动作");
  });
});

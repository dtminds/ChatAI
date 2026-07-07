import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getWorkflowDocument,
  getWorkflowName,
  listWorkflowDocuments,
  useWorkflowDocument,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-service";

describe("workflow draft service", () => {
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

      act(() => {
        result.current.markDirty();
      });
      expect(result.current.saveState).toBe("saving");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(result.current.saveState).toBe("saved");
      expect(result.current.document.updatedAt).toBe("刚刚");
    }
    finally {
      vi.useRealTimers();
    }
  });
});

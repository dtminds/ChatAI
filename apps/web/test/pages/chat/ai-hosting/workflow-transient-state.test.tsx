import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkflowTransientState } from "@/pages/chat/ai-hosting/workflow/use-workflow-transient-state";

describe("useWorkflowTransientState", () => {
  it("keeps edge and node insert menus mutually exclusive", () => {
    const { result } = renderHook(() => useWorkflowTransientState());

    act(() => {
      result.current.toggleNodeInsertMenu("node-1", "branch-high");
    });

    expect(result.current.quickInsertTarget).toEqual({
      nodeId: "node-1",
      sourceHandle: "branch-high",
    });
    expect(result.current.activeEdgeInsertMenuId).toBeNull();

    act(() => {
      result.current.toggleEdgeInsertMenu("edge-1");
    });

    expect(result.current.quickInsertTarget).toBeNull();
    expect(result.current.activeEdgeInsertMenuId).toBe("edge-1");

    act(() => {
      result.current.closeCanvasMenus();
    });

    expect(result.current.quickInsertTarget).toBeNull();
    expect(result.current.activeEdgeInsertMenuId).toBeNull();
  });
});

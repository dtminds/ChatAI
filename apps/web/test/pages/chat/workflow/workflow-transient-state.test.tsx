import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useWorkflowTransientState } from "@/pages/chat/workflow/use-workflow-transient-state";

describe("useWorkflowTransientState", () => {
  it("keeps edge and node insert menus mutually exclusive", () => {
    const { result } = renderHook(() => useWorkflowTransientState());

    act(() => {
      result.current.setPaletteOpen(true);
    });
    expect(result.current.paletteOpen).toBe(true);

    act(() => {
      result.current.toggleNodeInsertMenu("node-1", "branch-high");
    });

    expect(result.current.paletteOpen).toBe(false);
    expect(result.current.quickInsertTarget).toEqual({
      nodeId: "node-1",
      sourceHandle: "branch-high",
    });
    expect(result.current.activeEdgeInsertMenuId).toBeNull();

    act(() => {
      result.current.setPaletteOpen(true);
    });
    expect(result.current.paletteOpen).toBe(true);

    act(() => {
      result.current.toggleEdgeInsertMenu("edge-1");
    });

    expect(result.current.paletteOpen).toBe(false);
    expect(result.current.quickInsertTarget).toBeNull();
    expect(result.current.activeEdgeInsertMenuId).toBe("edge-1");

    act(() => {
      result.current.toggleEdgeInsertMenu("edge-1", false);
      result.current.toggleEdgeInsertMenu("edge-1", false);
    });
    expect(result.current.activeEdgeInsertMenuId).toBeNull();

    act(() => {
      result.current.toggleEdgeInsertMenu("edge-1", true);
    });
    expect(result.current.activeEdgeInsertMenuId).toBe("edge-1");

    act(() => {
      result.current.closeCanvasMenus();
    });

    expect(result.current.quickInsertTarget).toBeNull();
    expect(result.current.activeEdgeInsertMenuId).toBeNull();
  });

  it("closes all canvas overlays together", () => {
    const { result } = renderHook(() => useWorkflowTransientState());

    act(() => {
      result.current.setPaletteOpen(true);
      result.current.toggleNodeInsertMenu("node-1");
      result.current.setPaletteOpen(true);
    });

    expect(result.current.paletteOpen).toBe(true);
    expect(result.current.quickInsertTarget).toEqual({ nodeId: "node-1" });

    act(() => {
      result.current.closeCanvasOverlays();
    });

    expect(result.current.paletteOpen).toBe(false);
    expect(result.current.quickInsertTarget).toBeNull();
    expect(result.current.activeEdgeInsertMenuId).toBeNull();
  });
});

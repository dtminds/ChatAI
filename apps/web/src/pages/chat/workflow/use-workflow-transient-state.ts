import { useCallback, useState } from "react";
import type { QuickInsertTarget } from "./types";

export function useWorkflowTransientState() {
  const [activeEdgeInsertMenuId, setActiveEdgeInsertMenuId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickInsertTarget, setQuickInsertTarget] = useState<QuickInsertTarget | null>(null);

  const closeCanvasMenus = useCallback(() => {
    setActiveEdgeInsertMenuId(null);
    setQuickInsertTarget(null);
  }, []);

  const closeCanvasOverlays = useCallback(() => {
    setActiveEdgeInsertMenuId(null);
    setPaletteOpen(false);
    setQuickInsertTarget(null);
  }, []);

  const toggleEdgeInsertMenu = useCallback((edgeId: string, open?: boolean) => {
    setPaletteOpen(false);
    setQuickInsertTarget(null);
    setActiveEdgeInsertMenuId((currentEdgeId) => {
      if (open === false) return currentEdgeId === edgeId ? null : currentEdgeId;
      if (open === true) return edgeId;
      return currentEdgeId === edgeId ? null : edgeId;
    });
  }, []);

  const toggleNodeInsertMenu = useCallback((nodeId: string, sourceHandle?: string) => {
    setActiveEdgeInsertMenuId(null);
    setPaletteOpen(false);
    setQuickInsertTarget((currentTarget) =>
      currentTarget?.nodeId === nodeId && currentTarget.sourceHandle === sourceHandle
        ? null
        : { nodeId, sourceHandle },
    );
  }, []);

  return {
    activeEdgeInsertMenuId,
    closeCanvasMenus,
    closeCanvasOverlays,
    paletteOpen,
    quickInsertTarget,
    setPaletteOpen,
    toggleEdgeInsertMenu,
    toggleNodeInsertMenu,
  };
}

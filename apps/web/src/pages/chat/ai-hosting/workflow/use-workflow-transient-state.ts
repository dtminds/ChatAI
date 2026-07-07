import { useCallback, useState } from "react";
import type { QuickInsertTarget } from "./types";

export function useWorkflowTransientState() {
  const [activeEdgeInsertMenuId, setActiveEdgeInsertMenuId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [quickInsertTarget, setQuickInsertTarget] = useState<QuickInsertTarget | null>(null);

  const closeCanvasMenus = useCallback(() => {
    setActiveEdgeInsertMenuId(null);
    setQuickInsertTarget(null);
  }, []);

  const toggleEdgeInsertMenu = useCallback((edgeId: string) => {
    setQuickInsertTarget(null);
    setActiveEdgeInsertMenuId((currentEdgeId) => (currentEdgeId === edgeId ? null : edgeId));
  }, []);

  const toggleNodeInsertMenu = useCallback((nodeId: string, sourceHandle?: string) => {
    setActiveEdgeInsertMenuId(null);
    setQuickInsertTarget((currentTarget) =>
      currentTarget?.nodeId === nodeId && currentTarget.sourceHandle === sourceHandle
        ? null
        : { nodeId, sourceHandle },
    );
  }, []);

  return {
    activeEdgeInsertMenuId,
    closeCanvasMenus,
    paletteOpen,
    paletteQuery,
    quickInsertTarget,
    setPaletteOpen,
    setPaletteQuery,
    toggleEdgeInsertMenu,
    toggleNodeInsertMenu,
  };
}

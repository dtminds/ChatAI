import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaterialCollectionItem } from "@/pages/chat/components/material-collection/material-types";

export function useNullableMaterialSelection(items: MaterialCollectionItem[]) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId),
    [items, selectedItemId],
  );

  useEffect(() => {
    if (selectedItemId && !items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [items, selectedItemId]);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemId((current) => (current === itemId ? null : itemId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  return {
    clearSelection,
    selectedItem,
    selectedItemId,
    toggleItemSelection,
  };
}

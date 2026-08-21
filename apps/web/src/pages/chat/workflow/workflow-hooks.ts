import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export function useWorkflowStableCallback<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

export function useWorkflowDismissableLayer<TElement extends HTMLElement>({
  enabled,
  onDismiss,
}: {
  enabled: boolean;
  onDismiss: () => void;
}): RefObject<TElement | null> {
  const layerRef = useRef<TElement>(null);
  const handleDismiss = useWorkflowStableCallback(onDismiss);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (layerRef.current?.contains(event.target as Node)) {
        return;
      }

      handleDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleDismiss();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, handleDismiss]);

  return layerRef;
}

import { useEffect } from "react";
import { matchesWorkflowShortcut } from "./workflow-shortcut-definitions";

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

export function useWorkflowShortcuts({
  canDeleteSelection,
  canRedo,
  canUndo,
  onDeleteSelection,
  onRedo,
  onUndo,
}: {
  canDeleteSelection: boolean;
  canRedo: boolean;
  canUndo: boolean;
  onDeleteSelection: () => void;
  onRedo: () => void;
  onUndo: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }

      if (canDeleteSelection && matchesWorkflowShortcut(event, "workflow.delete")) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteSelection();
        return;
      }

      if (canUndo && matchesWorkflowShortcut(event, "workflow.undo")) {
        event.preventDefault();
        event.stopPropagation();
        onUndo();

        return;
      }

      if (canRedo && matchesWorkflowShortcut(event, "workflow.redo")) {
        event.preventDefault();
        event.stopPropagation();
        onRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    canDeleteSelection,
    canRedo,
    canUndo,
    onDeleteSelection,
    onRedo,
    onUndo,
  ]);
}

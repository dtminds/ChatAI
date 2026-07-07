import { useEffect } from "react";

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}

function isUndoShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && !event.shiftKey
    && event.key.toLowerCase() === "z";
}

function isRedoShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey)) {
    return false;
  }

  return event.key.toLowerCase() === "y"
    || (event.shiftKey && event.key.toLowerCase() === "z");
}

function isDeleteShortcut(event: KeyboardEvent) {
  return !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && (event.key === "Delete" || event.key === "Backspace");
}

function isDuplicateShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === "d";
}

export function useWorkflowShortcuts({
  canRedo,
  canUndo,
  onDeleteSelection,
  onDuplicateSelection,
  onRedo,
  onUndo,
}: {
  canRedo: boolean;
  canUndo: boolean;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onRedo: () => void;
  onUndo: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) {
        return;
      }

      if (isDeleteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteSelection();
        return;
      }

      if (isDuplicateShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        onDuplicateSelection();
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        if (canUndo) {
          onUndo();
        }

        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();

        if (canRedo) {
          onRedo();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canRedo, canUndo, onDeleteSelection, onDuplicateSelection, onRedo, onUndo]);
}

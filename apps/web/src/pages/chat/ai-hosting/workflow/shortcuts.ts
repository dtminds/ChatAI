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

function isCopyShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === "c";
}

function isPasteShortcut(event: KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && event.key.toLowerCase() === "v";
}

export function useWorkflowShortcuts({
  canRedo,
  canUndo,
  onCopySelection,
  onDeleteSelection,
  onDuplicateSelection,
  onPasteClipboard,
  onRedo,
  onUndo,
}: {
  canRedo: boolean;
  canUndo: boolean;
  onCopySelection: () => boolean;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onPasteClipboard: () => boolean;
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

      if (isCopyShortcut(event)) {
        if (onCopySelection()) {
          event.preventDefault();
          event.stopPropagation();
        }

        return;
      }

      if (isPasteShortcut(event)) {
        if (onPasteClipboard()) {
          event.preventDefault();
          event.stopPropagation();
        }

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
  }, [
    canRedo,
    canUndo,
    onCopySelection,
    onDeleteSelection,
    onDuplicateSelection,
    onPasteClipboard,
    onRedo,
    onUndo,
  ]);
}

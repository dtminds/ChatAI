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

function hasActiveDocumentTextSelection() {
  const selection = document.getSelection();

  return Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0);
}

export function useWorkflowShortcuts({
  canCopySelection,
  canDeleteSelection,
  canDuplicateSelection,
  canPasteClipboard,
  canRedo,
  canUndo,
  onCopySelection,
  onDeleteSelection,
  onDuplicateSelection,
  onPasteClipboard,
  onRedo,
  onUndo,
}: {
  canCopySelection: boolean;
  canDeleteSelection: boolean;
  canDuplicateSelection: boolean;
  canPasteClipboard: boolean;
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

      if (canDeleteSelection && matchesWorkflowShortcut(event, "workflow.delete")) {
        event.preventDefault();
        event.stopPropagation();
        onDeleteSelection();
        return;
      }

      if (canDuplicateSelection && matchesWorkflowShortcut(event, "workflow.duplicate")) {
        event.preventDefault();
        event.stopPropagation();
        onDuplicateSelection();
        return;
      }

      if (canCopySelection && matchesWorkflowShortcut(event, "workflow.copy")) {
        if (hasActiveDocumentTextSelection()) {
          return;
        }

        if (onCopySelection()) {
          event.preventDefault();
          event.stopPropagation();
        }

        return;
      }

      if (canPasteClipboard && matchesWorkflowShortcut(event, "workflow.paste")) {
        if (onPasteClipboard()) {
          event.preventDefault();
          event.stopPropagation();
        }

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
    canCopySelection,
    canDeleteSelection,
    canDuplicateSelection,
    canPasteClipboard,
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

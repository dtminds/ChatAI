import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkflowShortcuts } from "@/pages/chat/ai-hosting/workflow/shortcuts";

function renderWorkflowShortcuts(overrides: Partial<Parameters<typeof useWorkflowShortcuts>[0]> = {}) {
  const handlers = {
    canDeleteSelection: true,
    canRedo: true,
    canUndo: true,
    onDeleteSelection: vi.fn(),
    onRedo: vi.fn(),
    onUndo: vi.fn(),
    ...overrides,
  };

  renderHook(() => useWorkflowShortcuts(handlers));
  return handlers;
}

function dispatchShortcut(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    cancelable: true,
    ctrlKey: true,
    key,
    ...init,
  });

  window.dispatchEvent(event);
  return event;
}

describe("useWorkflowShortcuts", () => {
  it("handles delete, undo, and redo shortcuts", () => {
    const handlers = renderWorkflowShortcuts();

    const deleteEvent = dispatchShortcut("Backspace", { ctrlKey: false });
    const undoEvent = dispatchShortcut("z");
    const redoEvent = dispatchShortcut("y");

    expect(handlers.onDeleteSelection).toHaveBeenCalledTimes(1);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
    expect(handlers.onRedo).toHaveBeenCalledTimes(1);
    expect(deleteEvent.defaultPrevented).toBe(true);
    expect(undoEvent.defaultPrevented).toBe(true);
    expect(redoEvent.defaultPrevented).toBe(true);
  });

  it("keeps editable targets outside workflow shortcut handling", () => {
    const handlers = renderWorkflowShortcuts();
    const input = document.createElement("input");
    document.body.append(input);

    try {
      const event = new KeyboardEvent("keydown", {
        cancelable: true,
        ctrlKey: true,
        key: "z",
      });
      input.dispatchEvent(event);

      expect(handlers.onUndo).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
    finally {
      input.remove();
    }
  });

  it("does not swallow disabled workflow shortcuts", () => {
    const handlers = renderWorkflowShortcuts({
      canDeleteSelection: false,
      canRedo: false,
      canUndo: false,
    });

    const deleteEvent = dispatchShortcut("Backspace", { ctrlKey: false });
    const undoEvent = dispatchShortcut("z");
    const redoEvent = dispatchShortcut("y");

    expect(handlers.onDeleteSelection).not.toHaveBeenCalled();
    expect(handlers.onUndo).not.toHaveBeenCalled();
    expect(handlers.onRedo).not.toHaveBeenCalled();
    expect(deleteEvent.defaultPrevented).toBe(false);
    expect(undoEvent.defaultPrevented).toBe(false);
    expect(redoEvent.defaultPrevented).toBe(false);
  });
});

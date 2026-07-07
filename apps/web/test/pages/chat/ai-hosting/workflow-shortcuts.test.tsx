import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkflowShortcuts } from "@/pages/chat/ai-hosting/workflow/shortcuts";

function renderWorkflowShortcuts(overrides: Partial<Parameters<typeof useWorkflowShortcuts>[0]> = {}) {
  const handlers = {
    canRedo: true,
    canUndo: true,
    onCopySelection: vi.fn(() => true),
    onDeleteSelection: vi.fn(),
    onDuplicateSelection: vi.fn(),
    onPasteClipboard: vi.fn(() => true),
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

function selectDocumentText() {
  const host = document.createElement("div");
  host.textContent = "selected workflow text";
  document.body.append(host);

  const range = document.createRange();
  range.selectNodeContents(host);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);

  return () => {
    document.getSelection()?.removeAllRanges();
    host.remove();
  };
}

describe("useWorkflowShortcuts", () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
  });

  it("does not steal browser copy when document text is selected", () => {
    const clearSelection = selectDocumentText();
    const handlers = renderWorkflowShortcuts();

    try {
      const event = dispatchShortcut("c");

      expect(handlers.onCopySelection).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
    finally {
      clearSelection();
    }
  });

  it("handles workflow copy when there is no active text selection", () => {
    const handlers = renderWorkflowShortcuts();
    const event = dispatchShortcut("c");

    expect(handlers.onCopySelection).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
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
});

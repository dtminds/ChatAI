import { describe, expect, it } from "vitest";
import {
  getWorkflowShortcutDisplayHotkey,
  matchesWorkflowShortcut,
  WORKFLOW_SHORTCUTS,
} from "@/pages/chat/workflow/workflow-shortcut-definitions";

function createKeyEvent(key: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", {
    key,
    ...init,
  });
}

describe("workflow shortcut definitions", () => {
  it("keeps workflow shortcut metadata centralized and displayable", () => {
    expect(Object.keys(WORKFLOW_SHORTCUTS)).toEqual([
      "workflow.delete",
      "workflow.redo",
      "workflow.undo",
    ]);
    expect(getWorkflowShortcutDisplayHotkey("workflow.delete")).toBe("Delete");
    expect(getWorkflowShortcutDisplayHotkey("workflow.redo")).toBe("Mod+Y");
  });

  it("matches modifier-aware workflow hotkeys", () => {
    expect(matchesWorkflowShortcut(
      createKeyEvent("z", { ctrlKey: true }),
      "workflow.undo",
    )).toBe(true);
    expect(matchesWorkflowShortcut(createKeyEvent("z"), "workflow.undo")).toBe(false);
  });

  it("matches delete and redo shortcut variants strictly", () => {
    expect(matchesWorkflowShortcut(createKeyEvent("Delete"), "workflow.delete")).toBe(true);
    expect(matchesWorkflowShortcut(createKeyEvent("Backspace"), "workflow.delete")).toBe(true);
    expect(matchesWorkflowShortcut(
      createKeyEvent("Backspace", { ctrlKey: true }),
      "workflow.delete",
    )).toBe(false);

    expect(matchesWorkflowShortcut(createKeyEvent("y", { ctrlKey: true }), "workflow.redo")).toBe(true);
    expect(matchesWorkflowShortcut(
      createKeyEvent("z", { ctrlKey: true, shiftKey: true }),
      "workflow.redo",
    )).toBe(true);
    expect(matchesWorkflowShortcut(createKeyEvent("z", { ctrlKey: true }), "workflow.redo")).toBe(false);
  });
});

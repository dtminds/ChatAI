// @vitest-environment jsdom

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

  it.each([
    { id: "workflow.undo" as const, init: { ctrlKey: true }, key: "z", matches: true },
    { id: "workflow.undo" as const, init: {}, key: "z", matches: false },
    { id: "workflow.delete" as const, init: {}, key: "Delete", matches: true },
    { id: "workflow.delete" as const, init: {}, key: "Backspace", matches: true },
    { id: "workflow.delete" as const, init: { ctrlKey: true }, key: "Backspace", matches: false },
    { id: "workflow.redo" as const, init: { ctrlKey: true }, key: "y", matches: true },
    { id: "workflow.redo" as const, init: { ctrlKey: true, shiftKey: true }, key: "z", matches: true },
    { id: "workflow.redo" as const, init: { ctrlKey: true }, key: "z", matches: false },
  ])("matches $id for $key", ({ id, init, key, matches }) => {
    expect(matchesWorkflowShortcut(createKeyEvent(key, init), id)).toBe(matches);
  });
});

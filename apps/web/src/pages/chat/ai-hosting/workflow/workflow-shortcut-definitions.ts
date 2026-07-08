export type WorkflowShortcutId =
  | "workflow.copy"
  | "workflow.delete"
  | "workflow.duplicate"
  | "workflow.paste"
  | "workflow.redo"
  | "workflow.undo";

export type WorkflowShortcutDefinition = {
  description: string;
  displayHotkey?: string;
  hotkeys: readonly string[];
  id: WorkflowShortcutId;
  name: string;
};

export const WORKFLOW_SHORTCUTS: Record<WorkflowShortcutId, WorkflowShortcutDefinition> = {
  "workflow.copy": {
    description: "复制选中的节点",
    hotkeys: ["Mod+C"],
    id: "workflow.copy",
    name: "复制",
  },
  "workflow.delete": {
    description: "删除选中的节点或边",
    displayHotkey: "Delete",
    hotkeys: ["Delete", "Backspace"],
    id: "workflow.delete",
    name: "删除",
  },
  "workflow.duplicate": {
    description: "复制并插入当前选中的节点",
    hotkeys: ["Mod+D"],
    id: "workflow.duplicate",
    name: "创建副本",
  },
  "workflow.paste": {
    description: "粘贴已复制的节点",
    hotkeys: ["Mod+V"],
    id: "workflow.paste",
    name: "粘贴",
  },
  "workflow.redo": {
    description: "恢复下一个画布改动",
    displayHotkey: "Mod+Y",
    hotkeys: ["Mod+Y", "Mod+Shift+Z"],
    id: "workflow.redo",
    name: "重做",
  },
  "workflow.undo": {
    description: "撤销上一个画布改动",
    hotkeys: ["Mod+Z"],
    id: "workflow.undo",
    name: "撤销",
  },
};

export function getWorkflowShortcutDisplayHotkey(id: WorkflowShortcutId) {
  const shortcut = WORKFLOW_SHORTCUTS[id];

  return shortcut.displayHotkey ?? shortcut.hotkeys[0];
}

export function matchesWorkflowShortcut(event: KeyboardEvent, id: WorkflowShortcutId) {
  return WORKFLOW_SHORTCUTS[id].hotkeys.some((hotkey) =>
    matchesWorkflowHotkey(event, hotkey),
  );
}

function matchesWorkflowHotkey(event: KeyboardEvent, hotkey: string) {
  const binding = parseWorkflowHotkey(hotkey);
  const keyMatches = event.key.toLowerCase() === binding.key.toLowerCase();
  const modMatches = binding.mod
    ? event.metaKey || event.ctrlKey
    : !event.metaKey && !event.ctrlKey;
  const altMatches = event.altKey === binding.alt;
  const shiftMatches = event.shiftKey === binding.shift;

  return keyMatches && modMatches && altMatches && shiftMatches;
}

function parseWorkflowHotkey(hotkey: string) {
  const parts = hotkey.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));

  return {
    alt: modifiers.has("alt"),
    key,
    mod: modifiers.has("mod"),
    shift: modifiers.has("shift"),
  };
}

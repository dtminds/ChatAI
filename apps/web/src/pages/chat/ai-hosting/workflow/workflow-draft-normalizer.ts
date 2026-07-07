import type {
  WorkflowEdge,
  WorkflowEdgeData,
  WorkflowDraft,
  WorkflowNode,
  WorkflowNodeData,
} from "./types";

export function sanitizeDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    edges: draft.edges.map(sanitizeEdgeForDraft),
    nodes: draft.nodes.map(sanitizeNodeForDraft),
  };
}

export function isWorkflowDraftEqual(firstDraft: WorkflowDraft, secondDraft: WorkflowDraft) {
  if (firstDraft.nodes.length !== secondDraft.nodes.length || firstDraft.edges.length !== secondDraft.edges.length) {
    return false;
  }

  return JSON.stringify(firstDraft) === JSON.stringify(secondDraft);
}

function sanitizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  const {
    insertMenuOpen: _insertMenuOpen,
    insertMenuSourceHandle: _insertMenuSourceHandle,
    onDelete: _onDelete,
    onDuplicate: _onDuplicate,
    onInsertAfter: _onInsertAfter,
    onSelect: _onSelect,
    onToggleInsertMenu: _onToggleInsertMenu,
    selected: _selected,
    ...persistableData
  } = data;

  return persistableData;
}

function sanitizeNodeForDraft(node: WorkflowNode): WorkflowNode {
  return {
    ...node,
    selected: false,
    zIndex: undefined,
    data: sanitizeNodeData(node.data),
  };
}

function sanitizeEdgeData(data: WorkflowEdgeData | undefined): WorkflowEdgeData | undefined {
  if (!data) {
    return data;
  }

  const {
    highlightState: _highlightState,
    insertMenuOpen: _insertMenuOpen,
    onInsertBetween: _onInsertBetween,
    onToggleInsertMenu: _onToggleInsertMenu,
    ...persistableData
  } = data;

  return persistableData;
}

function sanitizeEdgeForDraft(edge: WorkflowEdge): WorkflowEdge {
  return {
    ...edge,
    selected: false,
    data: sanitizeEdgeData(edge.data),
  };
}

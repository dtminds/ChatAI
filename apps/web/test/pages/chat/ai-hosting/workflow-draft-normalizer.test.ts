import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/ai-hosting/workflow/constants";
import {
  isWorkflowDraftEqual,
  sanitizeDraft,
} from "@/pages/chat/ai-hosting/workflow/workflow-draft-normalizer";
import type {
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/ai-hosting/workflow/types";

function createRuntimeDraft(index = 0): WorkflowDraft {
  const node: WorkflowNode = {
    data: {
      insertMenuOpen: true,
      kind: "action",
      label: "营销动作",
      metric: "已发送",
      onDelete: vi.fn(),
      onDuplicate: vi.fn(),
      onInsertAfter: vi.fn(),
      onSelect: vi.fn(),
      onToggleInsertMenu: vi.fn(),
      selected: true,
      status: "ready",
      summary: "发送消息",
      title: `发送消息 ${index}`,
    },
    id: "action-message",
    position: { x: index, y: 0 },
    selected: true,
    type: WORKFLOW_NODE_TYPE,
    zIndex: 20,
  };
  const edge: WorkflowEdge = {
    data: {
      highlightState: "connected",
      insertMenuOpen: true,
      label: "高意向",
      onInsertBetween: vi.fn(),
      onToggleInsertMenu: vi.fn(),
    },
    id: "edge-1",
    selected: true,
    source: "action-message",
    target: "goal",
    type: WORKFLOW_EDGE_TYPE,
  };

  return {
    edges: [edge],
    nodes: [node],
  };
}

describe("workflow draft normalizer", () => {
  it("removes runtime-only node and edge state from persistable drafts", () => {
    const sanitizedDraft = sanitizeDraft(createRuntimeDraft());

    expect(sanitizedDraft.nodes[0].selected).toBe(false);
    expect(sanitizedDraft.nodes[0].zIndex).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.selected).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onDelete).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onDuplicate).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onInsertAfter).toBeUndefined();
    expect(sanitizedDraft.nodes[0].data.onToggleInsertMenu).toBeUndefined();
    expect(sanitizedDraft.edges[0].selected).toBe(false);
    expect(sanitizedDraft.edges[0].data?.highlightState).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.insertMenuOpen).toBeUndefined();
    expect(sanitizedDraft.edges[0].data?.onInsertBetween).toBeUndefined();
  });

  it("compares normalized workflow draft snapshots by graph content", () => {
    expect(isWorkflowDraftEqual(sanitizeDraft(createRuntimeDraft()), sanitizeDraft(createRuntimeDraft()))).toBe(true);
    expect(isWorkflowDraftEqual(sanitizeDraft(createRuntimeDraft()), sanitizeDraft(createRuntimeDraft(10)))).toBe(false);
  });
});

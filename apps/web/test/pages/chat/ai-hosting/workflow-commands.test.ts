import { describe, expect, it } from "vitest";
import { createWorkflowClipboardData } from "@/pages/chat/ai-hosting/workflow/workflow-clipboard";
import { getWorkflowConnectionPolicyViolation } from "@/pages/chat/ai-hosting/workflow/connection-policy";
import { runWorkflowGraphCommand } from "@/pages/chat/ai-hosting/workflow/workflow-commands";
import {
  createEdge,
  createInitialDraft,
} from "@/pages/chat/ai-hosting/workflow/graph";
import type { WorkflowGraphCommand } from "@/pages/chat/ai-hosting/workflow/workflow-commands";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(): WorkflowDraft {
  return createInitialDraft();
}

describe("workflow graph commands", () => {
  it("maps user graph intents to undoable operations with generated ids", () => {
    const addOperation = runWorkflowGraphCommand(createDraft(), {
      kind: "ai",
      type: "add-node",
    });

    expect(addOperation?.event).toBe("node:add");
    expect(addOperation?.result?.nodeId).toMatch(/^ai-/);

    const duplicateOperation = runWorkflowGraphCommand(createDraft(), {
      nodeId: "action-message",
      type: "duplicate-node",
    });

    expect(duplicateOperation?.event).toBe("node:duplicate");
    expect(duplicateOperation?.result?.nodeId).toMatch(/^action-/);
    expect(duplicateOperation?.draft.nodes.find((node) => node.id === duplicateOperation.result?.nodeId)?.data.title)
      .toBe("发送欢迎消息 (1)");
  });

  it("keeps invalid commands from creating history operations", () => {
    expect(runWorkflowGraphCommand(createDraft(), {
      nodeId: "missing",
      type: "duplicate-node",
    })).toBeUndefined();

    expect(runWorkflowGraphCommand(createDraft(), {
      kind: "trigger",
      type: "add-node",
    })).toBeUndefined();
  });

  it("returns canonical drafts for every structural command boundary", () => {
    const draft = createDirtyDraftForCommandBoundary();
    const commands: WorkflowGraphCommand[] = [
      {
        kind: "ai",
        type: "add-node",
      },
      {
        kind: "wait",
        previousNodeId: "branch-intent",
        sourceHandle: "branch-high",
        type: "insert-node-after",
      },
      {
        edgeId: "edge-branch-intent-branch-high-action-message",
        kind: "ai",
        sourceNodeId: "branch-intent",
        targetNodeId: "action-message",
        type: "insert-node-between",
      },
      {
        connection: {
          source: "branch-intent",
          sourceHandle: "branch-normal",
          target: "goal",
          targetHandle: null,
        },
        type: "connect-nodes",
      },
      {
        edgeId: "edge-action-message-goal",
        type: "delete-edge",
      },
      {
        edgeIds: ["edge-action-message-goal", "missing-edge"],
        type: "delete-edges",
      },
      {
        nodeId: "action-message",
        type: "delete-node",
      },
      {
        nodeIds: ["trigger", "wait-2d", "action-message"],
        type: "delete-nodes",
      },
      {
        nodeId: "action-message",
        type: "duplicate-node",
      },
      {
        type: "arrange-nodes",
      },
    ];

    commands.forEach((command) => {
      const operation = runWorkflowGraphCommand(draft, command);

      expect(operation, command.type).toBeDefined();
      expect(operation!.draft.viewport).toEqual({ x: 320, y: 180, zoom: 1.4 });
      expect(new Set(operation!.draft.edges.map((edge) => edge.id)).size).toBe(operation!.draft.edges.length);
      expect(operation!.draft.edges.some((edge) => edge.id === "edge-missing-goal")).toBe(false);
      expect(operation!.draft.edges.every((edge) => edge.selected === false)).toBe(true);
      expect(operation!.draft.edges.every((edge) => typeof edge.data?.onToggleInsertMenu === "undefined")).toBe(true);
      expect(operation!.draft.nodes.every((node) => node.selected === false)).toBe(true);
      expect(operation!.draft.nodes.every((node) => node.zIndex === undefined)).toBe(true);
      expect(operation!.draft.nodes.every((node) => typeof node.data.onDelete === "undefined")).toBe(true);
      expect(getGraphPolicyViolations(operation!.draft), command.type).toEqual([]);
    });
  });

  it("pastes clipboard data through the same command boundary with unique node ids", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["action-message"])!;
    const operation = runWorkflowGraphCommand(draft, {
      clipboardData,
      type: "paste-clipboard",
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result?.nodeId).toMatch(/^action-/);
    expect(operation?.draft.nodes.some((node) => node.id === operation.result?.nodeId)).toBe(true);
  });

  it("maps batched edge removals to one graph operation", () => {
    const draft = createDraft();
    const edgeIds = draft.edges.slice(0, 2).map((edge) => edge.id);
    const operation = runWorkflowGraphCommand(draft, {
      edgeIds,
      type: "delete-edges",
    });

    expect(operation?.event).toBe("edge:delete");
    expect(operation?.draft.edges.map((edge) => edge.id)).not.toContain(edgeIds[0]);
    expect(operation?.draft.edges.map((edge) => edge.id)).not.toContain(edgeIds[1]);
  });
});

function createDirtyDraftForCommandBoundary(): WorkflowDraft {
  const draft = createDraft();

  return {
    ...draft,
    edges: [
      ...draft.edges.map((edge) =>
        edge.id === "edge-action-message-goal"
          ? {
              ...edge,
              data: {
                ...edge.data,
                onToggleInsertMenu: () => undefined,
              },
              selected: true,
            }
          : edge,
      ),
      createEdge("action-message", "goal"),
      {
        ...createEdge("missing", "goal"),
        id: "edge-missing-goal",
      },
    ],
    nodes: draft.nodes.map((node) =>
      node.id === "action-message"
        ? {
            ...node,
            data: {
              ...node.data,
              onDelete: () => undefined,
            },
            selected: true,
            zIndex: 20,
          }
        : node,
    ),
    viewport: {
      x: 320,
      y: 180,
      zoom: 1.4,
    },
  };
}

function getGraphPolicyViolations(draft: WorkflowDraft) {
  return draft.edges.flatMap((edge) => {
    const violation = getWorkflowConnectionPolicyViolation(draft, {
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      target: edge.target,
      targetHandle: edge.targetHandle ?? null,
    }, {
      ignoreEdgeId: edge.id,
    });

    return violation ? [{ edgeId: edge.id, violation }] : [];
  });
}

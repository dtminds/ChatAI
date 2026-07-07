import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowClipboardData,
  isClipboardNodeStructurallyValid,
  parseWorkflowClipboardText,
  pasteWorkflowClipboardData,
  stringifyWorkflowClipboardData,
} from "@/pages/chat/ai-hosting/workflow/workflow-clipboard";
import {
  createEdge,
  createInitialEdges,
  createInitialNodes,
} from "@/pages/chat/ai-hosting/workflow/graph";
import type { WorkflowDraft } from "@/pages/chat/ai-hosting/workflow/types";

function createDraft(): WorkflowDraft {
  return {
    edges: createInitialEdges(),
    nodes: createInitialNodes(),
  };
}

describe("workflow clipboard", () => {
  it("copies copyable nodes with only internal edges and sanitized runtime state", () => {
    const draft = createDraft();
    const branch = draft.nodes.find((node) => node.id === "branch-intent")!;
    const action = draft.nodes.find((node) => node.id === "action-message")!;
    const clipboardData = createWorkflowClipboardData({
      edges: [
        ...draft.edges,
        createEdge("branch-intent", "action-message", "低意向", {
          sourceHandle: "branch-low",
        }),
      ],
      nodes: draft.nodes.map((node) =>
        node.id === "action-message"
          ? {
              ...node,
              data: {
                ...node.data,
                onDelete: vi.fn(),
                selected: true,
              },
              selected: true,
              zIndex: 20,
            }
          : node,
      ),
    }, [branch.id, action.id]);

    expect(clipboardData?.nodes.map((node) => node.id)).toEqual(["branch-intent", "action-message"]);
    expect(clipboardData?.edges).toHaveLength(2);
    expect(clipboardData?.nodes.find((node) => node.id === "action-message")?.selected).toBe(false);
    expect(clipboardData?.nodes.find((node) => node.id === "action-message")?.zIndex).toBeUndefined();
    expect(clipboardData?.nodes.find((node) => node.id === "action-message")?.data.onDelete).toBeUndefined();
    expect(createWorkflowClipboardData(draft, ["trigger"])).toBeUndefined();
  });

  it("round-trips valid clipboard payloads and filters invalid edges", () => {
    const clipboardData = createWorkflowClipboardData(createDraft(), ["action-message"])!;
    const text = stringifyWorkflowClipboardData({
      edges: [
        ...clipboardData.edges,
        {
          id: "edge-missing",
          source: "missing",
          target: "action-message",
          type: "marketing",
        },
      ],
      nodes: clipboardData.nodes,
    });
    const parsed = parseWorkflowClipboardText(text);

    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.edges).toHaveLength(0);
    expect(parseWorkflowClipboardText("not-json")).toBeUndefined();
    expect(isClipboardNodeStructurallyValid({
      data: { kind: "action" },
      id: "action",
      position: { x: Number.NaN, y: 0 },
      type: "marketing",
    })).toBe(false);
  });

  it("pastes copyable nodes with remapped ids, offset positions, unique titles, and internal edges", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["branch-intent", "action-message"])!;
    const operation = pasteWorkflowClipboardData(draft, clipboardData, {
      nodeIdFactory: (kind, index) => `${kind}-paste-${index}`,
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result).toEqual({ nodeId: "branch-paste-0" });

    const pastedBranch = operation?.draft.nodes.find((node) => node.id === "branch-paste-0");
    const pastedAction = operation?.draft.nodes.find((node) => node.id === "action-paste-1");

    expect(pastedBranch?.position).toEqual({ x: 668, y: 48 });
    expect(pastedBranch?.data.title).toBe("意向判断 (1)");
    expect(pastedAction?.data.title).toBe("发送欢迎消息 (1)");
    expect(operation?.draft.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "branch-paste-0",
        sourceHandle: "branch-high",
        target: "action-paste-1",
      }),
    ]));
  });

  it("keeps pasted node ids unique when the id factory returns an existing id", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["action-message"])!;
    const operation = pasteWorkflowClipboardData(draft, clipboardData, {
      nodeIdFactory: () => "action-message",
    });

    expect(operation?.result).toEqual({ nodeId: "action-message-1" });
    expect(operation?.draft.nodes.some((node) => node.id === "action-message-1")).toBe(true);
  });
});

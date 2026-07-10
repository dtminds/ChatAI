import { describe, expect, it, vi } from "vitest";
import {
  createWorkflowClipboardData,
  hydrateWorkflowClipboardData,
  isClipboardNodeStructurallyValid,
  parseWorkflowClipboardText,
  pasteWorkflowClipboardData,
  readWorkflowClipboard,
  stringifyWorkflowClipboardData,
  WORKFLOW_CLIPBOARD_KIND,
  writeWorkflowClipboard,
} from "@/pages/chat/workflow/workflow-clipboard";
import {
  createEdge,
  createInitialDraft,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import type {
  WorkflowBranchPath,
  WorkflowDraft,
} from "@/pages/chat/workflow/types";

function createDraft(): WorkflowDraft {
  return createInitialDraft();
}

function setNavigatorClipboard(clipboard: Partial<Clipboard> | undefined) {
  const previousClipboard = navigator.clipboard;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });

  return () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: previousClipboard,
    });
  };
}

describe("workflow clipboard", () => {
  it("copies copyable nodes with only internal edges and sanitized runtime state", () => {
    const draft = createDraft();
    const branch = draft.nodes.find((node) => node.id === "branch-intent")!;
    const message = draft.nodes.find((node) => node.id === "message-welcome")!;
    const lowAction = createNodeFromKind("message", "message-low", 10);
    const branchPaths = [
      { id: "branch-high", label: "高意向客户", operator: "IF", title: "CASE 1" },
      { id: "branch-low", label: "低意向客户", operator: "ELIF", title: "CASE 2" },
      { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 3" },
    ] satisfies WorkflowBranchPath[];
    const clipboardData = createWorkflowClipboardData({
      ...draft,
      edges: [
        ...draft.edges,
        createEdge("branch-intent", "message-low", "低意向", {
          sourceHandle: "branch-low",
        }),
      ],
      nodes: [
        ...draft.nodes.map((node) =>
          node.id === "message-welcome"
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
            : node.id === "branch-intent"
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    branchPaths,
                  },
                }
            : node,
        ),
        lowAction,
      ],
    }, [branch.id, message.id, lowAction.id]);

    expect(clipboardData?.nodes.map((node) => node.id)).toEqual(["branch-intent", "message-welcome", "message-low"]);
    expect(clipboardData?.edges).toHaveLength(2);
    expect(clipboardData?.nodes.find((node) => node.id === "message-welcome")?.selected).toBe(false);
    expect(clipboardData?.nodes.find((node) => node.id === "message-welcome")?.zIndex).toBeUndefined();
    expect(clipboardData?.nodes.find((node) => node.id === "message-welcome")?.data.onDelete).toBeUndefined();
    expect(createWorkflowClipboardData(draft, ["start"])).toBeUndefined();
  });

  it("round-trips valid clipboard payloads and filters invalid edges", () => {
    const clipboardData = createWorkflowClipboardData(createDraft(), ["message-welcome"])!;
    const text = stringifyWorkflowClipboardData({
      edges: [
        ...clipboardData.edges,
        {
          id: "edge-missing",
          source: "missing",
          target: "message-welcome",
          type: "legacy-edge-type" as typeof WORKFLOW_EDGE_TYPE,
        },
      ],
      nodes: clipboardData.nodes,
    });
    const parsed = parseWorkflowClipboardText(text);
    const payload = JSON.parse(text);

    expect(payload.kind).toBe(WORKFLOW_CLIPBOARD_KIND);
    expect(payload.kind).toBe("chatai-workflow-clipboard");
    expect(parsed?.nodes).toHaveLength(1);
    expect(parsed?.edges).toHaveLength(0);
    expect(parseWorkflowClipboardText("not-json")).toBeUndefined();
    expect(isClipboardNodeStructurallyValid({
      data: { kind: "message" },
      id: "message",
      position: { x: Number.NaN, y: 0 },
      type: "legacy-node-type",
    })).toBe(false);
  });

  it("hydrates clipboard payloads through the draft normalizer", () => {
    const draft = createDraft();
    const message = draft.nodes.find((node) => node.id === "message-welcome")!;
    const hydrated = hydrateWorkflowClipboardData({
      edges: [
        {
          id: "edge-message-welcome-message-welcome",
          source: "message-welcome",
          target: "message-welcome",
          type: "legacy-edge-type" as typeof WORKFLOW_EDGE_TYPE,
        },
        {
          id: "edge-message-welcome-message-welcome",
          source: "message-welcome",
          target: "message-welcome",
          type: WORKFLOW_EDGE_TYPE,
        },
        {
          id: "edge-missing",
          source: "missing",
          target: "message-welcome",
          type: WORKFLOW_EDGE_TYPE,
        },
      ],
      nodes: [
        {
          ...message,
          data: {
            kind: "message",
            title: "外部动作",
          } as typeof message.data,
          selected: true,
          type: "legacy-node-type" as typeof WORKFLOW_NODE_TYPE,
          zIndex: 99,
        },
      ],
    });

    expect(hydrated.nodes).toHaveLength(1);
    expect(hydrated.nodes[0]).toEqual(expect.objectContaining({
      selected: false,
      type: WORKFLOW_NODE_TYPE,
      zIndex: undefined,
    }));
    expect(hydrated.nodes[0].data).toEqual(expect.objectContaining({
      kind: "message",
      metric: expect.any(String),
      status: expect.any(String),
      summary: expect.any(String),
      title: "外部动作",
    }));
    expect(hydrated.edges).toHaveLength(0);
  });

  it("rejects clipboard payloads from an unsupported product kind", () => {
    const parsed = parseWorkflowClipboardText(JSON.stringify({
      edges: [],
      kind: "unsupported-workflow-clipboard",
      nodes: [],
      version: 1,
    }));

    expect(parsed).toBeUndefined();
  });

  it("reads and writes workflow data through the system clipboard without leaking permission errors", async () => {
    const clipboardData = createWorkflowClipboardData(createDraft(), ["message-welcome"])!;
    const clipboardText = stringifyWorkflowClipboardData(clipboardData);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue(clipboardText);
    const restoreClipboard = setNavigatorClipboard({
      readText,
      writeText,
    });

    try {
      await expect(writeWorkflowClipboard(clipboardData)).resolves.toBe(true);
      expect(writeText).toHaveBeenCalledWith(clipboardText);
      await expect(readWorkflowClipboard()).resolves.toEqual(clipboardData);

      writeText.mockRejectedValueOnce(new Error("denied"));
      readText.mockRejectedValueOnce(new Error("denied"));

      await expect(writeWorkflowClipboard(clipboardData)).resolves.toBe(false);
      await expect(readWorkflowClipboard()).resolves.toBeUndefined();
    }
    finally {
      restoreClipboard();
    }
  });

  it("pastes copyable nodes with remapped ids, offset positions, unique titles, and internal edges", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["branch-intent", "message-welcome"])!;
    const operation = pasteWorkflowClipboardData(draft, clipboardData, {
      nodeIdFactory: (kind, index) => `${kind}-paste-${index}`,
    });

    expect(operation?.event).toBe("node:paste");
    expect(operation?.result).toEqual({ nodeId: "branch-paste-0" });

    const pastedBranch = operation?.draft.nodes.find((node) => node.id === "branch-paste-0");
    const pastedAction = operation?.draft.nodes.find((node) => node.id === "message-paste-1");
    const sourceBranch = draft.nodes.find((node) => node.id === "branch-intent")!;

    expect(pastedBranch?.position).toEqual({
      x: sourceBranch.position.x + 48,
      y: sourceBranch.position.y + 48,
    });
    expect(pastedBranch?.data.title).toBe("意向判断 (1)");
    expect(pastedAction?.data.title).toBe("发送欢迎消息 (1)");
    expect(operation?.draft.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "branch-paste-0",
        sourceHandle: "branch-high",
        target: "message-paste-1",
      }),
    ]));
  });

  it("keeps pasted node ids unique when the id factory returns an existing id", () => {
    const draft = createDraft();
    const clipboardData = createWorkflowClipboardData(draft, ["message-welcome"])!;
    const operation = pasteWorkflowClipboardData(draft, clipboardData, {
      nodeIdFactory: () => "message-welcome",
    });

    expect(operation?.result).toEqual({ nodeId: "message-welcome-1" });
    expect(operation?.draft.nodes.some((node) => node.id === "message-welcome-1")).toBe(true);
  });

  it("returns a canonical draft when pasting into a target graph with invalid edges", () => {
    const draft = createDraft();
    const branch = draft.nodes.find((node) => node.id === "branch-intent")!;
    const message = draft.nodes.find((node) => node.id === "message-welcome")!;
    const operation = pasteWorkflowClipboardData({
      ...draft,
      edges: [
        ...draft.edges,
        {
          ...createEdge("missing-node", "end"),
          id: "edge-missing-node-end",
        },
      ],
    }, {
      edges: [
        createEdge("branch-intent", "message-welcome", "高意向", {
          sourceHandle: "branch-high",
        }),
      ],
      nodes: [branch, message],
    }, {
      nodeIdFactory: (kind, index) => `${kind}-paste-${index}`,
      offset: { x: 0, y: 0 },
    });

    expect(operation?.draft.nodes.some((node) => node.id === "branch-paste-0")).toBe(true);
    expect(operation?.draft.nodes.some((node) => node.id === "message-paste-1")).toBe(true);
    expect(operation?.draft.edges.some((edge) => edge.id === "edge-missing-node-end")).toBe(false);
  });
});

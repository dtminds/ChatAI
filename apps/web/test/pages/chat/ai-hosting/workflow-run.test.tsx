import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  WORKFLOW_EDGE_TYPE,
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/ai-hosting/workflow/constants";
import { useWorkflowRun } from "@/pages/chat/ai-hosting/workflow/run/use-workflow-run";
import {
  createMockWorkflowRunAdapter,
  type WorkflowNodeRunRequest,
  type WorkflowRunRequest,
} from "@/pages/chat/ai-hosting/workflow/run/workflow-run-adapter";
import { createWorkflowRuntimeSnapshot } from "@/pages/chat/ai-hosting/workflow/run/workflow-run-snapshot";
import type { WorkflowRuntimeSnapshot } from "@/pages/chat/ai-hosting/workflow/run/workflow-run-snapshot";
import type {
  NodeRunRecord,
  WorkflowDraft,
  WorkflowEdge,
  WorkflowNode,
} from "@/pages/chat/ai-hosting/workflow/types";

function createWorkflowNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    data: {
      actionType: "ai",
      agentName: "护肤小助理",
      kind: "ai",
      label: "AI 接待",
      metric: "知识库：护肤知识库",
      status: "ready",
      summary: "护肤小助理",
      title: "AI 接待",
    },
    id: "ai-node",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
    ...overrides,
  };
}

describe("useWorkflowRun", () => {
  it("stores a node run record keyed by node id", async () => {
    const { result } = renderHook(() => useWorkflowRun());
    const node = createWorkflowNode();

    expect(result.current.getNodeRun(node.id)).toBeUndefined();

    act(() => {
      result.current.runNode(node);
    });

    expect(result.current.getNodeRun(node.id)?.status).toBe("running");

    await act(async () => {
      await Promise.resolve();
    });

    const runRecord = result.current.getNodeRun(node.id);

    expect(runRecord?.status).toBe("succeeded");
    expect(runRecord?.durationMs).toBeGreaterThan(0);
    expect(runRecord?.input).toContain("\"nodeId\": \"ai-node\"");
    expect(runRecord?.output).toContain("\"title\": \"AI 接待\"");
    expect(runRecord?.logs).toContain("匹配 Agent 与知识库策略");
  });

  it("delegates node execution to the configured adapter", async () => {
    const adapter = {
      runNode: vi.fn(() => ({
        durationMs: 12,
        finishedAt: "10:24:18",
        input: "{}",
        logs: ["adapter run"],
        output: "{\"ok\":true}",
        status: "succeeded" as const,
      })),
      runWorkflow: createUnusedWorkflowRunAdapter(),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const node = createWorkflowNode();

    act(() => {
      result.current.runNode(node);
    });

    expect(adapter.runNode).toHaveBeenCalledWith({
      node: expect.objectContaining({
        data: expect.objectContaining({
          agentName: "护肤小助理",
          kind: "ai",
        }),
        id: node.id,
        selected: false,
      }),
    });
    expect(result.current.getNodeRun(node.id)?.status).toBe("running");

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.getNodeRun(node.id)?.logs).toEqual(["adapter run"]);
  });

  it("runs individual nodes from a sanitized runtime snapshot", async () => {
    const adapter = {
      runNode: vi.fn((_request: WorkflowNodeRunRequest) => ({
        durationMs: 12,
        finishedAt: "10:24:18",
        input: "{}",
        logs: ["adapter run"],
        output: "{\"ok\":true}",
        status: "succeeded" as const,
      })),
      runWorkflow: createUnusedWorkflowRunAdapter(),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const baseNode = createWorkflowNode();
    const node = createWorkflowNode({
      data: {
        ...baseNode.data,
        _runtimeStatus: "selected",
        onDelete: vi.fn(),
        selected: true,
      } as WorkflowNode["data"],
      selected: true,
      zIndex: 20,
    });

    act(() => {
      result.current.runNode(node);
    });

    expect(adapter.runNode).toHaveBeenCalled();
    const requestNode = adapter.runNode.mock.calls[0]![0].node;

    expect(requestNode).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        kind: "ai",
        title: "AI 接待",
      }),
      id: "ai-node",
      selected: false,
    }));
    expect(requestNode?.zIndex).toBeUndefined();
    expect(requestNode?.data._runtimeStatus).toBeUndefined();
    expect(requestNode?.data.onDelete).toBeUndefined();
    expect(result.current.getNodeRun("ai-node")?.input).toContain("\"nodeId\": \"ai-node\"");
  });

  it("provides a replaceable mock adapter for local workflow runs", async () => {
    const adapter = createMockWorkflowRunAdapter();
    const node = createWorkflowNode();
    const draft = createWorkflowDraft();
    const runRecord = await adapter.runNode({ node });
    const workflowRunRecord = await adapter.runWorkflow({
      snapshot: createWorkflowRuntimeSnapshot(draft),
      workflowId: "workflow-a",
    });

    draft.nodes[0]!.data.title = "后续编辑的节点标题";

    expect(runRecord.status).toBe("succeeded");
    expect(runRecord.input).toContain("\"nodeId\": \"ai-node\"");
    expect(runRecord.output).toContain("\"title\": \"AI 接待\"");
    expect(workflowRunRecord.draft.nodes[0]?.data.title).toBe("AI 接待");
  });

  it("archives workflow run history with a graph snapshot and node records", async () => {
    const { result } = renderHook(() => useWorkflowRun("workflow-a"));
    const draft = createWorkflowDraft();

    act(() => {
      result.current.runWorkflow(draft);
    });

    expect(result.current.activeRun?.status).toBe("running");
    expect(result.current.getNodeRun("ai-node")?.status).toBe("running");

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.activeRun?.status).toBe("succeeded");
    expect(result.current.runHistory).toHaveLength(1);
    expect(result.current.runHistory[0]?.draft.nodes[0]?.id).toBe("ai-node");
    expect(result.current.runHistory[0]?.nodeRuns["ai-node"]?.status).toBe("succeeded");
    expect(result.current.runHistory[0]?.inputs).toEqual(expect.objectContaining({
      nodeCount: 1,
    }));
    expect(result.current.runHistory[0]?.outputs).toEqual(expect.objectContaining({
      summary: "测试运行完成",
    }));
    expect(result.current.runHistory[0]?.trace[0]).toEqual(expect.objectContaining({
      nodeId: "ai-node",
      nodeTitle: "AI 接待",
    }));
  });

  it("runs workflows from an immutable draft snapshot", async () => {
    let resolveWorkflowRun: (() => void) | undefined;
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("node failed"))),
      runWorkflow: vi.fn(({ snapshot, workflowId }: {
        snapshot: WorkflowRuntimeSnapshot;
        workflowId: string;
      }) => new Promise<ReturnType<typeof createWorkflowRunRecord>>((resolve) => {
        resolveWorkflowRun = () => resolve(createWorkflowRunRecord(workflowId, snapshot.draft));
      })),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const draft = createWorkflowDraft();

    act(() => {
      result.current.runWorkflow(draft);
    });

    draft.nodes[0]!.data.title = "后续编辑的节点标题";

    expect(adapter.runWorkflow).toHaveBeenCalledWith({
      snapshot: expect.objectContaining({
        draft: expect.objectContaining({
          nodes: [
            expect.objectContaining({
              data: expect.objectContaining({ title: "AI 接待" }),
            }),
          ],
        }),
        executionGraph: expect.objectContaining({
          edges: [],
          nodes: [
            expect.objectContaining({
              config: expect.objectContaining({
                agentName: "护肤小助理",
              }),
              id: "ai-node",
              kind: "ai",
            }),
          ],
        }),
      }),
      workflowId: "workflow-a",
    });
    const runRequest = adapter.runWorkflow.mock.calls[0]?.[0];
    expect(runRequest?.snapshot.executionGraph).not.toHaveProperty("viewport");
    expect(runRequest?.snapshot.executionGraph.nodes[0]).not.toHaveProperty("position");
    expect(runRequest?.snapshot.executionGraph.nodes[0]?.config).not.toHaveProperty("title");
    expect(runRequest?.snapshot.executionGraph.nodes[0]?.config).not.toHaveProperty("status");
    expect(runRequest?.snapshot.executionGraph.nodes[0]?.config).not.toHaveProperty("selected");
    expect(result.current.activeRun?.draft.nodes[0]?.data.title).toBe("AI 接待");

    await act(async () => {
      resolveWorkflowRun?.();
      await Promise.resolve();
    });

    expect(result.current.activeRun?.draft.nodes[0]?.data.title).toBe("AI 接待");
    expect(result.current.runHistory[0]?.draft.nodes[0]?.data.title).toBe("AI 接待");
  });

  it("does not pass editor-only draft fields as workflow execution input", () => {
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("node failed"))),
      runWorkflow: vi.fn(({ snapshot, workflowId }: {
        snapshot: WorkflowRuntimeSnapshot;
        workflowId: string;
      }) => createWorkflowRunRecord(workflowId, snapshot.draft)),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const draft = createWorkflowDraft();
    draft.nodes[0] = {
      ...draft.nodes[0]!,
      data: {
        ...draft.nodes[0]!.data,
        _runtimeStatus: "selected",
        onDelete: vi.fn(),
        selected: true,
      },
      selected: true,
      zIndex: 20,
    };
    draft.viewport = { x: 120, y: 80, zoom: 1.6 };

    act(() => {
      result.current.runWorkflow(draft);
    });

    const request = adapter.runWorkflow.mock.calls[0]?.[0];

    expect(request?.snapshot.draft.nodes[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({ title: "AI 接待" }),
      selected: false,
    }));
    expect(request?.snapshot.draft.nodes[0]?.zIndex).toBeUndefined();
    expect(request?.snapshot.draft.nodes[0]?.data._runtimeStatus).toBeUndefined();
    expect(request?.snapshot.draft.nodes[0]?.data.onDelete).toBeUndefined();
    expect(request?.snapshot.executionGraph).toEqual(expect.objectContaining({
      edges: [],
      nodes: [
        expect.objectContaining({
          config: expect.objectContaining({
            agentName: "护肤小助理",
          }),
          id: "ai-node",
          kind: "ai",
        }),
      ],
    }));
    expect(request?.snapshot.executionGraph).not.toHaveProperty("viewport");
    expect(request?.snapshot.executionGraph.nodes[0]).not.toHaveProperty("position");
    expect(request?.snapshot.executionGraph.nodes[0]?.config).not.toHaveProperty("title");
    expect(request?.snapshot.executionGraph.nodes[0]?.config).not.toHaveProperty("_runtimeStatus");
  });

  it("passes execution outlet metadata to workflow run adapters", () => {
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("node failed"))),
      runWorkflow: vi.fn(({ snapshot, workflowId }: {
        snapshot: WorkflowRuntimeSnapshot;
        workflowId: string;
      }) => createWorkflowRunRecord(workflowId, snapshot.draft)),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));

    act(() => {
      result.current.runWorkflow(createBranchWorkflowDraft());
    });

    const request = adapter.runWorkflow.mock.calls[0]?.[0];

    expect(request?.snapshot.executionGraph.edges).toEqual([
      expect.objectContaining({
        source: "branch-node",
        sourceHandle: "branch-high",
        sourceOutlet: {
          id: "branch-high",
          kind: "branch-path",
          label: "高意向客户",
        },
        target: "action-node",
      }),
    ]);
    expect(request?.snapshot.executionGraph.edges[0]).not.toHaveProperty("data");
  });

  it("summarizes execution graph outlets in mock workflow outputs", async () => {
    const { result } = renderHook(() => useWorkflowRun("workflow-a"));

    act(() => {
      result.current.runWorkflow(createBranchWorkflowDraft());
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.runHistory[0]?.outputs).toEqual(expect.objectContaining({
      edgeCount: 1,
      outlets: [
        {
          id: "branch-high",
          kind: "branch-path",
          label: "高意向客户",
        },
      ],
    }));
  });

  it("enters and exits workflow run history view by run id", async () => {
    const { result } = renderHook(() => useWorkflowRun("workflow-a"));

    act(() => {
      result.current.runWorkflow(createWorkflowDraft());
    });

    await act(async () => {
      await Promise.resolve();
    });

    const runId = result.current.runHistory[0]?.id ?? "";

    act(() => {
      result.current.viewRunHistory(runId);
    });

    expect(result.current.historyRun?.id).toBe(runId);

    act(() => {
      result.current.exitRunHistory();
    });

    expect(result.current.historyRun).toBeNull();
  });

  it("stores failed workflow runs in history when the adapter rejects", async () => {
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("node failed"))),
      runWorkflow: vi.fn(() => Promise.reject(new Error("workflow failed"))),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));

    act(() => {
      result.current.runWorkflow(createWorkflowDraft());
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.activeRun?.status).toBe("failed");
    expect(result.current.runHistory[0]?.errorMessage).toBe("workflow failed");
    expect(result.current.getNodeRun("ai-node")?.status).toBe("failed");
  });

  it("stops active workflow runs and ignores stale adapter results", async () => {
    let resolveWorkflowRun: ((record: ReturnType<typeof createWorkflowRunRecord>) => void) | undefined;
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("node failed"))),
      runWorkflow: vi.fn(() => new Promise<ReturnType<typeof createWorkflowRunRecord>>((resolve) => {
        resolveWorkflowRun = resolve;
      })),
      stopWorkflowRun: vi.fn((_request: WorkflowRunRequest & { runId: string }) => undefined),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const draft = createWorkflowDraft();

    act(() => {
      result.current.runWorkflow(draft);
    });

    const runId = result.current.activeRun?.id;

    act(() => {
      result.current.stopWorkflowRun();
    });

    expect(adapter.stopWorkflowRun).toHaveBeenCalledWith({
      runId,
      snapshot: expect.objectContaining({
        draft: expect.objectContaining({
          nodes: [
            expect.objectContaining({
              id: "ai-node",
            }),
          ],
        }),
        executionGraph: expect.objectContaining({
          nodes: [
            expect.objectContaining({
              id: "ai-node",
              kind: "ai",
            }),
          ],
        }),
      }),
      workflowId: "workflow-a",
    });
    expect(adapter.stopWorkflowRun.mock.calls[0]?.[0].snapshot.executionGraph.nodes[0])
      .not.toHaveProperty("position");
    expect(adapter.stopWorkflowRun.mock.calls[0]?.[0].snapshot.executionGraph.nodes[0]?.config)
      .not.toHaveProperty("title");
    expect(result.current.activeRun?.status).toBe("stopped");
    expect(result.current.getNodeRun("ai-node")?.status).toBe("stopped");
    expect(result.current.runHistory[0]?.status).toBe("stopped");

    await act(async () => {
      resolveWorkflowRun?.(createWorkflowRunRecord("workflow-a", draft, runId));
      await Promise.resolve();
    });

    expect(result.current.activeRun?.status).toBe("stopped");
    expect(result.current.runHistory[0]?.status).toBe("stopped");
  });

  it("clears node run records by node id and workflow scope", () => {
    const node = createWorkflowNode();
    const { result, rerender } = renderHook(
      ({ scopeKey }: { scopeKey: string }) => useWorkflowRun(scopeKey),
      {
        initialProps: { scopeKey: "workflow-a" },
      },
    );

    act(() => {
      result.current.runNode(node);
    });
    expect(result.current.getNodeRun(node.id)).toBeDefined();

    act(() => {
      result.current.deleteNodeRun(node.id);
    });
    expect(result.current.getNodeRun(node.id)).toBeUndefined();

    act(() => {
      result.current.runNode(node);
    });
    expect(result.current.getNodeRun(node.id)).toBeDefined();

    rerender({ scopeKey: "workflow-b" });
    expect(result.current.getNodeRun(node.id)).toBeUndefined();
  });

  it("stores a failed run record when the adapter rejects", async () => {
    const adapter = {
      runNode: vi.fn(() => Promise.reject(new Error("run failed"))),
      runWorkflow: createUnusedWorkflowRunAdapter(),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const node = createWorkflowNode();

    act(() => {
      result.current.runNode(node);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.getNodeRun(node.id)?.status).toBe("failed");
    expect(result.current.getNodeRun(node.id)?.errorMessage).toBe("run failed");
  });

  it("ignores stale run results after workflow scope changes", async () => {
    let resolveRun: ((record: NodeRunRecord) => void) | undefined;
    const adapter = {
      runNode: vi.fn(() => new Promise<NodeRunRecord>((resolve) => {
        resolveRun = resolve;
      })),
      runWorkflow: createUnusedWorkflowRunAdapter(),
    };
    const node = createWorkflowNode();
    const { result, rerender } = renderHook(
      ({ scopeKey }: { scopeKey: string }) => useWorkflowRun(scopeKey, adapter),
      {
        initialProps: { scopeKey: "workflow-a" },
      },
    );

    act(() => {
      result.current.runNode(node);
    });

    rerender({ scopeKey: "workflow-b" });

    await act(async () => {
      resolveRun?.({
        durationMs: 12,
        finishedAt: "10:24:18",
        input: "{}",
        logs: ["stale"],
        output: "{}",
        status: "succeeded",
      });
      await Promise.resolve();
    });

    expect(result.current.getNodeRun(node.id)).toBeUndefined();
  });

  it("ignores stale run results after the node run is deleted", async () => {
    let resolveRun: ((record: NodeRunRecord) => void) | undefined;
    const adapter = {
      runNode: vi.fn(() => new Promise<NodeRunRecord>((resolve) => {
        resolveRun = resolve;
      })),
      runWorkflow: createUnusedWorkflowRunAdapter(),
    };
    const { result } = renderHook(() => useWorkflowRun("workflow-a", adapter));
    const node = createWorkflowNode();

    act(() => {
      result.current.runNode(node);
      result.current.deleteNodeRun(node.id);
    });

    await act(async () => {
      resolveRun?.({
        durationMs: 12,
        finishedAt: "10:24:18",
        input: "{}",
        logs: ["stale"],
        output: "{}",
        status: "succeeded",
      });
      await Promise.resolve();
    });

    expect(result.current.getNodeRun(node.id)).toBeUndefined();
  });
});

function createWorkflowDraft(): WorkflowDraft {
  return {
    edges: [],
    nodes: [createWorkflowNode()],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createBranchWorkflowDraft(): WorkflowDraft {
  const branchNode = createWorkflowNode({
    data: {
      branchPaths: [
        { id: "branch-high", label: "高意向客户", operator: "IF", title: "CASE 1" },
        { id: "branch-default", isDefault: true, label: "默认路径", operator: "ELSE", title: "CASE 2" },
      ],
      branchRule: "按意向分流",
      kind: "branch",
      label: "条件",
      metric: "2 个出口",
      status: "ready",
      summary: "按意向分流",
      title: "条件分支",
    },
    id: "branch-node",
  });
  const actionNode = createWorkflowNode({
    data: {
      actionType: "message",
      kind: "action",
      label: "动作",
      metric: "消息",
      status: "ready",
      summary: "发送消息",
      title: "发送消息",
    },
    id: "action-node",
  });
  const edge: WorkflowEdge = {
    data: { label: "高意向客户" },
    id: "edge-branch-high-action",
    source: "branch-node",
    sourceHandle: "branch-high",
    target: "action-node",
    type: WORKFLOW_EDGE_TYPE,
  };

  return {
    edges: [edge],
    nodes: [branchNode, actionNode],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createUnusedWorkflowRunAdapter() {
  return vi.fn(() => {
    throw new Error("runWorkflow should not be called");
  });
}

function createWorkflowRunRecord(
  workflowId: string,
  draft: WorkflowDraft,
  runId = `${workflowId}-run`,
) {
  const nodeRuns = Object.fromEntries(
    draft.nodes.map((node) => [
      node.id,
      {
        durationMs: 12,
        finishedAt: "10:24:18",
        input: "{}",
        logs: ["completed"],
        output: "{}",
        status: "succeeded" as const,
      },
    ]),
  );

  return {
    createdAt: "10:24:18",
    draft,
    durationMs: 12,
    finishedAt: "10:24:18",
    id: runId,
    inputs: {},
    nodeRuns,
    outputs: {},
    status: "succeeded" as const,
    title: "Test Run",
    totalNodes: draft.nodes.length,
    totalSteps: draft.nodes.length,
    totalTokens: 12,
    trace: draft.nodes.map((node) => ({
      durationMs: 12,
      finishedAt: "10:24:18",
      logs: ["completed"],
      nodeId: node.id,
      nodeTitle: node.data.title,
      nodeType: node.data.kind,
      startedAt: "10:24:17",
      status: "succeeded" as const,
    })),
  };
}

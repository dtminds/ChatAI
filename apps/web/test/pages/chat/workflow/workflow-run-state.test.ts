import { describe, expect, it } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import {
  createPendingWorkflowRun,
  initialWorkflowRunState,
  workflowRunReducer,
} from "@/pages/chat/workflow/run/workflow-run-state";
import type {
  NodeRunRecord,
  WorkflowDraft,
  WorkflowNode,
  WorkflowRunRecord,
} from "@/pages/chat/workflow/types";

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

function createWorkflowDraft(): WorkflowDraft {
  return {
    edges: [],
    nodes: [createWorkflowNode()],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createNodeRunRecord(overrides: Partial<NodeRunRecord> = {}): NodeRunRecord {
  return {
    durationMs: 12,
    finishedAt: "10:24:18",
    input: "{}",
    logs: ["completed"],
    output: "{}",
    status: "succeeded",
    ...overrides,
  };
}

function createWorkflowRunRecord(
  draft: WorkflowDraft,
  overrides: Partial<WorkflowRunRecord> = {},
): WorkflowRunRecord {
  const nodeRuns = Object.fromEntries(
    draft.nodes.map((node) => [node.id, createNodeRunRecord()]),
  );

  return {
    createdAt: "10:24:18",
    draft,
    durationMs: 12,
    finishedAt: "10:24:18",
    id: "workflow-run",
    inputs: {},
    nodeRuns,
    outputs: {},
    status: "succeeded",
    title: "Test Run",
    totalNodes: draft.nodes.length,
    totalSteps: draft.nodes.length,
    totalTokens: 12,
    trace: [],
    ...overrides,
  };
}

describe("workflowRunReducer", () => {
  it("applies node run lifecycle events without replacing unrelated state", () => {
    const node = createWorkflowNode();
    let state = workflowRunReducer(initialWorkflowRunState, {
      node,
      type: "node-run-started",
    });

    expect(state.runRecords[node.id]?.status).toBe("running");

    state = workflowRunReducer(state, {
      node,
      record: createNodeRunRecord({ completedAt: undefined }),
      type: "node-run-resolved",
    });

    expect(state.runRecords[node.id]?.status).toBe("succeeded");
    expect(state.runRecords[node.id]?.completedAt).toEqual(expect.any(Number));

    state = workflowRunReducer(state, {
      nodeId: node.id,
      type: "node-run-deleted",
    });

    expect(state.runRecords[node.id]).toBeUndefined();
  });

  it("archives resolved workflow runs and can enter history preview", () => {
    const draft = createWorkflowDraft();
    draft.nodes[0]!.data._runtimeStatus = "selected";
    const pendingRun = createPendingWorkflowRun({
      draft,
      runId: "pending-run",
    });
    let state = workflowRunReducer(initialWorkflowRunState, {
      pendingRun,
      type: "workflow-run-started",
    });

    expect(state.activeRun?.status).toBe("running");
    expect(state.runRecords["ai-node"]?.status).toBe("running");

    state = workflowRunReducer(state, {
      draft,
      fallbackRunId: pendingRun.id,
      run: createWorkflowRunRecord(draft, { id: "" }),
      type: "workflow-run-resolved",
    });

    expect(state.activeRun?.id).toBe(pendingRun.id);
    expect(state.runHistory).toHaveLength(1);
    expect(state.runHistory[0]?.trace[0]?.nodeId).toBe("ai-node");

    state = workflowRunReducer(state, {
      runId: pendingRun.id,
      type: "history-selected",
    });

    expect(state.historyRun?.id).toBe(pendingRun.id);

    state = workflowRunReducer(state, { type: "history-exited" });

    expect(state.historyRun).toBeNull();
  });

  it("keeps pending and archived workflow run snapshots independent from mutable drafts", () => {
    const draft = createWorkflowDraft();
    const pendingRun = createPendingWorkflowRun({
      draft,
      runId: "pending-run",
    });

    draft.nodes[0]!.data.title = "后续编辑的节点标题";

    expect(pendingRun.draft.nodes[0]?.data.title).toBe("AI 接待");
    expect(pendingRun.draft.nodes[0]?.data._runtimeStatus).toBeUndefined();

    const adapterRun = createWorkflowRunRecord(draft, {
      id: "",
      trace: [{
        durationMs: 12,
        finishedAt: "10:24:18",
        logs: ["completed"],
        nodeId: "ai-node",
        nodeTitle: "AI 接待",
        nodeType: "ai",
        startedAt: "10:24:17",
        status: "succeeded",
      }],
    });
    let state = workflowRunReducer(initialWorkflowRunState, {
      pendingRun,
      type: "workflow-run-started",
    });

    state = workflowRunReducer(state, {
      draft,
      fallbackRunId: pendingRun.id,
      run: adapterRun,
      type: "workflow-run-resolved",
    });

    adapterRun.draft.nodes[0]!.data.title = "adapter 对象后续突变";
    adapterRun.nodeRuns["ai-node"]!.logs.push("adapter 对象后续日志");
    adapterRun.trace[0]!.logs.push("adapter trace 后续日志");

    expect(state.activeRun?.draft.nodes[0]?.data.title).toBe("后续编辑的节点标题");
    expect(state.activeRun?.draft.nodes[0]?.data._runtimeStatus).toBeUndefined();
    expect(state.activeRun?.nodeRuns["ai-node"]?.logs).toEqual(["completed"]);
    expect(state.activeRun?.trace[0]?.logs).toEqual(["completed"]);
    expect(state.runHistory[0]?.draft.nodes[0]?.data.title).toBe("后续编辑的节点标题");
  });

  it("archives stopped workflow runs", () => {
    const draft = createWorkflowDraft();
    const pendingRun = createPendingWorkflowRun({
      draft,
      runId: "pending-run",
    });
    let state = workflowRunReducer(initialWorkflowRunState, {
      pendingRun,
      type: "workflow-run-started",
    });

    state = workflowRunReducer(state, { type: "workflow-run-stopped" });

    expect(state.activeRun?.status).toBe("stopped");
    expect(state.runHistory[0]?.status).toBe("stopped");
  });

  it("derives pending workflow inputs from the entry node role", () => {
    const pendingRun = createPendingWorkflowRun({
      draft: {
        edges: [],
        nodes: [
          createWorkflowNode({
            data: {
              audience: "高价值会员",
              kind: "trigger",
              label: "触发",
              metric: "预计进入",
              status: "ready",
              summary: "进入旅程",
              title: "会员进入",
            },
            id: "entry-node",
          }),
          createWorkflowNode({
            id: "ai-node",
          }),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
      runId: "pending-run",
    });

    expect(pendingRun.inputs).toEqual(expect.objectContaining({
      audience: "高价值会员",
      trigger: "会员进入",
    }));
  });

  it("resets all run state when the workflow scope changes", () => {
    const draft = createWorkflowDraft();
    const state = workflowRunReducer(initialWorkflowRunState, {
      pendingRun: createPendingWorkflowRun({
        draft,
        runId: "pending-run",
      }),
      type: "workflow-run-started",
    });

    expect(workflowRunReducer(state, { type: "scope-reset" })).toEqual(initialWorkflowRunState);
  });
});

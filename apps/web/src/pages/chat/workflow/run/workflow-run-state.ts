import type {
  NodeRunRecord,
  WorkflowDraft,
  WorkflowNode,
  WorkflowRunRecord,
} from "../types";
import { findWorkflowEntryNode } from "../node-catalog";
import {
  createFailedNodeRunRecord,
  createPendingNodeRunRecord,
} from "./workflow-run-adapter";
import { createWorkflowRunDraftSnapshot } from "./workflow-run-snapshot";

export type WorkflowRunRecords = Record<string, NodeRunRecord>;

export type WorkflowRunState = {
  activeRun: WorkflowRunRecord | null;
  historyRun: WorkflowRunRecord | null;
  runHistory: WorkflowRunRecord[];
  runRecords: WorkflowRunRecords;
};

export type WorkflowRunAction =
  | {
      node: WorkflowNode;
      type: "node-run-started";
    }
  | {
      node: WorkflowNode;
      record: NodeRunRecord;
      type: "node-run-resolved";
    }
  | {
      error: unknown;
      node: WorkflowNode;
      type: "node-run-rejected";
    }
  | {
      nodeId: string;
      type: "node-run-deleted";
    }
  | {
      pendingRun: WorkflowRunRecord;
      type: "workflow-run-started";
    }
  | {
      draft: WorkflowDraft;
      fallbackRunId: string;
      run: WorkflowRunRecord;
      type: "workflow-run-resolved";
    }
  | {
      error: unknown;
      pendingRun: WorkflowRunRecord;
      type: "workflow-run-rejected";
    }
  | {
      type: "workflow-run-stopped";
    }
  | {
      runId: string;
      type: "history-selected";
    }
  | {
      type: "history-exited";
    }
  | {
      type: "scope-reset";
    };

const MAX_WORKFLOW_RUN_HISTORY = 20;

export const initialWorkflowRunState: WorkflowRunState = {
  activeRun: null,
  historyRun: null,
  runHistory: [],
  runRecords: {},
};

export function workflowRunReducer(
  state: WorkflowRunState,
  action: WorkflowRunAction,
): WorkflowRunState {
  switch (action.type) {
    case "scope-reset":
      return initialWorkflowRunState;
    case "node-run-started":
      return {
        ...state,
        runRecords: {
          ...state.runRecords,
          [action.node.id]: createPendingNodeRunRecord(action.node),
        },
      };
    case "node-run-resolved": {
      const completedRecord = {
        ...action.record,
        completedAt: action.record.completedAt ?? Date.now(),
      };

      return {
        ...state,
        activeRun: updateActiveRunNodeRecord(state.activeRun, action.node, completedRecord),
        runRecords: {
          ...state.runRecords,
          [action.node.id]: completedRecord,
        },
      };
    }
    case "node-run-rejected":
      return {
        ...state,
        runRecords: {
          ...state.runRecords,
          [action.node.id]: createFailedNodeRunRecord(action.node, action.error),
        },
      };
    case "node-run-deleted": {
      const {
        [action.nodeId]: _deletedRecord,
        ...nextRunRecords
      } = state.runRecords;

      return {
        ...state,
        activeRun: removeActiveRunNodeRecord(state.activeRun, action.nodeId),
        runRecords: nextRunRecords,
      };
    }
    case "workflow-run-started":
      return {
        ...state,
        activeRun: action.pendingRun,
        historyRun: null,
        runRecords: action.pendingRun.nodeRuns,
      };
    case "workflow-run-resolved": {
      const completedRun = normalizeWorkflowRunRecord(
        action.run,
        action.fallbackRunId,
        action.draft,
      );

      return {
        ...state,
        activeRun: completedRun,
        runHistory: archiveWorkflowRun(state.runHistory, completedRun),
        runRecords: completedRun.nodeRuns,
      };
    }
    case "workflow-run-rejected": {
      const failedRun = createFailedWorkflowRunRecord(action.pendingRun, action.error);

      return {
        ...state,
        activeRun: failedRun,
        runHistory: archiveWorkflowRun(state.runHistory, failedRun),
        runRecords: failedRun.nodeRuns,
      };
    }
    case "workflow-run-stopped": {
      if (!state.activeRun || state.activeRun.status !== "running") {
        return state;
      }

      const stoppedRun = createStoppedWorkflowRunRecord(state.activeRun);

      return {
        ...state,
        activeRun: stoppedRun,
        runHistory: archiveWorkflowRun(state.runHistory, stoppedRun),
        runRecords: stoppedRun.nodeRuns,
      };
    }
    case "history-selected": {
      const nextHistoryRun = state.runHistory.find((run) => run.id === action.runId);

      return nextHistoryRun
        ? {
            ...state,
            historyRun: nextHistoryRun,
          }
        : state;
    }
    case "history-exited":
      return {
        ...state,
        historyRun: null,
      };
    default:
      return state;
  }
}

export function createPendingWorkflowRun({
  draft,
  runId,
}: {
  draft: WorkflowDraft;
  runId: string;
}): WorkflowRunRecord {
  const startedAt = formatRunTime(new Date());
  const draftSnapshot = createWorkflowRunDraftSnapshot(draft);

  return {
    createdAt: startedAt,
    draft: draftSnapshot,
    durationMs: 0,
    finishedAt: "",
    id: runId,
    inputs: createWorkflowInputs(draftSnapshot),
    nodeRuns: Object.fromEntries(
      draftSnapshot.nodes.map((node) => [node.id, createPendingNodeRunRecord(node)]),
    ),
    outputs: {},
    status: "running",
    title: "Test Run",
    totalNodes: draftSnapshot.nodes.length,
    totalSteps: 0,
    totalTokens: 0,
    trace: draftSnapshot.nodes.map((node) => createTraceItemFromNodeRun(
      node,
      createPendingNodeRunRecord(node),
    )),
  };
}

function updateActiveRunNodeRecord(
  activeRun: WorkflowRunRecord | null,
  node: WorkflowNode,
  nodeRun: NodeRunRecord,
): WorkflowRunRecord | null {
  if (!activeRun) {
    return activeRun;
  }

  return {
    ...activeRun,
    nodeRuns: {
      ...activeRun.nodeRuns,
      [node.id]: nodeRun,
    },
    trace: activeRun.trace.map((traceItem) =>
      traceItem.nodeId === node.id
        ? createTraceItemFromNodeRun(node, nodeRun)
        : traceItem,
    ),
  };
}

function removeActiveRunNodeRecord(
  activeRun: WorkflowRunRecord | null,
  nodeId: string,
): WorkflowRunRecord | null {
  if (!activeRun?.nodeRuns[nodeId]) {
    return activeRun;
  }

  const {
    [nodeId]: _deletedRun,
    ...nextNodeRuns
  } = activeRun.nodeRuns;

  return {
    ...activeRun,
    nodeRuns: nextNodeRuns,
    trace: activeRun.trace.filter((traceItem) => traceItem.nodeId !== nodeId),
  };
}

function archiveWorkflowRun(
  runHistory: WorkflowRunRecord[],
  run: WorkflowRunRecord,
): WorkflowRunRecord[] {
  return [
    run,
    ...runHistory.filter((historyRun) => historyRun.id !== run.id),
  ].slice(0, MAX_WORKFLOW_RUN_HISTORY);
}

function normalizeWorkflowRunRecord(
  run: WorkflowRunRecord,
  fallbackRunId: string,
  draft: WorkflowDraft,
): WorkflowRunRecord {
  const draftSnapshot = createWorkflowRunDraftSnapshot(run.draft ?? draft);
  const nodeRuns = normalizeNodeRunRecords(run.nodeRuns);

  return {
    ...run,
    draft: draftSnapshot,
    finishedAt: run.finishedAt || formatRunTime(new Date()),
    id: run.id || fallbackRunId,
    inputs: cloneWorkflowRunPayload(run.inputs),
    nodeRuns,
    outputs: cloneWorkflowRunPayload(run.outputs),
    trace: run.trace.length
      ? run.trace.map(cloneWorkflowRunTraceItem)
      : draftSnapshot.nodes.map((node) => createTraceItemFromNodeRun(
          node,
          nodeRuns[node.id] ?? createPendingNodeRunRecord(node),
        )),
  };
}

function normalizeNodeRunRecords(
  nodeRuns: Record<string, NodeRunRecord>,
): Record<string, NodeRunRecord> {
  return Object.fromEntries(
    Object.entries(nodeRuns).map(([nodeId, nodeRun]) => [
      nodeId,
      {
        ...nodeRun,
        completedAt: nodeRun.completedAt ?? Date.now(),
        logs: [...nodeRun.logs],
      },
    ]),
  );
}

function cloneWorkflowRunTraceItem(
  traceItem: WorkflowRunRecord["trace"][number],
): WorkflowRunRecord["trace"][number] {
  return {
    ...traceItem,
    logs: [...traceItem.logs],
  };
}

function cloneWorkflowRunPayload(payload: Record<string, unknown>) {
  if (typeof structuredClone === "function") {
    return structuredClone(payload);
  }

  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

function createFailedWorkflowRunRecord(
  pendingRun: WorkflowRunRecord,
  error: unknown,
): WorkflowRunRecord {
  const message = error instanceof Error ? error.message : "Workflow 运行失败";
  const finishedAt = formatRunTime(new Date());

  return {
    ...pendingRun,
    durationMs: 0,
    errorMessage: message,
    finishedAt,
    nodeRuns: Object.fromEntries(
      Object.entries(pendingRun.nodeRuns).map(([nodeId, nodeRun]) => [
        nodeId,
        {
          ...nodeRun,
          completedAt: Date.now(),
          errorMessage: message,
          finishedAt,
          logs: ["执行请求失败", message],
          status: "failed",
        } satisfies NodeRunRecord,
      ]),
    ),
    outputs: {},
    status: "failed",
    totalSteps: Object.keys(pendingRun.nodeRuns).length,
    trace: pendingRun.trace.map((traceItem) => ({
      ...traceItem,
      errorMessage: message,
      finishedAt,
      logs: ["执行请求失败", message],
      status: "failed",
    })),
  };
}

function createStoppedWorkflowRunRecord(
  pendingRun: WorkflowRunRecord,
): WorkflowRunRecord {
  const message = "运行已停止";
  const finishedAt = formatRunTime(new Date());

  return {
    ...pendingRun,
    durationMs: 0,
    errorMessage: message,
    finishedAt,
    nodeRuns: Object.fromEntries(
      Object.entries(pendingRun.nodeRuns).map(([nodeId, nodeRun]) => [
        nodeId,
        {
          ...nodeRun,
          completedAt: Date.now(),
          durationMs: 0,
          errorMessage: message,
          finishedAt,
          logs: [...nodeRun.logs, message],
          status: "stopped",
        } satisfies NodeRunRecord,
      ]),
    ),
    outputs: {},
    status: "stopped",
    totalSteps: 0,
    trace: pendingRun.trace.map((traceItem) => ({
      ...traceItem,
      durationMs: 0,
      errorMessage: message,
      finishedAt,
      logs: [...traceItem.logs, message],
      status: "stopped",
    })),
  };
}

function createWorkflowInputs(draft: WorkflowDraft) {
  const trigger = findWorkflowEntryNode(draft.nodes);

  return {
    audience: trigger?.data.audience ?? "当前 Workflow 目标人群",
    nodeCount: draft.nodes.length,
    trigger: trigger?.data.title ?? "Trigger",
  };
}

function createTraceItemFromNodeRun(
  node: WorkflowNode,
  nodeRun: NodeRunRecord,
) {
  return {
    durationMs: nodeRun.durationMs,
    errorMessage: nodeRun.errorMessage,
    finishedAt: nodeRun.finishedAt,
    logs: nodeRun.logs,
    nodeId: node.id,
    nodeTitle: node.data.title,
    nodeType: node.data.kind,
    startedAt: nodeRun.startedAt ? formatRunTime(new Date(nodeRun.startedAt)) : "",
    status: nodeRun.status,
  };
}

function formatRunTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

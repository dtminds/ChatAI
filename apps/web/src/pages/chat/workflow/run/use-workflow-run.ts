import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  WorkflowDraft,
  WorkflowNode,
} from "../types";
import {
  createMockWorkflowRunAdapter,
  type WorkflowRunAdapter,
} from "./workflow-run-adapter";
import {
  createPendingWorkflowRun,
  initialWorkflowRunState,
  workflowRunReducer,
} from "./workflow-run-state";
import {
  createWorkflowNodeRunSnapshot,
  createWorkflowRuntimeSnapshot,
} from "./workflow-run-snapshot";

const defaultWorkflowRunAdapter = createMockWorkflowRunAdapter();

export function useWorkflowRun(
  scopeKey?: string,
  adapter: WorkflowRunAdapter = defaultWorkflowRunAdapter,
) {
  const workflowId = scopeKey ?? "workflow";
  const [state, dispatch] = useReducer(workflowRunReducer, initialWorkflowRunState);
  const scopeVersionRef = useRef(0);
  const nodeRunVersionsRef = useRef<Record<string, number>>({});
  const workflowRunVersionRef = useRef(0);

  useEffect(() => {
    scopeVersionRef.current += 1;
    nodeRunVersionsRef.current = {};
    workflowRunVersionRef.current += 1;
    dispatch({ type: "scope-reset" });
  }, [scopeKey]);

  const runNode = useCallback((node: WorkflowNode) => {
    const nodeSnapshot = createWorkflowNodeRunSnapshot(node);

    if (!nodeSnapshot) {
      return;
    }

    const scopeVersion = scopeVersionRef.current;
    const nodeRunVersion = (nodeRunVersionsRef.current[nodeSnapshot.id] ?? 0) + 1;
    nodeRunVersionsRef.current[nodeSnapshot.id] = nodeRunVersion;

    dispatch({
      node: nodeSnapshot,
      type: "node-run-started",
    });

    void Promise.resolve(adapter.runNode({ node: nodeSnapshot }))
      .then((runRecord) => {
        if (
          scopeVersionRef.current !== scopeVersion
          || nodeRunVersionsRef.current[nodeSnapshot.id] !== nodeRunVersion
        ) {
          return;
        }

        dispatch({
          node: nodeSnapshot,
          record: runRecord,
          type: "node-run-resolved",
        });
      })
      .catch((error: unknown) => {
        if (
          scopeVersionRef.current !== scopeVersion
          || nodeRunVersionsRef.current[nodeSnapshot.id] !== nodeRunVersion
        ) {
          return;
        }

        dispatch({
          error,
          node: nodeSnapshot,
          type: "node-run-rejected",
        });
      });
  }, [adapter]);

  const runWorkflow = useCallback((draft: WorkflowDraft) => {
    const scopeVersion = scopeVersionRef.current;
    const workflowRunVersion = workflowRunVersionRef.current + 1;
    workflowRunVersionRef.current = workflowRunVersion;
    const runtimeSnapshot = createWorkflowRuntimeSnapshot(draft);
    const draftSnapshot = runtimeSnapshot.draft;
    const pendingRun = createPendingWorkflowRun({
      draft: draftSnapshot,
      runId: `${workflowId}-run-${Date.now()}`,
    });

    nodeRunVersionsRef.current = Object.fromEntries(
      draftSnapshot.nodes.map((node) => [node.id, (nodeRunVersionsRef.current[node.id] ?? 0) + 1]),
    );
    dispatch({
      pendingRun,
      type: "workflow-run-started",
    });

    void Promise.resolve(adapter.runWorkflow({ snapshot: runtimeSnapshot, workflowId }))
      .then((workflowRun) => {
        if (
          scopeVersionRef.current !== scopeVersion
          || workflowRunVersionRef.current !== workflowRunVersion
        ) {
          return;
        }

        dispatch({
          draft: draftSnapshot,
          fallbackRunId: pendingRun.id,
          run: workflowRun,
          type: "workflow-run-resolved",
        });
      })
      .catch((error: unknown) => {
        if (
          scopeVersionRef.current !== scopeVersion
          || workflowRunVersionRef.current !== workflowRunVersion
        ) {
          return;
        }

        dispatch({
          error,
          pendingRun,
          type: "workflow-run-rejected",
        });
      });
  }, [adapter, workflowId]);

  const stopWorkflowRun = useCallback(() => {
    if (!state.activeRun || state.activeRun.status !== "running") {
      return;
    }

    workflowRunVersionRef.current += 1;
    const runtimeSnapshot = createWorkflowRuntimeSnapshot(state.activeRun.draft);

    void Promise.resolve(adapter.stopWorkflowRun?.({
      runId: state.activeRun.id,
      snapshot: runtimeSnapshot,
      workflowId,
    })).catch(() => undefined);

    dispatch({ type: "workflow-run-stopped" });
  }, [adapter, state.activeRun, workflowId]);

  const getNodeRun = useCallback(
    (nodeId: string | undefined) => nodeId ? state.runRecords[nodeId] : undefined,
    [state.runRecords],
  );

  const deleteNodeRun = useCallback((nodeId: string) => {
    nodeRunVersionsRef.current[nodeId] = (nodeRunVersionsRef.current[nodeId] ?? 0) + 1;
    dispatch({
      nodeId,
      type: "node-run-deleted",
    });
  }, []);

  const viewRunHistory = useCallback((runId: string) => {
    dispatch({
      runId,
      type: "history-selected",
    });
  }, []);

  const exitRunHistory = useCallback(() => {
    dispatch({ type: "history-exited" });
  }, []);

  return {
    activeRun: state.activeRun,
    deleteNodeRun,
    exitRunHistory,
    getNodeRun,
    historyRun: state.historyRun,
    runHistory: state.runHistory,
    runNode,
    runRecords: state.runRecords,
    runWorkflow,
    stopWorkflowRun,
    viewRunHistory,
  };
}

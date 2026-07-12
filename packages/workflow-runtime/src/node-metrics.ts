import type { WorkflowNodeKind } from "@chatai/contracts";

export type WorkflowNodeMetricDelta = {
  completed: number;
  current: number;
  entered: number;
  nodeId: string;
  passed: number;
};

type WorkflowNodeMetricTransition =
  | {
      kind: "entered" | "completed" | "left-incomplete";
      nodeId: string;
      nodeKind: WorkflowNodeKind;
    }
  | {
      fromNodeId: string;
      fromNodeKind: WorkflowNodeKind;
      kind: "advanced";
      toNodeId: string;
      toNodeKind: WorkflowNodeKind;
    };

export function createNodeMetricDeltas(
  transition: WorkflowNodeMetricTransition,
): WorkflowNodeMetricDelta[] {
  if (transition.kind === "entered") {
    return transition.nodeKind === "start"
      ? [delta(transition.nodeId, { entered: 1 })]
      : [];
  }
  if (transition.kind === "completed") {
    return transition.nodeKind === "end"
      ? [delta(transition.nodeId, { completed: 1 })]
      : [];
  }
  if (transition.kind === "left-incomplete") {
    return isTrackedCurrentNode(transition.nodeKind)
      ? [delta(transition.nodeId, { current: -1 })]
      : [];
  }
  if (transition.kind !== "advanced") return [];

  const deltas: WorkflowNodeMetricDelta[] = [];
  if (isTrackedCurrentNode(transition.fromNodeKind)) {
    deltas.push(delta(transition.fromNodeId, { current: -1, passed: 1 }));
  }
  if (isTrackedCurrentNode(transition.toNodeKind)) {
    deltas.push(delta(transition.toNodeId, { current: 1 }));
  }
  return deltas;
}

function isTrackedCurrentNode(kind: WorkflowNodeKind) {
  return kind !== "start" && kind !== "end";
}

function delta(
  nodeId: string,
  values: Partial<Omit<WorkflowNodeMetricDelta, "nodeId">>,
): WorkflowNodeMetricDelta {
  return {
    completed: values.completed ?? 0,
    current: values.current ?? 0,
    entered: values.entered ?? 0,
    nodeId,
    passed: values.passed ?? 0,
  };
}

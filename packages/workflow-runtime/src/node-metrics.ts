import type { WorkflowNodeKind } from "@chatai/contracts";

export type WorkflowNodeMetricDelta = {
  completed: number;
  current: number;
  entered: number;
  incomplete: number;
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
      ? [delta(transition.nodeId, { current: 1, entered: 1 })]
      : [];
  }
  if (transition.kind === "completed") {
    return transition.nodeKind === "end"
      ? [delta(transition.nodeId, { completed: 1, current: -1 })]
      : [];
  }
  if (transition.kind === "left-incomplete") {
    return [delta(transition.nodeId, { current: -1, incomplete: 1 })];
  }
  if (transition.kind !== "advanced") return [];

  const deltas: WorkflowNodeMetricDelta[] = [];
  deltas.push(delta(transition.fromNodeId, { current: -1, passed: 1 }));
  deltas.push(delta(transition.toNodeId, { current: 1 }));
  return deltas;
}

function delta(
  nodeId: string,
  values: Partial<Omit<WorkflowNodeMetricDelta, "nodeId">>,
): WorkflowNodeMetricDelta {
  return {
    completed: values.completed ?? 0,
    current: values.current ?? 0,
    entered: values.entered ?? 0,
    incomplete: values.incomplete ?? 0,
    nodeId,
    passed: values.passed ?? 0,
  };
}

import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowVariable,
  WorkflowVariables,
} from "./types";
import { getNodeDefinitionCore } from "./node-definition-core";

export type WorkflowVariableContext = {
  currentNode: WorkflowNode;
  currentNodeOutputs: WorkflowVariable[];
  systemVariables: WorkflowVariable[];
  upstreamNodeOutputs: WorkflowVariable[];
  upstreamNodes: WorkflowNode[];
};

export type WorkflowVariableResolution =
  | {
    reason: "empty-selector";
    status: "empty";
  }
  | {
    selector: string[];
    selectorKey: string;
    status: "invalid";
  }
  | {
    selector: string[];
    selectorKey: string;
    status: "resolved";
    variable: WorkflowVariable;
  };

export function getNodeVariables(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariables {
  const context = createWorkflowVariableContext(node, nodes, edges);

  return {
    inputs: [
      ...context.systemVariables,
      ...context.upstreamNodeOutputs,
    ],
    outputs: context.currentNodeOutputs,
  };
}

export function resolveWorkflowVariableSelector(
  variables: WorkflowVariables,
  selector: string[] | null | undefined,
): WorkflowVariableResolution {
  if (!selector?.length) {
    return {
      reason: "empty-selector",
      status: "empty",
    };
  }

  const selectorKey = getWorkflowVariableSelectorKey(selector);
  const variable = [
    ...variables.inputs,
    ...variables.outputs,
  ].find((currentVariable) =>
    currentVariable.selector
    && getWorkflowVariableSelectorKey(currentVariable.selector) === selectorKey,
  );

  if (!variable) {
    return {
      selector,
      selectorKey,
      status: "invalid",
    };
  }

  return {
    selector,
    selectorKey,
    status: "resolved",
    variable,
  };
}

export function getWorkflowVariableSelectorKey(selector: string[]) {
  return selector.join(".");
}

export function createWorkflowVariableContext(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariableContext {
  const upstreamNodes = getBeforeNodesInSameBranch(node.id, nodes, edges);

  return {
    currentNode: node,
    currentNodeOutputs: getNodeOutputVariables(node),
    systemVariables: createSystemVariables(node),
    upstreamNodeOutputs: upstreamNodes.flatMap((upstreamNode) =>
      getNodeOutputVariables(upstreamNode).map((variable) =>
        createNodeScopedVariable(upstreamNode, variable),
      ),
    ),
    upstreamNodes,
  };
}

export function getBeforeNodesInSameBranch(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const upstreamNodes: WorkflowNode[] = [];
  const visitedNodeIds = new Set<string>();

  function visit(currentNodeId: string) {
    const incomingEdges = edges.filter((edge) => edge.target === currentNodeId);

    for (const edge of incomingEdges) {
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode || visitedNodeIds.has(sourceNode.id)) {
        continue;
      }

      visitedNodeIds.add(sourceNode.id);
      visit(sourceNode.id);
      upstreamNodes.push(sourceNode);
    }
  }

  visit(nodeId);
  return upstreamNodes;
}

export function getNodeOutputVariables(node: WorkflowNode): WorkflowVariable[] {
  return (getNodeDefinitionCore(node.data.kind).getOutputVariables?.(node) ?? createFallbackOutputVariables(node))
    .map((variable) => createNodeScopedVariable(node, variable));
}

function createNodeScopedVariable(
  node: WorkflowNode,
  variable: WorkflowVariable,
): WorkflowVariable {
  return {
    ...variable,
    name: variable.scope === "node"
      ? variable.name
      : `${node.data.kind}.${node.id}.${variable.name}`,
    scope: "node",
    selector: variable.selector ?? [node.id, variable.name],
    sourceNodeId: node.id,
    sourceNodeTitle: node.data.title,
  };
}

function createSystemVariables(node: WorkflowNode): WorkflowVariable[] {
  return [
    {
      name: "customer.profile",
      scope: "system",
      selector: ["customer", "profile"],
      type: "object",
      value: node.data.audience ?? "上游客户画像",
    },
    {
      name: "journey.currentNode",
      scope: "system",
      selector: ["journey", "currentNode"],
      type: "string",
      value: node.data.title,
    },
  ];
}

function createFallbackOutputVariables(node: WorkflowNode): WorkflowVariable[] {
  return [
    {
      name: "result",
      type: "object",
      value: node.data.metric,
    },
    {
      name: "journey.next",
      type: "string",
      value: node.data.kind === "goal" ? "退出旅程" : "进入下一节点",
    },
  ];
}

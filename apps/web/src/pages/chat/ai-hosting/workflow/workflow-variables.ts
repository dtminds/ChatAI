import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowVariable,
  WorkflowVariables,
} from "./types";

export function getNodeVariables(
  node: WorkflowNode,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowVariables {
  const upstreamNodes = getBeforeNodesInSameBranch(node.id, nodes, edges);

  return {
    inputs: [
      {
        name: "customer.profile",
        type: "object",
        value: node.data.audience ?? "上游客户画像",
      },
      {
        name: "journey.currentNode",
        type: "string",
        value: node.data.title,
      },
      ...upstreamNodes.map(createUpstreamVariable),
    ],
    outputs: getNodeOutputVariables(node),
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
  return [
    {
      name: `${node.data.kind}.result`,
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

function createUpstreamVariable(node: WorkflowNode): WorkflowVariable {
  return {
    name: `${node.data.kind}.${node.id}.result`,
    type: "object",
    value: node.data.metric,
  };
}

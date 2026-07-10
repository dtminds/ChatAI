import { describe, expect, it } from "vitest";
import {
  createEdge,
  createNodeFromKind,
} from "@/pages/chat/workflow/graph";
import {
  WORKFLOW_NODE_TYPE,
} from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { computeWorkflowLayout } from "@/pages/chat/workflow/workflow-layout";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

function createGoalNode(id: string, x = 0, y = 0): WorkflowNode {
  return {
    data: createDefaultNodeData("end"),
    id,
    position: { x, y },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("workflow layout", () => {
  it("places nodes by graph order instead of node insertion order", () => {
    const waitNode = createNodeFromKind("wait", "wait", 1);
    const insertedNode = createNodeFromKind("message", "inserted-message", 3);
    const startNode = {
      data: createDefaultNodeData("start"),
      id: "start",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    } satisfies WorkflowNode;
    const endNode = createGoalNode("end", 930, 0);

    const layout = computeWorkflowLayout(
      [
        startNode,
        waitNode,
        endNode,
        insertedNode,
      ],
      [
        createEdge("start", "inserted-message"),
        createEdge("inserted-message", "wait"),
        createEdge("wait", "end"),
      ],
    );

    expect(layout.nodes.get("inserted-message")?.layer).toBe(1);
    expect(layout.nodes.get("wait")?.layer).toBe(2);
    expect(layout.nodes.get("inserted-message")?.x).toBeLessThan(layout.nodes.get("wait")!.x);
  });

  it("keeps branch paths ordered by handle and centers merged targets", () => {
    const branchNode = createNodeFromKind("branch", "branch", 0);
    const highAction = createNodeFromKind("message", "high-message", 3);
    const normalAction = createNodeFromKind("message", "normal-message", 1);
    const defaultAction = createNodeFromKind("message", "default-message", 2);
    const endNode = createGoalNode("end", 1240, 320);

    const layout = computeWorkflowLayout(
      [
        branchNode,
        endNode,
        defaultAction,
        normalAction,
        highAction,
      ],
      [
        createEdge("branch", "high-message", "高意向", { sourceHandle: "branch-high" }),
        createEdge("branch", "normal-message", "普通", { sourceHandle: "branch-normal" }),
        createEdge("branch", "default-message", "默认", { sourceHandle: "branch-default" }),
        createEdge("high-message", "end"),
        createEdge("normal-message", "end"),
        createEdge("default-message", "end"),
      ],
    );

    expect(layout.nodes.get("high-message")!.y).toBeLessThan(layout.nodes.get("normal-message")!.y);
    expect(layout.nodes.get("normal-message")!.y).toBeLessThan(layout.nodes.get("default-message")!.y);
    expect(layout.nodes.get("end")?.lane).toBe(0);
    expect(layout.nodes.get("end")?.y).toBe(0);
  });
});

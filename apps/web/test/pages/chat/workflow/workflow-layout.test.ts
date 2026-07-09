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
    data: createDefaultNodeData("goal"),
    id,
    position: { x, y },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("workflow layout", () => {
  it("places nodes by graph order instead of node insertion order", () => {
    const waitNode = createNodeFromKind("wait", "wait", 1);
    const insertedNode = createNodeFromKind("action", "inserted-action", 3);
    const triggerNode = {
      data: createDefaultNodeData("trigger"),
      id: "trigger",
      position: { x: 0, y: 0 },
      type: WORKFLOW_NODE_TYPE,
    } satisfies WorkflowNode;
    const goalNode = createGoalNode("goal", 930, 0);

    const layout = computeWorkflowLayout(
      [
        triggerNode,
        waitNode,
        goalNode,
        insertedNode,
      ],
      [
        createEdge("trigger", "inserted-action"),
        createEdge("inserted-action", "wait"),
        createEdge("wait", "goal"),
      ],
    );

    expect(layout.nodes.get("inserted-action")?.layer).toBe(1);
    expect(layout.nodes.get("wait")?.layer).toBe(2);
    expect(layout.nodes.get("inserted-action")?.x).toBeLessThan(layout.nodes.get("wait")!.x);
  });

  it("keeps branch paths ordered by handle and centers merged targets", () => {
    const branchNode = createNodeFromKind("branch", "branch", 0);
    const highAction = createNodeFromKind("action", "high-action", 3);
    const normalAction = createNodeFromKind("action", "normal-action", 1);
    const defaultAction = createNodeFromKind("action", "default-action", 2);
    const goalNode = createGoalNode("goal", 1240, 320);

    const layout = computeWorkflowLayout(
      [
        branchNode,
        goalNode,
        defaultAction,
        normalAction,
        highAction,
      ],
      [
        createEdge("branch", "high-action", "高意向", { sourceHandle: "branch-high" }),
        createEdge("branch", "normal-action", "普通", { sourceHandle: "branch-normal" }),
        createEdge("branch", "default-action", "默认", { sourceHandle: "branch-default" }),
        createEdge("high-action", "goal"),
        createEdge("normal-action", "goal"),
        createEdge("default-action", "goal"),
      ],
    );

    expect(layout.nodes.get("high-action")!.y).toBeLessThan(layout.nodes.get("normal-action")!.y);
    expect(layout.nodes.get("normal-action")!.y).toBeLessThan(layout.nodes.get("default-action")!.y);
    expect(layout.nodes.get("goal")?.lane).toBe(0);
    expect(layout.nodes.get("goal")?.y).toBe(0);
  });
});

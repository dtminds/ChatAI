import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { BranchConfig } from "@/pages/chat/workflow/panels/node-settings/branch-panel";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

function createBranchNode(): WorkflowNode<"branch"> {
  return {
    data: {
      ...createDefaultNodeData("branch"),
      branchPaths: [
        {
          conditions: [{
            id: "condition-high",
            operator: "equals",
            selector: ["customer", "name"],
            value: "高意向",
          }],
          id: "branch-high",
          label: "如果",
          logic: "all",
        },
        {
          conditions: [{
            id: "condition-normal",
            operator: "equals",
            selector: ["customer", "name"],
            value: "普通客户",
          }],
          id: "branch-normal",
          label: "否则如果",
          logic: "all",
        },
        {
          conditions: [],
          id: "branch-default",
          isDefault: true,
          label: "否则",
          logic: "all",
        },
      ],
    },
    id: "branch-intent",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("BranchConfig", () => {
  it("confirms deletion of a connected path and removes it", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const branchNode = createBranchNode();

    render(
      <BranchConfig
        edges={[
          createEdge("branch-intent", "message-welcome", "如果", {
            sourceHandle: "branch-high",
          }),
        ]}
        node={branchNode}
        nodes={[branchNode]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "删除如果 1" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(onNodeChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "确认删除" }));

    expect(onNodeChange).toHaveBeenCalledWith({
      branchPaths: [
        expect.objectContaining({ id: "branch-normal", label: "如果" }),
        expect.objectContaining({ id: "branch-default", isDefault: true, label: "否则" }),
      ],
    });
  });

  it("adds a fixed-label conditional path before the fallback", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const branchNode = createBranchNode();

    render(
      <BranchConfig
        edges={[]}
        node={branchNode}
        nodes={[branchNode]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加分支" }));

    expect(onNodeChange).toHaveBeenCalledWith({
      branchPaths: [
        expect.objectContaining({ id: "branch-high", label: "如果" }),
        expect.objectContaining({ id: "branch-normal", label: "否则如果" }),
        expect.objectContaining({ label: "否则如果" }),
        expect.objectContaining({ id: "branch-default", isDefault: true, label: "否则" }),
      ],
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createEdge } from "@/pages/chat/workflow/graph";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { BranchConfig } from "@/pages/chat/workflow/panels/node-settings/branch-panel";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

function createBranchNode(): WorkflowNode {
  return {
    data: createDefaultNodeData("branch"),
    id: "branch-intent",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("BranchConfig", () => {
  it("prevents deleting connected branch paths and emits added branch paths", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(
      <BranchConfig
        edges={[
          createEdge("branch-intent", "action-message", "高意向客户", {
            sourceHandle: "branch-high",
          }),
        ]}
        node={createBranchNode()}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("button", { name: "删除高意向客户" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "添加分支" }));

    expect(onNodeChange).toHaveBeenCalledWith({
      branchPaths: expect.arrayContaining([
        expect.objectContaining({ id: "branch-high" }),
        expect.objectContaining({ id: "branch-normal" }),
        expect.objectContaining({ id: "branch-default", isDefault: true }),
        expect.objectContaining({ label: "新分支 3" }),
      ]),
    });
  });
});

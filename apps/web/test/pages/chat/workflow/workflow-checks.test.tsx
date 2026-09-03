import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkflowChecks } from "@/pages/chat/workflow/canvas/workflow-checks";

describe("WorkflowChecks", () => {
  it("uses the node icon and navigates from a grouped node issue", async () => {
    const user = userEvent.setup();
    const onNavigateToNode = vi.fn();

    render(
      <WorkflowChecks
        checks={[{
          blocksPublish: true,
          category: "config",
          description: "fixture issue one",
          id: "node-intent",
          messages: [
            "fixture issue one",
            "fixture issue two",
          ],
          nodeId: "intent",
          nodeKind: "ai-intent",
          status: "warning",
          title: "测试节点",
        }]}
        onClose={vi.fn()}
        onNavigateToNode={onNavigateToNode}
        publishAttempted
      />,
    );

    const nodeIssue = screen.getByRole("button", { name: /测试节点/ });
    expect(nodeIssue.querySelector('[data-node-icon-kind="ai-intent"]')).toBeInTheDocument();

    await user.click(nodeIssue);

    expect(onNavigateToNode).toHaveBeenCalledWith("intent");
  });
});

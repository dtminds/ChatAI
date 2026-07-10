import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: createDefaultNodeData("start"),
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("StartConfig", () => {
  it("renders the custom start node settings sections", () => {
    render(
      <StartConfig
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("托管账号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择托管账号" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "目标人群" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "按事件筛选" })).toBeChecked();
    expect(screen.getByText("添加标签")).toBeInTheDocument();
    expect(screen.getByText("用户输入")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /限制次数/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /同一客户进入此SOP最多/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "消息发送时段" })).toBeInTheDocument();
    expect(screen.getByText("09:00:00")).toBeInTheDocument();
    expect(screen.getByText("18:00:00")).toBeInTheDocument();
  });
});

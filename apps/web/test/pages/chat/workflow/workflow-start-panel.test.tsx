import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

function createStartNode(): WorkflowNode<"start"> {
  return {
    data: {
      ...createDefaultNodeData("start"),
      triggers: [{ tagIds: [], type: "customer.tag_added" }],
    },
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("StartConfig", () => {
  it("renders the formal start node settings sections", async () => {
    render(
      <StartConfig
        accounts={[]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={vi.fn()}
        tags={[]}
      />,
    );

    expect(screen.getByText("托管账号")).toBeInTheDocument();
    expect(screen.getByText("暂无可用托管账号")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "触发条件" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "添加好友" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "添加标签" })).toBeInTheDocument();
    expect(screen.getByText("暂无可用标签")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "用户发送消息" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "消息包含关键词" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入限制" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "最多进入 M 次" })).toBeChecked();
  });
});

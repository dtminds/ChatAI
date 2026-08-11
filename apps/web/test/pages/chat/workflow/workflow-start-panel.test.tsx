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
      triggers: [{ tagIds: [], type: "contact.tag_added" }],
    },
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function createStartNodeWithoutTagTrigger(): WorkflowNode<"start"> {
  const node = createStartNode();
  return { ...node, data: { ...node.data, triggers: [] } };
}

describe("StartConfig", () => {
  it("renders the formal start node settings sections", async () => {
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        seats={[]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={vi.fn()}
        tags={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "席位" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "触发条件" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "添加好友" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "添加标签" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "用户发送消息" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "消息包含关键词" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "进入限制" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "最多进入 M 次" })).toBeChecked();
  });

  it("does not allow enabling a tag trigger when no tags are available", () => {
    const node = createStartNodeWithoutTagTrigger();
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        seats={[]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={vi.fn()}
        tags={[]}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "添加标签" })).toBeDisabled();
  });
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    const user = userEvent.setup();
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        seats={[]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "托管账号" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "事件触发" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "导入人群" })).toBeEnabled();
    await user.click(screen.getByRole("combobox", { name: "选择事件" }));
    expect(screen.getByRole("option", { name: "添加好友" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "添加标签" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "用户发送消息" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("heading", { name: "进入限制" })).toBeInTheDocument();
    expect(within(screen.getByRole("radiogroup", { name: "进入限制" }))
      .getByRole("radio", { checked: true }))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "最多进入次数" })).toHaveTextContent("1次");
    expect(screen.getByRole("spinbutton", { name: "时间范围" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "时间单位" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "时间范围内最多进入次数" }))
      .toBeDisabled();
  });

  it("switches between event and audience import entry settings", async () => {
    const user = userEvent.setup();
    const node = createStartNode();
    const onNodeChange = vi.fn();
    const { rerender } = render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "导入人群" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryMode: "audience-import",
      triggers: [],
    }));

    const audienceNode = {
      ...node,
      data: { ...node.data, entryMode: "audience-import" as const, triggers: [] },
    };
    rerender(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={audienceNode}
        nodes={[audienceNode]}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "选择事件" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "事件触发" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryMode: "event",
      triggers: [],
    }));
  });

  it("allows selecting the tag event before its remote tags are loaded", async () => {
    const user = userEvent.setup();
    const node = createStartNodeWithoutTagTrigger();
    const onNodeChange = vi.fn();
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        seats={[]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "选择事件" }));
    await user.click(screen.getByRole("option", { name: "添加标签" }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      triggers: [{ tagIds: [], type: "contact.tag_added" }],
    }));
  });
});

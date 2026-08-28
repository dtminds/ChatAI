import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData } from "@/pages/chat/workflow/node-definitions";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import type { WorkflowNode } from "@/pages/chat/workflow/types";

const directEntryApiMock = vi.hoisted(() => ({
  getWorkflowDirectEntryEndpoint: vi.fn(),
}));

vi.mock("@/pages/chat/workflow/nodes/start/direct-entry-api", () => directEntryApiMock);

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
  beforeEach(() => {
    directEntryApiMock.getWorkflowDirectEntryEndpoint.mockReset();
    directEntryApiMock.getWorkflowDirectEntryEndpoint.mockResolvedValue({
      endpointKey: "java+/workflow-31=",
    });
  });

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
    expect(screen.queryByRole("radio", { name: "导入人群" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "外部推送" })).toBeEnabled();
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

  it("switches to direct push and builds the public endpoint from the returned key", async () => {
    const user = userEvent.setup();
    const node = createStartNode();
    const onNodeChange = vi.fn();
    const { rerender } = render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
        workflowId="31"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "外部推送" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryMode: "direct-push",
      triggers: [],
    }));

    const directNode = {
      ...node,
      data: { ...node.data, entryMode: "direct-push" as const, triggers: [] },
    };
    rerender(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added"]}
        edges={[]}
        node={directNode}
        nodes={[directNode]}
        onNodeChange={onNodeChange}
        workflowId="31"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "推送地址" })).toHaveValue(
        `${window.location.origin}/workflow/endpoint?key=java%2B%2Fworkflow-31%3D`,
      );
    });
    expect(directEntryApiMock.getWorkflowDirectEntryEndpoint).toHaveBeenCalledWith("31");
    expect(screen.getByRole("button", { name: "复制推送地址" })).toBeEnabled();
  });

  it("allows retrying a failed direct-entry key request", async () => {
    directEntryApiMock.getWorkflowDirectEntryEndpoint
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({ endpointKey: "java.key-2" });
    const user = userEvent.setup();
    const node = createStartNode();
    const directNode = {
      ...node,
      data: { ...node.data, entryMode: "direct-push" as const, triggers: [] },
    };
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added"]}
        edges={[]}
        node={directNode}
        nodes={[directNode]}
        onNodeChange={vi.fn()}
        workflowId="31"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "重试" }));
    expect(await screen.findByRole("textbox", { name: "推送地址" })).toHaveValue(
      `${window.location.origin}/workflow/endpoint?key=java.key-2`,
    );
    expect(directEntryApiMock.getWorkflowDirectEntryEndpoint).toHaveBeenCalledTimes(2);
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

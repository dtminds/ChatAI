import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import {
  areWorkflowStartFixturesEnabled,
  getWorkflowStartFixtureSeats,
  getWorkflowStartFixtureTags,
  getWorkflowStartFixtureWorkUsers,
} from "@/pages/chat/workflow/nodes/start/fixture-options";
import { createStartNodeData } from "@/pages/chat/workflow/nodes/start/definition";
import type { StartNodeData, WorkflowNode } from "@/pages/chat/workflow/types";

function createStartNode(data: StartNodeData = createDefaultNodeData("start")): WorkflowNode<"start"> {
  return {
    data,
    id: "start",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

describe("workflow start configuration", () => {
  it("exposes fixture options only through the explicit environment switch", () => {
    expect(areWorkflowStartFixturesEnabled("true")).toBe(true);
    expect(areWorkflowStartFixturesEnabled("false")).toBe(false);
    expect(getWorkflowStartFixtureSeats(true)).not.toHaveLength(0);
    expect(getWorkflowStartFixtureWorkUsers(true)).not.toHaveLength(0);
    expect(getWorkflowStartFixtureTags(true)).not.toHaveLength(0);
    expect(getWorkflowStartFixtureSeats(false)).toEqual([]);
    expect(getWorkflowStartFixtureWorkUsers(false)).toEqual([]);
    expect(getWorkflowStartFixtureTags(false)).toEqual([]);
  });

  it("creates the formal execution contract with a default lifetime limit of one", () => {
    const definition = getNodeDefinition("start");
    const data = definition.createDefaultData();

    expect(projectWorkflowNodeExecutionConfig({
      data,
      kind: "start",
      workflowType: "chatai_sop",
    })).toEqual({
      entryPolicy: { maxEntries: 1, mode: "lifetime_limit" },
      seatIds: [],
      triggers: data.triggers,
    });
  });

  it("updates seats and replaces the selected Start Event", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "销售一组" }));
    await user.click(screen.getByRole("radio", { name: "用户发送消息" }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      seatIds: [101],
      status: "warning",
    }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      metric: "待配置触发条件",
      triggers: [{ keywords: [], type: "message.received" }],
    }));

    await user.click(screen.getByRole("radio", { name: "添加好友" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      triggers: [{ sourceIds: [], type: "contact.friend_added" }],
    }));
  });

  it("uses work users and excludes message events for a WeCom start", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createStartNode(createStartNodeData("wecom_sop"));
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "企微成员一" }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({ workUserIds: [201] }));
    expect(screen.queryByRole("radio", { name: "用户发送消息" })).not.toBeInTheDocument();
  });

  it("only exposes entry events allowed by the Workflow capability profile", () => {
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added"]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "添加好友" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "添加标签" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "用户发送消息" })).not.toBeInTheDocument();
  });

  it("normalizes comma-separated source IDs and keywords on blur", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const { rerender } = render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "message.received"]}
        edges={[]}
        node={createStartNode({
          ...createStartNodeData("chatai_sop"),
          triggers: [{ sourceIds: [], type: "contact.friend_added" }],
        })}
        nodes={[]}
        onNodeChange={onNodeChange}
      />,
    );

    const sourceInput = screen.getByRole("textbox", { name: "添加好友来源 ID" });
    await user.type(sourceInput, " qr-1,qr-1, store-2 ,");
    await user.tab();
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      triggers: [{ sourceIds: ["qr-1", "store-2"], type: "contact.friend_added" }],
    }));

    rerender(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "message.received"]}
        edges={[]}
        node={createStartNode({
          ...createStartNodeData("chatai_sop"),
          triggers: [{ keywords: [], type: "message.received" }],
        })}
        nodes={[]}
        onNodeChange={onNodeChange}
      />,
    );
    const keywordInput = screen.getByRole("textbox", { name: "消息关键词" });
    await user.type(keywordInput, " 价格,优惠,价格 ");
    await user.tab();
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      triggers: [{ keywords: ["价格", "优惠"], type: "message.received" }],
    }));
  });

  it("supports rolling-window entry limits", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "时间范围内限制" }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      entryPolicy: {
        maxEntries: 1,
        mode: "rolling_window",
        windowSize: 7,
        windowUnit: "day",
      },
    }));
  });

  it("limits entry counts to the shared 1-10 options", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createStartNode({
      ...createDefaultNodeData("start"),
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
    });
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "最多进入次数" }));

    expect(screen.getAllByRole("option")).toHaveLength(10);
    await user.click(screen.getByRole("option", { name: "3次" }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryPolicy: { maxEntries: 3, mode: "lifetime_limit" },
    }));
  });

  it("updates the rolling-window count from the same bounded selector", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createStartNode({
      ...createDefaultNodeData("start"),
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 7,
        windowUnit: "day",
      },
    });
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    expect(screen.getByRole("combobox", { name: "最多进入次数" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "时间范围内最多进入次数" }))
      .toBeEnabled();

    await user.click(screen.getByRole("combobox", { name: "时间范围内最多进入次数" }));
    await user.click(screen.getByRole("option", { name: "10次" }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryPolicy: {
        maxEntries: 10,
        mode: "rolling_window",
        windowSize: 7,
        windowUnit: "day",
      },
    }));
  });

  it("clamps rolling windows to 90 days when changing units", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    const node = createStartNode({
      ...createDefaultNodeData("start"),
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 2_160,
        windowUnit: "hour",
      },
    });
    render(
      <StartConfig
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "时间单位" }));
    await user.click(screen.getByRole("option", { name: "天" }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 90,
        windowUnit: "day",
      },
    }));
  });
});

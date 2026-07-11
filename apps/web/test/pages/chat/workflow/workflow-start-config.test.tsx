import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { StartConfig } from "@/pages/chat/workflow/nodes/start/panel";
import {
  areWorkflowStartFixturesEnabled,
  getWorkflowStartFixtureAccounts,
  getWorkflowStartFixtureTags,
} from "@/pages/chat/workflow/nodes/start/fixture-options";
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
    expect(getWorkflowStartFixtureAccounts(true)).not.toHaveLength(0);
    expect(getWorkflowStartFixtureTags(true)).not.toHaveLength(0);
    expect(getWorkflowStartFixtureAccounts(false)).toEqual([]);
    expect(getWorkflowStartFixtureTags(false)).toEqual([]);
  });

  it("creates the formal execution contract with a default lifetime limit of two", () => {
    const definition = getNodeDefinition("start");
    const data = definition.createDefaultData();

    expect(definition.createExecutionConfig(data)).toEqual({
      accountIds: data.accountIds,
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
      triggers: data.triggers,
    });
  });

  it("updates selected accounts and OR trigger options through the settings panel", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StartConfig
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "销售一组" }));
    await user.click(screen.getByRole("checkbox", { name: "用户发送消息" }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      accountIds: expect.any(Array),
      status: "warning",
    }));
    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      metric: "待配置触发条件",
      triggers: expect.arrayContaining([
        expect.objectContaining({ match: "any", type: "message.received" }),
      ]),
    }));
  });

  it("supports rolling-window entry limits", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(
      <StartConfig
        edges={[]}
        node={createStartNode()}
        nodes={[createStartNode()]}
        onNodeChange={onNodeChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "时间范围内限制" }));

    expect(onNodeChange).toHaveBeenCalledWith(expect.objectContaining({
      entryPolicy: {
        maxEntries: 2,
        mode: "rolling_window",
        windowSize: 7,
        windowUnit: "day",
      },
    }));
  });

  it("normalizes entry limits to positive contract integers", async () => {
    const onNodeChange = vi.fn();
    const node = createStartNode({
      ...createDefaultNodeData("start"),
      entryPolicy: { maxEntries: 2, mode: "lifetime_limit" },
    });
    render(
      <StartConfig
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={onNodeChange}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "最多进入次数" });
    fireEvent.change(input, { target: { value: "3.8" } });

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      entryPolicy: { maxEntries: 3, mode: "lifetime_limit" },
    }));
  });
});

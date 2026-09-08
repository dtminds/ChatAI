import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_WAIT_DURATION_MAX_BY_UNIT } from "@chatai/contracts";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { WaitConfig } from "@/pages/chat/workflow/nodes/wait/panel";
import { waitNodeUi } from "@/pages/chat/workflow/nodes/wait/ui";
import { NodeConfigPanel } from "@/pages/chat/workflow/panels";
import type { WaitNodeData, WorkflowNode, WorkflowNodeConfigPatch } from "@/pages/chat/workflow/types";

describe("workflow wait node", () => {
  it("configures fixed-time waits and exposes the schedule on the node body", async () => {
    const user = userEvent.setup();
    const { node, onNodeChange } = renderWaitConfig();

    expect(screen.getByRole("radio", { name: "常规时长等待" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "固定时间等待" }));

    const dayOffsetInput = screen.getByRole("spinbutton", { name: "等待天数" });
    await user.clear(dayOffsetInput);
    await user.type(dayOffsetInput, "2");
    await user.click(screen.getByRole("button", { name: "执行时间" }));
    await user.click(screen.getByRole("button", { name: /20\s*时/ }));
    await user.click(screen.getByRole("button", { name: /00\s*分/ }));
    await user.click(screen.getByRole("button", { name: "执行时间确认" }));

    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    }));
    expect(waitBodyText({
      ...node.data,
      dayOffset: 2,
      mode: "fixed-time",
      time: "20:00",
    })).toBe("2 天后的 20:00，执行后续节点");
  });

  it("limits regular wait duration by the selected unit", async () => {
    const user = userEvent.setup();
    renderWaitConfig();
    const durationInput = screen.getByRole("spinbutton", { name: "等待时长" });

    await user.click(screen.getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "分钟" }));
    fireEvent.change(durationInput, { target: { value: "96" } });
    fireEvent.blur(durationInput);
    await user.click(screen.getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "小时" }));

    expect(durationInput).toHaveAttribute("max", String(WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.hour));
    expect(durationInput).toHaveValue(96);

    await user.click(screen.getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "天" }));
    expect(durationInput).toHaveAttribute("max", String(WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.day));
    expect(durationInput).toHaveValue(WORKFLOW_WAIT_DURATION_MAX_BY_UNIT.day);
  });

  it("disables wait settings while the inspector is read-only", () => {
    render(
      <NodeConfigPanel
        allowedEntryEventTypes={["contact.friend_added", "contact.tag_added", "message.received"]}
        edges={[]}
        node={createWaitNode()}
        nodes={[createWaitNode()]}
        onClose={vi.fn()}
        onNodeChange={vi.fn()}
        onRenameNode={vi.fn()}
        readOnly
      />,
    );

    const panel = screen.getByRole("complementary", { name: "节点配置" });
    expect(within(panel).getByRole("spinbutton", { name: "等待时长" })).toBeDisabled();
  });
});

function renderWaitConfig(node = createWaitNode()) {
  const onNodeChange = vi.fn();
  render(
    <WaitConfigFixture
      node={node}
      onNodeChange={onNodeChange}
    />,
  );
  return { node, onNodeChange };
}

function WaitConfigFixture({
  node,
  onNodeChange,
}: {
  node: WorkflowNode<"wait">;
  onNodeChange: (patch: WorkflowNodeConfigPatch<"wait">) => void;
}) {
  const [currentNode, setCurrentNode] = useState(node);

  return (
    <WaitConfig
      edges={[]}
      node={currentNode}
      nodes={[currentNode]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setCurrentNode((current) => ({
          ...current,
          data: { ...current.data, ...patch },
        }));
      }}
    />
  );
}

function createWaitNode(): WorkflowNode<"wait"> {
  const node = createNodeFromKind("wait", "wait-2d", 0);
  return {
    ...node,
    data: {
      ...node.data,
      duration: 2,
      metric: "2 天后唤醒",
      title: "观察期",
      unit: "day",
    },
  };
}

function waitBodyText(data: WaitNodeData) {
  if (waitNodeUi.body.kind !== "fields") {
    throw new Error("wait node body is not field-based");
  }

  const value = waitNodeUi.body.getFields(data)[0]?.value;
  if (!value || value.kind !== "text") {
    throw new Error("wait node body did not expose a text schedule");
  }

  return value.text;
}

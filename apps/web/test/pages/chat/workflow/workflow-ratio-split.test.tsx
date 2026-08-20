import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { HierarchySquare08Icon } from "@hugeicons/core-free-icons";
import { describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { RatioSplitConfig } from "@/pages/chat/workflow/nodes/ratio-split/panel";
import {
  addWorkflowRatioSplitGroup,
  removeWorkflowRatioSplitGroup,
} from "@/pages/chat/workflow/nodes/ratio-split/groups";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

describe("workflow Ratio Split node", () => {
  it("registers the requested visual and two complete default groups", () => {
    const definition = getNodeDefinition("ratio-split");
    const data = definition.createDefaultData();
    const groups = [
      { basisPoints: 5_000, id: "ratio-a", label: "A 组" },
      { basisPoints: 5_000, id: "ratio-b", label: "B 组" },
    ];

    expect(definition.visual.icon).toBe(HierarchySquare08Icon);
    expect(data).toMatchObject({ groups, schemaVersion: 1, status: "ready" });
    expect(definition.getSourceHandles(data)).toEqual([
      expect.objectContaining({ id: "ratio-a", isDefault: true, label: "A 组" }),
      expect.objectContaining({ id: "ratio-b", label: "B 组" }),
    ]);
    expect(definition.getSourceHandles({
      ...data,
      groups: [...groups, { basisPoints: 0, id: "ratio-c", label: "C 组" }],
    })).toHaveLength(3);
    expect(projectWorkflowNodeExecutionConfig({ data, kind: "ratio-split" })).toEqual({ groups });
    expect(definition.getOutputVariables).toBeUndefined();
  });

  it("adds a third stable group and edits every allocation explicitly", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(<StatefulRatioSplitConfig onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("button", { name: "添加分组" }));
    expect(screen.getAllByRole("textbox", { name: "分组名称" })).toHaveLength(3);
    expect(screen.getByText("比例合计 100%")).toBeInTheDocument();

    const labels = screen.getAllByRole("textbox", { name: "分组名称" });
    await user.clear(labels[2]!);
    await user.type(labels[2]!, "观察组");

    const percentages = screen.getAllByRole("textbox", { name: "分流比例" });
    await user.clear(percentages[0]!);
    await user.type(percentages[0]!, "40");
    await user.clear(percentages[1]!);
    await user.type(percentages[1]!, "40");
    await user.clear(percentages[2]!);
    await user.type(percentages[2]!, "20");

    expect(onNodeChange).toHaveBeenLastCalledWith({
      groups: [
        { basisPoints: 4_000, id: "ratio-a", label: "A 组" },
        { basisPoints: 4_000, id: "ratio-b", label: "B 组" },
        expect.objectContaining({ basisPoints: 2_000, label: "观察组" }),
      ],
    });
    expect(screen.getByText("比例合计 100%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加分组" }));
    await user.click(screen.getByRole("button", { name: "添加分组" }));
    expect(screen.getAllByRole("textbox", { name: "分组名称" })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "添加分组" })).toBeDisabled();
  });

  it("confirms deletion when the removable group already has a downstream edge", async () => {
    const user = userEvent.setup();
    render(<StatefulRatioSplitConfig connectedThirdGroup />);

    await user.click(screen.getByRole("button", { name: "添加分组" }));
    const deleteButtons = screen.getAllByRole("button", { name: /^删除/ });
    await user.click(deleteButtons[2]!);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认删除" }));
    expect(screen.getAllByRole("textbox", { name: "分组名称" })).toHaveLength(2);
  });

  it("never reuses a deleted group outlet ID", () => {
    const defaults = createDefaultNodeData("ratio-split").groups;
    const firstAddition = addWorkflowRatioSplitGroup(defaults);
    const deletedId = firstAddition[2]!.id;
    const secondAddition = addWorkflowRatioSplitGroup(
      removeWorkflowRatioSplitGroup(firstAddition, deletedId),
    );

    expect(secondAddition[2]!.id).not.toBe(deletedId);
  });
});

function createRatioSplitNode(): WorkflowNode<"ratio-split"> {
  return {
    data: createDefaultNodeData("ratio-split"),
    id: "ratio-split",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function StatefulRatioSplitConfig({
  connectedThirdGroup = false,
  onNodeChange = () => {},
}: {
  connectedThirdGroup?: boolean;
  onNodeChange?: (patch: WorkflowNodeConfigPatch<"ratio-split">) => void;
}) {
  const [node, setNode] = useState(createRatioSplitNode);
  const thirdGroupId = node.data.groups[2]?.id;
  const edges: WorkflowEdge[] = connectedThirdGroup && thirdGroupId
    ? [{
        id: "third-group-edge",
        source: node.id,
        sourceHandle: thirdGroupId,
        target: "end",
      }]
    : [];
  return (
    <RatioSplitConfig
      edges={edges}
      node={node}
      nodes={[node]}
      onNodeChange={(patch) => {
        onNodeChange(patch);
        setNode(current => ({
          ...current,
          data: { ...current.data, ...patch },
        }));
      }}
    />
  );
}

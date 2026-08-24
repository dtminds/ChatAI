import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { AudienceFilterNodeBody } from "@/pages/chat/workflow/nodes/audience-filter/body";
import {
  AUDIENCE_FILTER_MATCHED_HANDLE_ID,
  AUDIENCE_FILTER_UNMATCHED_HANDLE_ID,
} from "@/pages/chat/workflow/nodes/audience-filter/config";
import { AudienceFilterConfig } from "@/pages/chat/workflow/nodes/audience-filter/panel";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

const listWorkflowAudienceGroups = vi.fn();

vi.mock("@/pages/chat/workflow/nodes/audience-filter/api", () => ({
  listWorkflowAudienceGroups: (...args: unknown[]) => listWorkflowAudienceGroups(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("workflow Audience Filter node", () => {
  beforeEach(() => {
    listWorkflowAudienceGroups.mockReset();
    vi.mocked(toast.error).mockReset();
    listWorkflowAudienceGroups.mockResolvedValue([
      { id: 301, name: "高价值客户" },
      { id: 302, name: "沉默客户" },
    ]);
  });

  it("starts incomplete and exposes two screening outcomes", () => {
    const definition = getNodeDefinition("audience-filter");
    const node = createAudienceFilterNode();

    expect(definition.createDefaultData()).toMatchObject({
      schemaVersion: 1,
      status: "warning",
      title: "人群筛选",
    });
    expect(definition.getSourceHandles(node.data)).toEqual([
      expect.objectContaining({
        id: AUDIENCE_FILTER_MATCHED_HANDLE_ID,
        isDefault: true,
        label: "符合",
      }),
      expect.objectContaining({
        id: AUDIENCE_FILTER_UNMATCHED_HANDLE_ID,
        label: "不符合",
      }),
    ]);
    expect(definition.getOutputVariables?.(node) ?? []).toEqual([]);
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toEqual([expect.objectContaining({
      code: "audience-filter-group-required",
    })]);
    expect(definition.sanitizeData?.({
      ...createDefaultNodeData("audience-filter"),
      group: { id: 301, name: " 高价值客户 " },
    })).toMatchObject({
      group: { id: 301, name: "高价值客户" },
      status: "ready",
    });
  });

  it("keeps a selected group visible when the catalog load fails", async () => {
    listWorkflowAudienceGroups.mockRejectedValue(new Error("unavailable"));
    const node = createAudienceFilterNode();
    node.data = {
      ...node.data,
      group: { id: 301, name: "高价值客户" },
      status: "ready",
    };

    render(
      <AudienceFilterConfig
        edges={[]}
        node={node}
        nodes={[node]}
        onNodeChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("操作失败，请稍后重试");
    });
    expect(screen.getByRole("combobox", { name: "选择人群包" })).toHaveTextContent("高价值客户");
  });

  it("selects a group and keeps the selected snapshot after reload", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(<StatefulAudienceFilterConfig onNodeChange={onNodeChange} />);

    await waitFor(() => {
      expect(listWorkflowAudienceGroups).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("combobox", { name: "选择人群包" }));
    await user.click(screen.getByRole("option", { name: "高价值客户" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      group: { id: 301, name: "高价值客户" },
      metric: "高价值客户",
      status: "ready",
    });
  });

  it("summarizes the selected group and keeps both screening chips visible", () => {
    const data = {
      ...createDefaultNodeData("audience-filter"),
      group: { id: 301, name: "高价值客户" },
    };

    expect(projectWorkflowNodeExecutionConfig({ data, kind: "audience-filter" })).toEqual({
      group: { id: 301, name: "高价值客户" },
    });

    render(
      <AudienceFilterNodeBody
        data={data}
        visual={getNodeDefinition("audience-filter").visual}
      />,
    );
    expect(screen.getByText(/按人群包筛选/)).toBeInTheDocument();
    expect(screen.getByText("高价值客户")).toBeInTheDocument();
    expect(screen.getByLabelText("筛选结果")).toHaveTextContent("符合");
    expect(screen.getByLabelText("筛选结果")).toHaveTextContent("不符合");
  });
});

function createAudienceFilterNode(): WorkflowNode<"audience-filter"> {
  return {
    data: createDefaultNodeData("audience-filter"),
    id: "audience-filter",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function StatefulAudienceFilterConfig({ onNodeChange }: {
  onNodeChange: (patch: WorkflowNodeConfigPatch<"audience-filter">) => void;
}) {
  const [node, setNode] = useState(createAudienceFilterNode);
  return (
    <AudienceFilterConfig
      edges={[]}
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

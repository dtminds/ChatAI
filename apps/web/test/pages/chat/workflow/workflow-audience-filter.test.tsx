import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { AudienceFilterConfig } from "@/pages/chat/workflow/nodes/audience-filter/panel";
import { audienceFilterNodeUi } from "@/pages/chat/workflow/nodes/audience-filter/ui";
import { NodeOutputsSection } from "@/pages/chat/workflow/panels/node-outputs-section";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

const listWorkflowAudienceGroups = vi.fn();

vi.mock("@/pages/chat/workflow/nodes/audience-filter/api", () => ({
  listWorkflowAudienceGroups: (...args: unknown[]) => listWorkflowAudienceGroups(...args),
}));

describe("workflow Audience Filter node", () => {
  beforeEach(() => {
    listWorkflowAudienceGroups.mockReset();
    listWorkflowAudienceGroups.mockImplementation(async ({ page = 1 } = {}) => {
      if (page === 2) {
        return {
          groups: [{ id: 401, name: "第二页人群包" }],
          pagination: { hasNext: false, page: 2, pageSize: 20, total: 21 },
        };
      }
      return {
        groups: [
          { id: 301, name: "高价值客户" },
          { id: 302, name: "沉默客户" },
          { id: 303, name: "活跃客户" },
          { id: 304, name: "流失客户" },
        ],
        pagination: { hasNext: true, page: 1, pageSize: 20, total: 21 },
      };
    });
  });

  it("starts incomplete, sanitizes its config, and exposes stable outputs", () => {
    const definition = getNodeDefinition("audience-filter");
    const node = createAudienceFilterNode();

    expect(definition.createDefaultData()).toMatchObject({
      groups: [],
      matchMode: "any",
      schemaVersion: 1,
      status: "warning",
      title: "人群筛选",
    });
    expect(definition.getSourceHandles(node.data)).toEqual([
      expect.objectContaining({
        isDefault: true,
        outletKind: "default",
      }),
    ]);
    expect(definition.getOutputVariables?.(node)).toEqual([
      expect.objectContaining({ key: "matched", valueType: { kind: "boolean" } }),
      expect.objectContaining({
        key: "matchedGroupNames",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      }),
      expect.objectContaining({ key: "matchedGroupCount", valueType: { kind: "number" } }),
    ]);
    expect(definition.validate?.(node, {
      availableVariables: [],
      edges: [],
      nodes: [node],
    })).toEqual([expect.objectContaining({
      code: "audience-filter-group-required",
    })]);
    expect(definition.sanitizeData?.({
      ...createDefaultNodeData("audience-filter"),
      groups: [
        { id: 301, name: " 高价值客户 " },
        { id: 301, name: "重复" },
        { id: 302, name: "沉默客户" },
        { id: 303, name: "活跃客户" },
        { id: 304, name: "超限" },
      ],
      matchMode: "unsupported" as never,
    })).toMatchObject({
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
        { id: 303, name: "活跃客户" },
      ],
      matchMode: "any",
      metric: "满足任一 · 3 个人群包",
      status: "ready",
    });
  });

  it("shows node outputs in the settings panel", () => {
    render(<NodeOutputsSection node={createAudienceFilterNode()} />);
    expect(screen.getByText("是否匹配")).toBeInTheDocument();
    expect(screen.getByText("匹配人群包名")).toBeInTheDocument();
    expect(screen.getByText("匹配人群包数量")).toBeInTheDocument();
  });

  it("keeps selected snapshots when the catalog page fails to load", async () => {
    listWorkflowAudienceGroups.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    const node = createAudienceFilterNode();
    node.data = {
      ...node.data,
      groups: [{ id: 301, name: "高价值客户" }],
      matchMode: "any",
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

    expect(screen.getByRole("button", { name: /已选择 1 个人群包/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /已选择 1 个人群包/ }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(within(screen.getByRole("list", { name: "已选人群包" })).getByText("高价值客户"))
      .toBeInTheDocument();
  });

  it("selects up to 3 groups through paged dialog requests and match mode", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(<StatefulAudienceFilterConfig onNodeChange={onNodeChange} />);

    expect(listWorkflowAudienceGroups).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /请选择人群包/ }));
    await screen.findByRole("checkbox", { name: "高价值客户" });
    expect(listWorkflowAudienceGroups).toHaveBeenCalledTimes(1);
    expect(listWorkflowAudienceGroups).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
    });

    await user.click(screen.getByRole("checkbox", { name: "高价值客户" }));
    await user.click(screen.getByRole("checkbox", { name: "沉默客户" }));
    await user.click(screen.getByRole("checkbox", { name: "活跃客户" }));
    expect(screen.getByRole("checkbox", { name: "流失客户" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByRole("checkbox", { name: "第二页人群包" });
    expect(listWorkflowAudienceGroups).toHaveBeenCalledTimes(2);
    expect(listWorkflowAudienceGroups).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
    expect(screen.getByRole("checkbox", { name: "第二页人群包" })).toBeDisabled();
    expect(within(screen.getByRole("list", { name: "已选人群包" })).getByText("高价值客户"))
      .toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
        { id: 303, name: "活跃客户" },
      ],
      matchMode: "any",
      metric: "满足任一 · 3 个人群包",
      status: "ready",
    });

    await user.click(screen.getByRole("radio", { name: "满足全部" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
        { id: 303, name: "活跃客户" },
      ],
      matchMode: "all",
      metric: "满足全部 · 3 个人群包",
      status: "ready",
    });
  });

  it("projects and summarizes the configured query without screening chips", () => {
    const data = {
      ...createDefaultNodeData("audience-filter"),
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
      ],
      matchMode: "all" as const,
    };

    expect(projectWorkflowNodeExecutionConfig({ data, kind: "audience-filter" })).toEqual({
      groups: [
        { id: 301, name: "高价值客户" },
        { id: 302, name: "沉默客户" },
      ],
      matchMode: "all",
    });
    if (audienceFilterNodeUi.body.kind !== "fields") return;
    expect(audienceFilterNodeUi.body.getFields(data)).toEqual([
      expect.objectContaining({
        id: "match-mode",
        value: { kind: "text", text: "满足全部" },
      }),
      expect.objectContaining({
        id: "groups",
        value: { kind: "text", text: "已选择 2 个" },
      }),
    ]);
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

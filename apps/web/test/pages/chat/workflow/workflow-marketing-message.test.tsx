import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { createNodeFromKind } from "@/pages/chat/workflow/graph";
import { getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { MarketingMessageConfig } from "@/pages/chat/workflow/nodes/marketing-message/panel";
import { marketingMessageNodeUi } from "@/pages/chat/workflow/nodes/marketing-message/ui";
import { NodeOutputsSection } from "@/pages/chat/workflow/panels/node-outputs-section";
import type { WorkflowNode, WorkflowNodeConfigPatch } from "@/pages/chat/workflow/types";

const listWorkflowMarketingPlans = vi.fn();

vi.mock("@/pages/chat/workflow/nodes/marketing-message/api", () => ({
  listWorkflowMarketingPlans: (...args: unknown[]) => listWorkflowMarketingPlans(...args),
}));

describe("workflow Marketing Message node", () => {
  beforeEach(() => {
    listWorkflowMarketingPlans.mockReset();
    listWorkflowMarketingPlans.mockImplementation(async ({ page = 1, planName } = {}) => {
      if (planName === "双十一") {
        return {
          pagination: { hasNext: false, page: 1, pageSize: 20, total: 1 },
          plans: [{ name: "双十一触达", planId: 701, sendChannels: [1, 3], status: 0 }],
        };
      }
      if (page === 2) {
        return {
          pagination: { hasNext: false, page: 2, pageSize: 20, total: 21 },
          plans: [{ name: "第二页计划", planId: 702, sendChannels: [3], status: 2 }],
        };
      }
      return {
        pagination: { hasNext: true, page: 1, pageSize: 20, total: 21 },
        plans: [
          { name: "双十一触达", planId: 701, sendChannels: [1, 3], status: 0 },
          { name: "已结束计划", planId: 703, sendChannels: [1], status: 1 },
        ],
      };
    });
  });

  it("starts incomplete, exposes one output, and projects the selected snapshot", () => {
    const definition = getNodeDefinition("marketing-message");
    const node = createNode();

    expect(definition.createDefaultData()).toMatchObject({
      kind: "marketing-message",
      metric: "未选择触达任务",
      status: "warning",
      title: "群发触达",
      wait: { duration: 1, unit: "minute" },
    });
    expect(definition.validate?.(node, { availableVariables: [], edges: [], nodes: [node] }))
      .toEqual([expect.objectContaining({ code: "marketing-message-plan-required" })]);
    expect(definition.validate?.({
      ...node,
      data: { ...node.data, wait: { duration: 49, unit: "hour" } },
    }, { availableVariables: [], edges: [], nodes: [node] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "marketing-message-wait-invalid" })]));
    expect(definition.getOutputVariables?.(node)).toEqual([
      expect.objectContaining({ key: "pushSuccess", valueType: { kind: "boolean" } }),
    ]);
    expect(projectWorkflowNodeExecutionConfig({
      data: {
        ...node.data,
        plan: { planId: 701, planName: "双十一触达" },
        wait: { duration: 30, unit: "minute" },
      },
      kind: "marketing-message",
    })).toEqual({
      plan: { planId: 701, planName: "双十一触达" },
      wait: { duration: 30, unit: "minute" },
    });
  });

  it("selects a plan snapshot and configures the bounded fixed wait", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();
    render(<StatefulConfig onNodeChange={onNodeChange} />);

    await user.click(screen.getByRole("button", { name: /请选择触达任务/ }));
    await screen.findByRole("radio", { name: "双十一触达" });
    expect(listWorkflowMarketingPlans).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
    expect(screen.getAllByText("短信")).toHaveLength(2);
    expect(screen.getByText("企业微信")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "双十一触达" }));
    await user.click(screen.getByRole("button", { name: "确认" }));
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      metric: "双十一触达",
      plan: { planId: 701, planName: "双十一触达" },
      status: "ready",
    }));

    const duration = screen.getByRole("spinbutton", { name: "等待时长" });
    await user.click(screen.getByRole("combobox", { name: "等待时间单位" }));
    await user.click(screen.getByRole("option", { name: "小时" }));
    fireEvent.change(duration, { target: { value: "49" } });
    fireEvent.blur(duration);
    expect(duration).toHaveValue(48);
    expect(onNodeChange).toHaveBeenLastCalledWith(expect.objectContaining({
      wait: { duration: 48, unit: "hour" },
    }));
  });

  it("pages and searches from page 1", async () => {
    const user = userEvent.setup();
    render(<StatefulConfig onNodeChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /请选择触达任务/ }));
    await screen.findByRole("radio", { name: "双十一触达" });
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByRole("radio", { name: "第二页计划" });
    expect(listWorkflowMarketingPlans).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });

    await user.type(screen.getByRole("textbox", { name: "搜索触达任务" }), "双十一");
    await waitFor(() => expect(listWorkflowMarketingPlans).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
      planName: "双十一",
    }));
  });

  it("shows the single push result output and node body snapshot", () => {
    const node = createNode({
      plan: { planId: 701, planName: "双十一触达" },
      wait: { duration: 30, unit: "minute" },
    });
    render(<NodeOutputsSection node={node} />);
    expect(screen.getByText("推送成功")).toBeInTheDocument();
    const fields = marketingMessageNodeUi.body.kind === "fields"
      ? marketingMessageNodeUi.body.getFields(node.data)
      : [];
    expect(fields).toEqual([
      { id: "plan", label: "触达任务", value: { kind: "text", text: "双十一触达" } },
      { id: "wait", label: "等待时长", value: { kind: "text", text: "30 分钟" } },
    ]);
  });
});

function StatefulConfig({ onNodeChange }: {
  onNodeChange: (patch: WorkflowNodeConfigPatch<"marketing-message">) => void;
}) {
  const [node, setNode] = useState(createNode());
  return <MarketingMessageConfig
    edges={[]}
    node={node}
    nodes={[node]}
    onNodeChange={(patch) => {
      onNodeChange(patch);
      setNode(current => ({ ...current, data: { ...current.data, ...patch } }));
    }}
  />;
}

function createNode(overrides: Partial<WorkflowNode<"marketing-message">["data"]> = {}) {
  const node = createNodeFromKind("marketing-message", "marketing", 0);
  return { ...node, data: { ...node.data, ...overrides } };
}

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { TagConfig } from "@/pages/chat/workflow/nodes/tag/panel";
import { tagNodeUi } from "@/pages/chat/workflow/nodes/tag/ui";
import type {
  WorkflowNode,
  WorkflowNodeConfigPatch,
} from "@/pages/chat/workflow/types";

vi.mock("@/pages/chat/components/wecom-tag-selector", () => ({
  WecomTagSelector: ({ allowCrossGroup, maxSelected, multiple, onChange, value }: {
    allowCrossGroup?: boolean;
    maxSelected?: number;
    multiple?: boolean;
    onChange: (value: number[]) => void;
    value: readonly number[];
  }) => (
    <button
      data-allow-cross-group={allowCrossGroup}
      data-max-selected={maxSelected}
      data-multiple={multiple}
      onClick={() => onChange([101, 202])}
      type="button"
    >
      {value.length ? `已选 ${value.length}` : "选择标签"}
    </button>
  ),
}));

describe("workflow Tag node", () => {
  it("starts incomplete and sanitizes operation and tag IDs", () => {
    const definition = getNodeDefinition("tag");
    expect(definition.createDefaultData()).toMatchObject({
      operation: "add",
      schemaVersion: 1,
      status: "warning",
      tagIds: [],
    });
    expect(definition.sanitizeData?.({
      ...createDefaultNodeData("tag"),
      operation: "unsupported" as never,
      tagIds: [2, -1, 2, 3],
    })).toMatchObject({
      metric: "添加 2 个标签",
      operation: "add",
      status: "ready",
      tagIds: [2, 3],
    });
  });

  it("updates the operation and selected tags as one complete node config", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(
      <StatefulTagConfig onNodeChange={onNodeChange} />,
    );

    const selector = screen.getByRole("button", { name: "选择标签" });
    expect(selector).toHaveAttribute("data-allow-cross-group", "true");
    expect(selector).toHaveAttribute("data-max-selected", "50");
    expect(selector).toHaveAttribute("data-multiple", "true");

    await user.click(screen.getByRole("radio", { name: "移除" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      metric: "待配置标签",
      operation: "remove",
      status: "warning",
      tagIds: [],
    });

    await user.click(selector);
    expect(onNodeChange).toHaveBeenLastCalledWith({
      metric: "移除 2 个标签",
      operation: "remove",
      status: "ready",
      tagIds: [101, 202],
    });
  });

  it("summarizes the configured action without exposing tag IDs", () => {
    if (tagNodeUi.body.kind !== "fields") return;
    expect(tagNodeUi.body.getFields({
      ...createDefaultNodeData("tag"),
      operation: "remove",
      tagIds: [101, 202],
    })).toEqual([
      expect.objectContaining({ id: "operation", value: { kind: "text", text: "移除标签" } }),
      expect.objectContaining({ id: "tag", value: { kind: "text", text: "已选择 2 个" } }),
    ]);
  });
});

function createTagNode(): WorkflowNode<"tag"> {
  return {
    data: createDefaultNodeData("tag"),
    id: "tag",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function StatefulTagConfig({ onNodeChange }: {
  onNodeChange: (patch: WorkflowNodeConfigPatch<"tag">) => void;
}) {
  const [node, setNode] = useState(createTagNode);
  return (
    <TagConfig
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

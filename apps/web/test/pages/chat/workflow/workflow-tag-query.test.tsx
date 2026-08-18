import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { projectWorkflowNodeExecutionConfig } from "@chatai/workflow-engine/node-contract-registry";
import { WORKFLOW_NODE_TYPE } from "@/pages/chat/workflow/constants";
import { createDefaultNodeData, getNodeDefinition } from "@/pages/chat/workflow/node-definitions";
import { TagQueryConfig } from "@/pages/chat/workflow/nodes/tag-query/panel";
import { tagQueryNodeUi } from "@/pages/chat/workflow/nodes/tag-query/ui";
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

describe("workflow Tag Query node", () => {
  it("starts incomplete, sanitizes its config, and exposes stable outputs", () => {
    const definition = getNodeDefinition("tag-query");
    expect(definition.createDefaultData()).toMatchObject({
      matchMode: "any",
      schemaVersion: 1,
      status: "warning",
      tagIds: [],
    });
    expect(definition.sanitizeData?.({
      ...createDefaultNodeData("tag-query"),
      matchMode: "unsupported" as never,
      tagIds: [2, -1, 2, 3],
    })).toMatchObject({
      matchMode: "any",
      metric: "满足任一 · 2 个标签",
      status: "ready",
      tagIds: [2, 3],
    });
    expect(definition.getOutputVariables?.(createTagQueryNode())).toEqual([
      expect.objectContaining({ key: "matched", valueType: { kind: "boolean" } }),
      expect.objectContaining({
        key: "matchedTagNames",
        usages: ["variable", "message-content"],
        valueType: { kind: "string" },
      }),
      expect.objectContaining({ key: "matchedTagCount", valueType: { kind: "number" } }),
    ]);
  });

  it("updates the match mode and selected tags as one complete config", async () => {
    const user = userEvent.setup();
    const onNodeChange = vi.fn();

    render(<StatefulTagQueryConfig onNodeChange={onNodeChange} />);

    const selector = screen.getByRole("button", { name: "选择标签" });
    expect(selector).toHaveAttribute("data-allow-cross-group", "true");
    expect(selector).toHaveAttribute("data-max-selected", "5");
    expect(selector).toHaveAttribute("data-multiple", "true");

    await user.click(screen.getByRole("radio", { name: "满足全部" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      matchMode: "all",
      metric: "待配置查询标签",
      status: "warning",
      tagIds: [],
    });

    await user.click(selector);
    expect(onNodeChange).toHaveBeenLastCalledWith({
      matchMode: "all",
      metric: "满足全部 · 2 个标签",
      status: "ready",
      tagIds: [101, 202],
    });

    await user.click(screen.getByRole("radio", { name: "均不包含" }));
    expect(onNodeChange).toHaveBeenLastCalledWith({
      matchMode: "none",
      metric: "均不包含 · 2 个标签",
      status: "ready",
      tagIds: [101, 202],
    });
  });

  it("projects and summarizes the configured query without exposing tag IDs", () => {
    const data = {
      ...createDefaultNodeData("tag-query"),
      matchMode: "all" as const,
      tagIds: [101, 202],
    };
    expect(projectWorkflowNodeExecutionConfig({ data, kind: "tag-query" })).toEqual({
      matchMode: "all",
      tagIds: [101, 202],
    });
    if (tagQueryNodeUi.body.kind !== "fields") return;
    expect(tagQueryNodeUi.body.getFields(data)).toEqual([
      expect.objectContaining({
        id: "match-mode",
        value: { kind: "text", text: "满足全部" },
      }),
      expect.objectContaining({
        id: "tags",
        value: { kind: "text", text: "已选择 2 个" },
      }),
    ]);
  });
});

function createTagQueryNode(): WorkflowNode<"tag-query"> {
  return {
    data: createDefaultNodeData("tag-query"),
    id: "tag-query",
    position: { x: 0, y: 0 },
    type: WORKFLOW_NODE_TYPE,
  };
}

function StatefulTagQueryConfig({ onNodeChange }: {
  onNodeChange: (patch: WorkflowNodeConfigPatch<"tag-query">) => void;
}) {
  const [node, setNode] = useState(createTagQueryNode);
  return (
    <TagQueryConfig
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

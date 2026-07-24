import { describe, expect, it } from "vitest";
import { createEditor } from "lexical";
import {
  normalizeSkillContentSegments,
  serializeSkillContentSegments,
  type SkillContentSegment,
} from "@/pages/chat/ai-hosting/ai-skill-resource";
import { SkillResourceChipNode } from "@/pages/chat/ai-hosting/ai-skill-description-lexical-nodes";
import {
  $exportSkillContentSegments,
  $insertSkillContentResource,
  $restoreSkillContentFromSegments,
} from "@/pages/chat/ai-hosting/ai-skill-description-lexical-utils";

function createSkillContentEditor() {
  return createEditor({
    namespace: "AiSkillDescriptionFieldTest",
    nodes: [SkillResourceChipNode],
    onError(error) {
      throw error;
    },
  });
}

describe("ai skill description lexical utils", () => {
  it("exports chip nodes as resource segments instead of raw placeholder text", () => {
    const editor = createSkillContentEditor();
    let segments: SkillContentSegment[] = [];

    editor.update(
      () => {
        $restoreSkillContentFromSegments([{ type: "text", value: "说明 " }]);
        $insertSkillContentResource({
          id: "custom_field:1",
          kind: "variable",
          name: "性别",
          placeholder:
            '<resource type="variable" variableType="custom_field" variableId="1" name="性别" />',
          type: "resource",
        });
        segments = $exportSkillContentSegments();
      },
      { discrete: true },
    );

    expect(normalizeSkillContentSegments(segments)).toEqual([
      { type: "text", value: "说明 " },
      {
        id: "custom_field:1",
        kind: "variable",
        name: "性别",
        placeholder:
          '<resource type="variable" variableType="custom_field" variableId="1" name="性别" />',
        type: "resource",
      },
      { type: "text", value: " " },
    ]);
    expect(serializeSkillContentSegments(segments)).toContain('variableType="custom_field"');
  });

  it("restores resource chips from segments", () => {
    const editor = createSkillContentEditor();
    let exported: SkillContentSegment[] = [];

    editor.update(
      () => {
        $restoreSkillContentFromSegments([
          { type: "text", value: "先说明 " },
          {
            id: "search_order",
            kind: "tool",
            name: "订单查询",
            placeholder: '<resource type="tool" toolId="search_order" name="订单查询" />',
            type: "resource",
          },
          { type: "text", value: "" },
        ]);
        exported = $exportSkillContentSegments();
      },
      { discrete: true },
    );

    expect(exported).toEqual([
      { type: "text", value: "先说明 " },
      {
        id: "search_order",
        kind: "tool",
        name: "订单查询",
        placeholder: '<resource type="tool" toolId="search_order" name="订单查询" />',
        type: "resource",
      },
      { type: "text", value: "" },
    ]);
  });
});

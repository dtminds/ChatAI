import { describe, expect, it } from "vitest";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  createEditor,
} from "lexical";
import type { ConditionalLogicSegment } from "@/pages/chat/ai-hosting/agent-components/agent-settings.constants";
import { KnowledgeBaseChipNode } from "@/pages/chat/ai-hosting/agent-components/agent-conditional-logic-lexical-nodes";
import {
  $exportConditionalLogicSegments,
  $insertConditionalLogicText,
  $insertKnowledgeBaseChip,
  $restoreConditionalLogicFromSegments,
  isConditionalLogicEmpty,
  normalizeConditionalLogicSegments,
} from "@/pages/chat/ai-hosting/agent-components/agent-conditional-logic-lexical-utils";

describe("conditional logic lexical utils", () => {
  it("exports text and knowledge base segments from the editor", () => {
    const editor = createEditor({
      namespace: "conditional-logic-lexical-utils-test",
      nodes: [KnowledgeBaseChipNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ConditionalLogicSegment[] = [];

    editor.update(
      () => {
        $insertConditionalLogicText("111 ");
        $insertKnowledgeBaseChip({
          id: "kb-skincare",
          name: "美妆知识大全",
        });
        $insertConditionalLogicText("xxx 333 ");
        $insertKnowledgeBaseChip({
          id: "kb-makeup",
          name: "彩妆精选",
        });
        segments = $exportConditionalLogicSegments();
      },
      { discrete: true },
    );

    expect(normalizeConditionalLogicSegments(segments)).toEqual([
      { type: "text", value: "111 " },
      { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
      { type: "text", value: " xxx 333 " },
      { type: "knowledgeBase", id: "kb-makeup", name: "彩妆精选" },
      { type: "text", value: " " },
    ]);
  });

  it("restores segments into the editor", () => {
    const editor = createEditor({
      namespace: "conditional-logic-restore-test",
      nodes: [KnowledgeBaseChipNode],
      onError(error) {
        throw error;
      },
    });
    let exported: ConditionalLogicSegment[] = [];

    editor.update(
      () => {
        $restoreConditionalLogicFromSegments([
          { type: "text", value: "hello " },
          { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
          { type: "text", value: "world" },
        ]);
        exported = $exportConditionalLogicSegments();
      },
      { discrete: true },
    );

    expect(exported).toEqual([
      { type: "text", value: "hello " },
      { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
      { type: "text", value: "world" },
    ]);
  });

  it("exports a leading knowledge base token without synthetic text content", () => {
    const editor = createEditor({
      namespace: "conditional-logic-leading-chip-test",
      nodes: [KnowledgeBaseChipNode],
      onError(error) {
        throw error;
      },
    });
    let exported: ConditionalLogicSegment[] = [];

    editor.update(
      () => {
        $restoreConditionalLogicFromSegments([
          { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
          { type: "text", value: " then reply" },
        ]);
        exported = $exportConditionalLogicSegments();
      },
      { discrete: true },
    );

    expect(exported).toEqual([
      { type: "text", value: "" },
      { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
      { type: "text", value: " then reply" },
    ]);
  });

  it("places selection after the trailing space when inserting a knowledge base token", () => {
    const editor = createEditor({
      namespace: "conditional-logic-token-insert-selection-test",
      nodes: [KnowledgeBaseChipNode],
      onError(error) {
        throw error;
      },
    });
    let selectionPoint:
      | {
        key: string;
        offset: number;
        type: "element" | "text";
      }
      | null = null;
    let trailingTextKey = "";

    editor.update(
      () => {
        $restoreConditionalLogicFromSegments([{ type: "text", value: "before " }]);
        const paragraph = $getRoot().getFirstChildOrThrow();

        if (!$isElementNode(paragraph)) {
          throw new Error("Expected paragraph element");
        }

        paragraph.selectEnd();

        $insertKnowledgeBaseChip({
          id: "kb-skincare",
          name: "美妆知识大全",
        });
        const trailingText = paragraph.getChildAtIndex(2);

        if (!trailingText) {
          throw new Error("Expected trailing text");
        }

        trailingTextKey = trailingText.getKey();

        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          selectionPoint = {
            key: selection.anchor.key,
            offset: selection.anchor.offset,
            type: selection.anchor.type,
          };
        }
      },
      { discrete: true },
    );

    expect(selectionPoint).toEqual({
      key: trailingTextKey,
      offset: 1,
      type: "text",
    });
  });

  it("detects empty conditional logic segments", () => {
    expect(isConditionalLogicEmpty([{ type: "text", value: "" }])).toBe(true);
    expect(
      isConditionalLogicEmpty([
        { type: "text", value: " " },
        { type: "knowledgeBase", id: "kb-skincare", name: "美妆知识大全" },
      ]),
    ).toBe(false);
  });
});

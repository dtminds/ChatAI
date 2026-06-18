import { describe, expect, it } from "vitest";
import { createEditor } from "lexical";
import type { ConditionalLogicSegment } from "@/pages/chat/ai-hosting/agent-settings.constants";
import { KnowledgeBaseChipNode } from "@/pages/chat/ai-hosting/agent-conditional-logic-lexical-nodes";
import {
  $exportConditionalLogicSegments,
  $insertConditionalLogicText,
  $insertKnowledgeBaseChip,
  $restoreConditionalLogicFromSegments,
  isConditionalLogicEmpty,
  normalizeConditionalLogicSegments,
} from "@/pages/chat/ai-hosting/agent-conditional-logic-lexical-utils";

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
        $insertKnowledgeBaseChip("kb-skincare");
        $insertConditionalLogicText("xxx 333 ");
        $insertKnowledgeBaseChip("kb-makeup");
        segments = $exportConditionalLogicSegments();
      },
      { discrete: true },
    );

    expect(normalizeConditionalLogicSegments(segments)).toEqual([
      { type: "text", value: "111 " },
      { type: "knowledgeBase", id: "kb-skincare" },
      { type: "text", value: "xxx 333 " },
      { type: "knowledgeBase", id: "kb-makeup" },
      { type: "text", value: "" },
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
          { type: "knowledgeBase", id: "kb-skincare" },
          { type: "text", value: "world" },
        ]);
        exported = $exportConditionalLogicSegments();
      },
      { discrete: true },
    );

    expect(exported).toEqual([
      { type: "text", value: "hello " },
      { type: "knowledgeBase", id: "kb-skincare" },
      { type: "text", value: "world" },
    ]);
  });

  it("detects empty conditional logic segments", () => {
    expect(isConditionalLogicEmpty([{ type: "text", value: "" }])).toBe(true);
    expect(
      isConditionalLogicEmpty([
        { type: "text", value: " " },
        { type: "knowledgeBase", id: "kb-skincare" },
      ]),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  $createLineBreakNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isTextNode,
  createEditor,
} from "lexical";
import {
  $exportComposerSegments,
  $getComposerPlainText,
  $insertComposerImage,
  $insertComposerMention,
  $insertComposerText,
  $removeComposerTextRange,
  $restoreComposerFromSegments,
} from "@/pages/chat/components/composer/lexical-utils";
import {
  ComposerEmojiNode,
  ComposerImageNode,
  ComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import {
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";

describe("composer lexical utils", () => {
  it("removes mention trigger text without dropping images or shifting past emoji tokens", () => {
    const editor = createEditor({
      namespace: "composer-lexical-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        $insertComposerText("好的[打脸] ");
        $insertComposerImage({
          alt: "截图",
          localUrl: "data:image/png;base64,a",
          src: "data:image/png;base64,a",
        });
        $insertComposerText(" @小");
        const draftText = $getComposerPlainText();
        const mentionStart = draftText.indexOf("@小");

        expect(mentionStart).toBeGreaterThanOrEqual(0);
        $removeComposerTextRange(mentionStart, mentionStart + "@小".length);
        segments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(segments)).toEqual([
      {
        text: "好的[打脸]",
        type: "text",
      },
      {
        alt: "截图",
        height: undefined,
        localUrl: "data:image/png;base64,a",
        type: "image",
        url: "data:image/png;base64,a",
        width: undefined,
      },
    ]);
  });

  it("keeps the caret in a real text position after inserting an image", () => {
    const editor = createEditor({
      namespace: "composer-image-caret-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let anchorOffset = -1;
    let selectionNodeText = "";
    let selectionNodeType = "";

    editor.update(
      () => {
        $insertComposerImage({
          alt: "截图",
          localUrl: "data:image/png;base64,a",
          src: "data:image/png;base64,a",
        });
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();
          anchorOffset = selection.anchor.offset;
          selectionNodeText = anchorNode.getTextContent();
          selectionNodeType = $isTextNode(anchorNode) ? "text" : anchorNode.getType();
        }
      },
      { discrete: true },
    );

    expect(selectionNodeText.length).toBeGreaterThan(0);
    expect(anchorOffset).toBe(selectionNodeText.length);
    expect(selectionNodeType).toBe("text");
  });

  it("does not export spacer text between consecutive images", () => {
    const editor = createEditor({
      namespace: "composer-consecutive-images-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        $insertComposerImage({
          alt: "截图 A",
          localUrl: "data:image/png;base64,a",
          src: "data:image/png;base64,a",
        });
        $insertComposerImage({
          alt: "截图 B",
          localUrl: "data:image/png;base64,b",
          src: "data:image/png;base64,b",
        });
        segments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(segments)).toEqual([
      expect.objectContaining({
        alt: "截图 A",
        type: "image",
      }),
      expect.objectContaining({
        alt: "截图 B",
        type: "image",
      }),
    ]);
  });

  it("exports text after an inline image without forcing a line break", () => {
    const editor = createEditor({
      namespace: "composer-inline-image-text-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let draftText = "";
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        $insertComposerText("前");
        $insertComposerImage({
          alt: "截图",
          localUrl: "data:image/png;base64,a",
          src: "data:image/png;base64,a",
        });
        $insertComposerText("后");
        draftText = $getComposerPlainText();
        segments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(draftText).toBe("前后");
    expect(normalizeComposerSegments(segments)).toEqual([
      {
        text: "前",
        type: "text",
      },
      expect.objectContaining({
        alt: "截图",
        type: "image",
      }),
      {
        text: "后",
        type: "text",
      },
    ]);
  });

  it("exports mention tokens with member ids", () => {
    const editor = createEditor({
      namespace: "composer-mention-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        $insertComposerText("请 ");
        $insertComposerMention({
          displayName: "小林",
          memberId: "member-001",
        });
        $insertComposerText(" 看一下");
        segments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(segments)).toEqual([
      {
        mentionMemberIds: ["member-001"],
        text: "请 @小林 看一下",
        type: "text",
      },
    ]);
  });

  it("exports a single line break as one newline character", () => {
    const editor = createEditor({
      namespace: "composer-line-break-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        $insertComposerText("第一行");
        $insertNodes([$createLineBreakNode()]);
        $insertComposerText("第二行");
        segments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(segments)).toEqual([
      {
        text: "第一行\n第二行",
        type: "text",
      },
    ]);
  });

  it("restores composer content from saved segments", () => {
    const editor = createEditor({
      namespace: "composer-restore-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let restoredSegments: ComposerSegment[] = [];
    let restoredPlainText = "";

    editor.update(
      () => {
        $restoreComposerFromSegments([
          { text: "你好[打脸]", type: "text" },
          {
            alt: "截图",
            localUrl: "data:image/png;base64,a",
            type: "image",
            url: "data:image/png;base64,a",
          },
          {
            mentionMemberIds: ["member-001"],
            text: "@张三",
            type: "text",
          },
        ]);
        restoredPlainText = $getComposerPlainText();
        restoredSegments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(restoredPlainText).toContain("你好");
    expect(restoredPlainText).toContain("@张三");
    expect(normalizeComposerSegments(restoredSegments)).toEqual([
      {
        text: "你好[打脸]",
        type: "text",
      },
      {
        alt: "截图",
        localUrl: "data:image/png;base64,a",
        type: "image",
        url: "data:image/png;base64,a",
      },
      {
        mentionMemberIds: ["member-001"],
        text: "@张三",
        type: "text",
      },
    ]);
  });
});

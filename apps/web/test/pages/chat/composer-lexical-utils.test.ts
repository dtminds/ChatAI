import { describe, expect, it } from "vitest";
import { $getRoot, createEditor } from "lexical";
import {
  $exportComposerSegments,
  $insertComposerImage,
  $insertComposerMention,
  $insertComposerText,
  $removeComposerTextRange,
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
        const draftText = $getRoot().getTextContent();
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
});

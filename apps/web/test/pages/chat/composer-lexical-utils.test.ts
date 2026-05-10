import { describe, expect, it } from "vitest";
import { $getRoot, createEditor } from "lexical";
import {
  $exportComposerSegments,
  $insertComposerImage,
  $insertComposerText,
  $removeComposerTextRange,
} from "@/pages/chat/components/composer/lexical-utils";
import {
  ComposerEmojiNode,
  ComposerImageNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import {
  normalizeComposerSegments,
  type ComposerSegment,
} from "@/pages/chat/lib/composer-segments";

describe("composer lexical utils", () => {
  it("removes mention trigger text without dropping images or shifting past emoji tokens", () => {
    const editor = createEditor({
      namespace: "composer-lexical-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode],
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
});

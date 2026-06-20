import { describe, expect, it } from "vitest";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $getRoot,
  $insertNodes,
  $isElementNode,
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
  ComposerLiteAttachmentNode,
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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

  it("restores and exports lite attachments in document order", () => {
    const editor = createEditor({
      namespace: "composer-lite-attachment-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    const sourceSegments: ComposerSegment[] = [
      { text: "开头", type: "text" },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        materialCollectionId: "material-file-1",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
      { text: "中间", type: "text" },
      {
        href: "https://example.com/activity",
        materialCollectionId: "material-h5-1",
        title: "活动链接",
        type: "h5",
      },
      {
        materialCollectionId: "material-weapp-1",
        title: "小程序",
        type: "weapp",
      },
    ];
    let restoredSegments: ComposerSegment[] = [];

    editor.update(
      () => {
        $restoreComposerFromSegments(sourceSegments);
        restoredSegments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(restoredSegments)).toEqual(sourceSegments);
  });

  it("restores lite attachments into standalone paragraphs", () => {
    const editor = createEditor({
      namespace: "composer-lite-attachment-paragraph-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    const sourceSegments: ComposerSegment[] = [
      { text: "开头", type: "text" },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        materialCollectionId: "material-file-1",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
    ];
    let rootChildSummaries: string[] = [];

    editor.update(
      () => {
        $restoreComposerFromSegments(sourceSegments);

        rootChildSummaries = $getRoot().getChildren().map((child) => {
          if (!$isElementNode(child)) {
            return child.getType();
          }

          const childTypes = child.getChildren().map((node) => node.getType());

          return childTypes.join(",");
        });
      },
      { discrete: true },
    );

    expect(rootChildSummaries).toEqual([
      "text",
      "composer-lite-attachment",
      "",
    ]);
  });

  it("does not append an empty paragraph after restored text", () => {
    const editor = createEditor({
      namespace: "composer-text-restore-trailing-paragraph-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let rootChildSummaries: string[] = [];

    editor.update(
      () => {
        $restoreComposerFromSegments([
          {
            text: "您好",
            type: "text",
          },
        ]);

        rootChildSummaries = $getRoot().getChildren().map((child) => {
          if (!$isElementNode(child)) {
            return child.getType();
          }

          return child.getChildren().map((node) => node.getType()).join(",");
        });
      },
      { discrete: true },
    );

    expect(rootChildSummaries).toEqual(["text"]);
  });

  it("does not export paragraph boundaries around lite attachments as newline text", () => {
    const editor = createEditor({
      namespace: "composer-lite-attachment-paragraph-export-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    const sourceSegments: ComposerSegment[] = [
      { text: "开头", type: "text" },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        materialCollectionId: "material-file-1",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
      { text: "中间", type: "text" },
      {
        href: "https://example.com/activity",
        materialCollectionId: "material-h5-1",
        title: "活动链接",
        type: "h5",
      },
    ];
    let restoredSegments: ComposerSegment[] = [];

    editor.update(
      () => {
        $restoreComposerFromSegments(sourceSegments);
        restoredSegments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(restoredSegments)).toEqual(sourceSegments);
  });

  it("keeps user-entered line breaks inside a text paragraph when exporting", () => {
    const editor = createEditor({
      namespace: "composer-text-paragraph-line-break-export-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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

  it("exports user-entered paragraph breaks as newline text", () => {
    const editor = createEditor({
      namespace: "composer-text-paragraph-break-export-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let segments: ComposerSegment[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const firstParagraph = $createParagraphNode();
        const secondParagraph = $createParagraphNode();

        root.clear();
        firstParagraph.append($createTextNode("第一行"));
        secondParagraph.append($createTextNode("第二行"));
        root.append(firstParagraph, secondParagraph);

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

  it("restores explicit text line breaks without turning paragraph boundaries into content", () => {
    const editor = createEditor({
      namespace: "composer-text-line-break-restore-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
      onError(error) {
        throw error;
      },
    });
    let restoredSegments: ComposerSegment[] = [];

    editor.update(
      () => {
        $restoreComposerFromSegments([
          {
            text: "第一行\n第二行",
            type: "text",
          },
          {
            extension: "pdf",
            fileName: "报价单.pdf",
            materialCollectionId: "material-file-1",
            type: "file",
            url: "https://cdn.example.com/quote.pdf",
          },
          {
            text: "第三行",
            type: "text",
          },
        ]);
        restoredSegments = $exportComposerSegments();
      },
      { discrete: true },
    );

    expect(normalizeComposerSegments(restoredSegments)).toEqual([
      {
        text: "第一行\n第二行",
        type: "text",
      },
      {
        extension: "pdf",
        fileName: "报价单.pdf",
        materialCollectionId: "material-file-1",
        type: "file",
        url: "https://cdn.example.com/quote.pdf",
      },
      {
        text: "第三行",
        type: "text",
      },
    ]);
  });

  it("keeps the caret in a real text position after inserting an image", () => {
    const editor = createEditor({
      namespace: "composer-image-caret-utils-test",
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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
      nodes: [ComposerEmojiNode, ComposerImageNode, ComposerLiteAttachmentNode, ComposerMentionNode],
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

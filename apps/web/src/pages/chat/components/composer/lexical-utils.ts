import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type PointType,
  type TextNode,
} from "lexical";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  $createComposerEmojiNode,
  $createComposerImageNode,
  $createComposerMentionNode,
  $isComposerEmojiNode,
  $isComposerImageNode,
  $isComposerMentionNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import {
  getWechatEmojiByName,
  parseWechatEmojiText,
  toWechatEmojiToken,
} from "@/pages/chat/wechat-emoji";

const WECHAT_EMOJI_TOKEN_PATTERN = /\[([^[\]]+)\]/g;
const COMPOSER_TEXT_ANCHOR = "\u200B";

export function $insertComposerText(text: string) {
  const nodes = parseWechatEmojiText(text).map((segment) => {
    if (segment.type === "emoji") {
      return $createComposerEmojiNode(
        toWechatEmojiToken(segment.value.name),
        segment.value.name,
        segment.value.path,
      );
    }

    return $createTextNode(segment.value);
  });

  if (nodes.length > 0) {
    $insertNodes(nodes);
  }
}

export function $replaceWechatEmojiTokens(node: TextNode) {
  const text = node.getTextContent();
  const tokenMatch = findFirstWechatEmojiToken(text);

  if (!tokenMatch) {
    return false;
  }

  const splitOffsets = [tokenMatch.start, tokenMatch.end].filter(
    (offset) => offset > 0 && offset < text.length,
  );
  const splitNodes = node.splitText(...splitOffsets);
  const targetNode = splitNodes.find(
    (splitNode) => splitNode.getTextContent() === tokenMatch.token,
  );

  if (!targetNode) {
    return false;
  }

  targetNode.replace(
    $createComposerEmojiNode(
      tokenMatch.token,
      tokenMatch.emoji.name,
      tokenMatch.emoji.path,
    ),
  );

  return true;
}

export function $insertComposerEmojiByName(name: string) {
  const emoji = getWechatEmojiByName(name);

  if (!emoji) {
    return false;
  }

  $insertNodes([
    $createComposerEmojiNode(toWechatEmojiToken(emoji.name), emoji.name, emoji.path),
  ]);

  return true;
}

export function $insertComposerImage(input: {
  alt: string;
  clientId?: string;
  fileId?: string;
  height?: number;
  localUrl?: string;
  src: string;
  width?: number;
}) {
  const insertionPoint = $createTextNode(COMPOSER_TEXT_ANCHOR);

  $insertNodes([$createComposerImageNode(input), insertionPoint]);
  insertionPoint.select(COMPOSER_TEXT_ANCHOR.length, COMPOSER_TEXT_ANCHOR.length);
}

export function $updateComposerImage(input: {
  clientId?: string;
  fileId?: string;
  localUrl?: string;
  previousSrc: string;
  src: string;
}) {
  for (const child of $getRoot().getChildren()) {
    if (updateComposerImageInNode(child, input)) {
      return true;
    }
  }

  return false;
}

export function $insertComposerMention(input: {
  displayName: string;
  isAll?: boolean;
  memberId: string;
}) {
  $insertNodes([$createComposerMentionNode(input)]);
}

export function $clearComposer() {
  const root = $getRoot();
  root.clear();
  root.append($createParagraphNode());
  root.selectStart();
}

export function $removeComposerTextRange(start: number, end: number) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);

  if (safeStart === safeEnd) {
    return;
  }

  let textOffset = 0;
  let selectionTarget:
    | {
        offset: number;
        textNode: TextNode;
      }
    | undefined;

  for (const part of collectTextContentParts($getRoot())) {
    const nodeStart = textOffset;
    const nodeEnd = nodeStart + part.length;
    textOffset = nodeEnd;

    if (!part.textNode) {
      continue;
    }

    const textNode = part.textNode;
    const text = textNode.getTextContent();

    if (safeEnd <= nodeStart) {
      break;
    }

    if (safeStart >= nodeEnd) {
      continue;
    }

    const rangeStart = toRawTextOffset(text, Math.max(0, safeStart - nodeStart));
    const rangeEnd = toRawTextOffset(
      text,
      Math.min(stripComposerTextAnchors(text).length, safeEnd - nodeStart),
    );
    const nextText = text.slice(0, rangeStart) + text.slice(rangeEnd);
    const isStartNode = selectionTarget === undefined && safeStart <= nodeEnd;

    if (nextText) {
      textNode.setTextContent(nextText);
      if (isStartNode) {
        selectionTarget = {
          offset: rangeStart,
          textNode,
        };
      }
    } else {
      const previousSibling = textNode.getPreviousSibling<TextNode>();
      const nextSibling = textNode.getNextSibling<TextNode>();

      textNode.remove();

      if (isStartNode && previousSibling && $isTextNode(previousSibling)) {
        selectionTarget = {
          offset: previousSibling.getTextContent().length,
          textNode: previousSibling,
        };
      } else if (isStartNode && nextSibling && $isTextNode(nextSibling)) {
        selectionTarget = {
          offset: 0,
          textNode: nextSibling,
        };
      }
    }
  }

  if (selectionTarget) {
    selectionTarget.textNode.select(selectionTarget.offset, selectionTarget.offset);
  } else {
    $getRoot().selectEnd();
  }
}

export function $exportComposerSegments() {
  const segments: ComposerSegment[] = [];

  for (const child of $getRoot().getChildren()) {
    collectSegmentsFromNode(child, segments);
  }

  return segments;
}

export function $getComposerPlainText() {
  return stripComposerTextAnchors($getRoot().getTextContent());
}

export function $getComposerPlainTextCursorOffset() {
  const selection = $getSelection();
  const plainTextLength = $getComposerPlainText().length;

  if (!$isRangeSelection(selection)) {
    return plainTextLength;
  }

  return Math.max(
    0,
    Math.min(
      plainTextLength,
      getPlainTextOffsetForPoint($getRoot(), selection.anchor) ?? plainTextLength,
    ),
  );
}

function collectSegmentsFromNode(node: LexicalNode, segments: ComposerSegment[]) {
  if ($isComposerMentionNode(node)) {
    segments.push(
      node.isAll()
        ? {
            mentionAll: true,
            text: node.getTextContent(),
            type: "text",
          }
        : {
            mentionMemberIds: [node.getMemberId()],
            text: node.getTextContent(),
            type: "text",
          },
    );
    return;
  }

  if ($isTextNode(node)) {
    const text = stripComposerTextAnchors(node.getTextContent());

    if (text) {
      segments.push({
        text,
        type: "text",
      });
    }
    return;
  }

  if ($isLineBreakNode(node)) {
    segments.push({
      text: "\n",
      type: "text",
    });
    return;
  }

  if ($isComposerEmojiNode(node)) {
    segments.push({
      text: node.getToken(),
      type: "text",
    });
    return;
  }

  if ($isComposerImageNode(node)) {
    segments.push({
      alt: node.getAlt(),
      clientId: node.getClientId(),
      fileId: node.getFileId(),
      height: node.getHeight(),
      localUrl: node.getLocalUrl(),
      type: "image",
      url: node.getSrc(),
      width: node.getWidth(),
    });
    return;
  }

  if ($isElementNode(node) || $isRootNode(node)) {
    const elementNode = node as ElementNode;
    const children = elementNode.getChildren();

    children.forEach((child) => {
      collectSegmentsFromNode(child, segments);
    });

    if (!$isRootNode(node)) {
      segments.push({
        text: "\n",
        type: "text",
      });
    }
  }
}

function findFirstWechatEmojiToken(text: string) {
  for (const match of text.matchAll(WECHAT_EMOJI_TOKEN_PATTERN)) {
    const token = match[0];
    const name = match[1] ?? "";
    const emoji = getWechatEmojiByName(name);

    if (!emoji) {
      continue;
    }

    const start = match.index ?? 0;

    return {
      emoji,
      end: start + token.length,
      start,
      token,
    };
  }

  return null;
}

function stripComposerTextAnchors(text: string) {
  return text.replaceAll(COMPOSER_TEXT_ANCHOR, "");
}

function getPlainTextOffsetForPoint(
  node: LexicalNode,
  point: PointType,
): number | null {
  if (point.type === "text") {
    const pointNode = point.getNode();

    if ($isTextNode(node) && node.is(pointNode)) {
      return stripComposerTextAnchors(
        node.getTextContent().slice(0, point.offset),
      ).length;
    }
  }

  if (point.type === "element" && node.is(point.getNode())) {
    return getPlainTextLengthForElementChildrenBeforePoint(
      node as ElementNode,
      point.offset,
    );
  }

  if (!$isElementNode(node) && !$isRootNode(node)) {
    return null;
  }

  let textOffset = 0;
  const children = (node as ElementNode).getChildren();

  for (const [index, child] of children.entries()) {
    const offsetInChild = getPlainTextOffsetForPoint(child, point);

    if (offsetInChild !== null) {
      return textOffset + offsetInChild;
    }

    textOffset += getPlainTextLengthForNode(child);

    if ($isElementNode(child) && !child.isInline() && index !== children.length - 1) {
      textOffset += 2;
    }
  }

  return null;
}

function getPlainTextLengthForElementChildrenBeforePoint(
  element: ElementNode,
  pointOffset: number,
): number {
  let textLength = 0;
  const children = element.getChildren();

  for (let index = 0; index < Math.min(pointOffset, children.length); index += 1) {
    const child = children[index];

    if (!child) {
      continue;
    }

    textLength += getPlainTextLengthForNode(child);

    if ($isElementNode(child) && !child.isInline() && index !== children.length - 1) {
      textLength += 2;
    }
  }

  return textLength;
}

function getPlainTextLengthForNode(node: LexicalNode): number {
  return collectTextContentParts(node).reduce(
    (textLength, part) => textLength + part.length,
    0,
  );
}

function toRawTextOffset(text: string, normalizedOffset: number) {
  if (normalizedOffset <= 0) {
    const firstVisibleIndex = Array.from(text).findIndex(
      (character) => character !== COMPOSER_TEXT_ANCHOR,
    );

    return firstVisibleIndex === -1 ? text.length : firstVisibleIndex;
  }

  let visibleOffset = 0;

  for (let rawOffset = 0; rawOffset < text.length; rawOffset += 1) {
    if (text[rawOffset] === COMPOSER_TEXT_ANCHOR) {
      continue;
    }

    visibleOffset += 1;

    if (visibleOffset === normalizedOffset) {
      return rawOffset + 1;
    }
  }

  return text.length;
}

function updateComposerImageInNode(
  node: LexicalNode,
  input: {
    clientId?: string;
    fileId?: string;
    localUrl?: string;
    previousSrc: string;
    src: string;
  },
): boolean {
  if ($isComposerImageNode(node)) {
    const isTarget = input.clientId
      ? node.getClientId() === input.clientId
      : node.getSrc() === input.previousSrc;

    if (!isTarget) {
      return false;
    }

    node.updateUploadResult({
      fileId: input.fileId,
      localUrl: input.localUrl,
      src: input.src,
    });
    return true;
  }

  if (!$isElementNode(node) && !$isRootNode(node)) {
    return false;
  }

  return (node as ElementNode).getChildren().some((child) =>
    updateComposerImageInNode(child, input),
  );
}

type TextContentPart = {
  length: number;
  textNode?: TextNode;
};

function collectTextContentParts(node: LexicalNode): TextContentPart[] {
  if ($isTextNode(node)) {
    return [
      {
        length: stripComposerTextAnchors(node.getTextContent()).length,
        textNode: node,
      },
    ];
  }

  if (!$isElementNode(node) && !$isRootNode(node)) {
    return [
      {
        length: node.getTextContent().length,
      },
    ];
  }

  const children = (node as ElementNode).getChildren();
  const parts: TextContentPart[] = [];

  children.forEach((child, index) => {
    parts.push(...collectTextContentParts(child));

    if ($isElementNode(child) && !child.isInline() && index !== children.length - 1) {
      parts.push({
        length: 2,
      });
    }
  });

  return parts;
}

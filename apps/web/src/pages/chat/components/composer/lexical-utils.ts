import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $isLineBreakNode,
  $isRootNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextNode,
} from "lexical";
import type { ComposerSegment } from "@/pages/chat/lib/composer-segments";
import {
  $createComposerEmojiNode,
  $createComposerImageNode,
  $isComposerEmojiNode,
  $isComposerImageNode,
} from "@/pages/chat/components/composer/lexical-nodes";
import {
  getWechatEmojiByName,
  parseWechatEmojiText,
  toWechatEmojiToken,
} from "@/pages/chat/wechat-emoji";

const WECHAT_EMOJI_TOKEN_PATTERN = /\[([^[\]]+)\]/g;

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
  height?: number;
  localUrl?: string;
  src: string;
  width?: number;
}) {
  $insertNodes([
    $createComposerImageNode(input),
  ]);
}

export function $clearComposer() {
  const root = $getRoot();
  root.clear();
  root.append($createParagraphNode());
  root.selectStart();
}

export function $exportComposerSegments() {
  const segments: ComposerSegment[] = [];

  for (const child of $getRoot().getChildren()) {
    collectSegmentsFromNode(child, segments);
  }

  return segments;
}

function collectSegmentsFromNode(node: LexicalNode, segments: ComposerSegment[]) {
  if ($isTextNode(node)) {
    segments.push({
      text: node.getTextContent(),
      type: "text",
    });
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

    children.forEach((child, index) => {
      collectSegmentsFromNode(child, segments);

      if (index < children.length - 1) {
        const currentChild = children[index];
        const nextChild = children[index + 1];

        if ($isComposerImageNode(currentChild) || $isComposerImageNode(nextChild)) {
          return;
        }
      }
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

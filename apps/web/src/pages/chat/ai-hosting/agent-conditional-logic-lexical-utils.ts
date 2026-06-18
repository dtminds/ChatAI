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
} from "lexical";
import type { ConditionalLogicSegment } from "./agent-settings.constants";
import {
  $createKnowledgeBaseChipNode,
  $isKnowledgeBaseChipNode,
} from "./agent-conditional-logic-lexical-nodes";

export function normalizeConditionalLogicSegments(
  segments: ConditionalLogicSegment[],
): ConditionalLogicSegment[] {
  if (segments.length === 0) {
    return [{ type: "text", value: "" }];
  }

  const merged: ConditionalLogicSegment[] = [];

  for (const segment of segments) {
    if (segment.type === "knowledgeBase") {
      merged.push(segment);
      continue;
    }

    const lastSegment = merged[merged.length - 1];

    if (lastSegment?.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: `${lastSegment.value}${segment.value}`,
      };
      continue;
    }

    merged.push({ type: "text", value: segment.value });
  }

  if (merged.length === 0 || merged[0]?.type !== "text") {
    merged.unshift({ type: "text", value: "" });
  }

  const lastSegment = merged[merged.length - 1];

  if (lastSegment?.type !== "text") {
    merged.push({ type: "text", value: "" });
  }

  return merged;
}

export function segmentsEqual(
  left: ConditionalLogicSegment[],
  right: ConditionalLogicSegment[],
) {
  return JSON.stringify(normalizeConditionalLogicSegments(left)) ===
    JSON.stringify(normalizeConditionalLogicSegments(right));
}

export function isConditionalLogicEmpty(segments: ConditionalLogicSegment[]) {
  return !normalizeConditionalLogicSegments(segments).some(
    (segment) =>
      segment.type === "knowledgeBase" ||
      (segment.type === "text" && segment.value.replace(/\u200b/g, "").length > 0),
  );
}

export function $clearConditionalLogicEditor() {
  const root = $getRoot();
  root.clear();
  root.append($createParagraphNode());
  root.selectStart();
}

export function $insertKnowledgeBaseChip(knowledgeBaseId: string) {
  $insertNodes([$createKnowledgeBaseChipNode(knowledgeBaseId)]);
}

export function $insertConditionalLogicText(text: string) {
  if (!text) {
    return;
  }

  $insertNodes([$createTextNode(text)]);
}

export function $restoreConditionalLogicFromSegments(segments: ConditionalLogicSegment[]) {
  $clearConditionalLogicEditor();

  for (const segment of normalizeConditionalLogicSegments(segments)) {
    if (segment.type === "knowledgeBase") {
      $insertKnowledgeBaseChip(segment.id);
      continue;
    }

    if (segment.value.length > 0) {
      $insertConditionalLogicText(segment.value);
    }
  }

  $getRoot().selectEnd();
}

export function $exportConditionalLogicSegments() {
  const segments: ConditionalLogicSegment[] = [];

  for (const child of $getRoot().getChildren()) {
    collectConditionalLogicSegmentsFromNode(child, segments);
  }

  return normalizeConditionalLogicSegments(segments);
}

function collectConditionalLogicSegmentsFromNode(
  node: LexicalNode,
  segments: ConditionalLogicSegment[],
) {
  if ($isKnowledgeBaseChipNode(node)) {
    segments.push({
      id: node.getKnowledgeBaseId(),
      type: "knowledgeBase",
    });
    return;
  }

  if ($isTextNode(node)) {
    appendConditionalLogicText(segments, stripConditionalLogicAnchors(node.getTextContent()));
    return;
  }

  if ($isLineBreakNode(node)) {
    appendConditionalLogicText(segments, "\n");
    return;
  }

  if ($isElementNode(node) || $isRootNode(node)) {
    const elementNode = node as ElementNode;

    elementNode.getChildren().forEach((child) => {
      collectConditionalLogicSegmentsFromNode(child, segments);
    });
  }
}

function appendConditionalLogicText(segments: ConditionalLogicSegment[], value: string) {
  if (!value) {
    return;
  }

  const lastSegment = segments[segments.length - 1];

  if (lastSegment?.type === "text") {
    lastSegment.value += value;
    return;
  }

  segments.push({ type: "text", value });
}

function stripConditionalLogicAnchors(value: string) {
  return value.replace(/\u200b/g, "");
}

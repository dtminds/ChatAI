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
import type {
  SkillContentResourceSegment,
  SkillContentSegment,
} from "./ai-skill-resource";
import { normalizeSkillContentSegments } from "./ai-skill-resource";
import {
  $createSkillResourceChipNode,
  $isSkillResourceChipNode,
} from "./ai-skill-description-lexical-nodes";

export function $clearSkillContentEditor() {
  const root = $getRoot();
  root.clear();
  root.append($createParagraphNode());
}

export function $insertSkillContentResource(resource: SkillContentResourceSegment) {
  const chipNode = $createSkillResourceChipNode(resource);
  const trailingSpaceNode = $createTextNode(" ");

  $insertNodes([chipNode, trailingSpaceNode]);
  trailingSpaceNode.select(1, 1);
}

export function $restoreSkillContentFromSegments(segments: SkillContentSegment[]) {
  const root = $getRoot();
  root.clear();

  const paragraph = $createParagraphNode();
  root.append(paragraph);

  for (const segment of normalizeSkillContentSegments(segments)) {
    if (segment.type === "resource") {
      paragraph.append($createSkillResourceChipNode(segment));
      continue;
    }

    if (segment.value.length > 0) {
      paragraph.append($createTextNode(segment.value));
    }
  }
}

export function $exportSkillContentSegments() {
  const segments: SkillContentSegment[] = [];

  for (const child of $getRoot().getChildren()) {
    collectSkillContentSegmentsFromNode(child, segments);
  }

  return normalizeSkillContentSegments(segments);
}

function collectSkillContentSegmentsFromNode(
  node: LexicalNode,
  segments: SkillContentSegment[],
) {
  if ($isSkillResourceChipNode(node)) {
    segments.push({
      id: node.getResourceId(),
      kind: node.getResourceKind(),
      name: node.getResourceName(),
      placeholder: node.getResourcePlaceholder(),
      type: "resource",
    });
    return;
  }

  if ($isTextNode(node)) {
    appendSkillContentText(segments, node.getTextContent());
    return;
  }

  if ($isLineBreakNode(node)) {
    appendSkillContentText(segments, "\n");
    return;
  }

  if ($isElementNode(node) || $isRootNode(node)) {
    const elementNode = node as ElementNode;

    elementNode.getChildren().forEach((child) => {
      collectSkillContentSegmentsFromNode(child, segments);
    });
  }
}

function appendSkillContentText(segments: SkillContentSegment[], value: string) {
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

import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $isLineBreakNode,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import type { WorkflowMessageContentSegment, WorkflowVariableDefinition } from "../../types";
import {
  getWorkflowVariableDisplayLabel,
  getWorkflowVariableSelectorKey,
} from "../../workflow-variable-selector";
import { normalizeMessageContent } from "./content";
import { $createWorkflowVariableNode, $isWorkflowVariableNode } from "./variable-node";

export function $restoreMessageContent(
  segments: WorkflowMessageContentSegment[] | undefined,
  variables: WorkflowVariableDefinition[],
) {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  root.append(paragraph);
  const variableByKey = new Map(variables.map((variable) => [getWorkflowVariableSelectorKey(variable.selector), variable]));

  normalizeMessageContent(segments).forEach((segment) => {
    if (segment.type === "text") {
      paragraph.append($createTextNode(segment.value));
      return;
    }
    const variable = variableByKey.get(getWorkflowVariableSelectorKey(segment.selector));
    paragraph.append($createWorkflowVariableNode(
      segment.selector,
      variable ? getWorkflowVariableDisplayLabel(variable) : segment.selector.join("."),
    ));
  });
}

export function $insertMessageVariable(
  variable: WorkflowVariableDefinition,
  selection?: RangeSelection | null,
) {
  if (selection) {
    try {
      if (!selection.anchor.getNode().isAttached() || !selection.focus.getNode().isAttached()) {
        throw new Error("Detached message editor selection");
      }
      $setSelection(selection.clone());
    }
    catch {
      $getRoot().getLastChild()?.selectEnd();
    }
  }
  else {
    $getRoot().getLastChild()?.selectEnd();
  }

  const token = $createWorkflowVariableNode(
    variable.selector,
    getWorkflowVariableDisplayLabel(variable),
  );
  const trailingSpace = $createTextNode(" ");
  $insertNodes([token, trailingSpace]);
  trailingSpace.select(1, 1);
}

export function $exportMessageContent() {
  const segments: WorkflowMessageContentSegment[] = [];
  $getRoot().getChildren().forEach((node) => collect(node, segments));
  return normalizeMessageContent(segments);
}

function collect(node: LexicalNode, segments: WorkflowMessageContentSegment[]) {
  if ($isWorkflowVariableNode(node)) {
    segments.push({ selector: node.getSelector(), type: "variable" });
    return;
  }
  if ($isTextNode(node)) {
    appendText(segments, node.getTextContent());
    return;
  }
  if ($isLineBreakNode(node)) {
    appendText(segments, "\n");
    return;
  }
  if ($isElementNode(node) || $isRootNode(node)) {
    (node as ElementNode).getChildren().forEach((child) => collect(child, segments));
  }
}

function appendText(segments: WorkflowMessageContentSegment[], value: string) {
  if (!value) return;
  const previous = segments[segments.length - 1];
  if (previous?.type === "text") previous.value += value;
  else segments.push({ type: "text", value });
}

import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import type { WorkflowVariableSelector } from "../../types";

type SerializedVariableNode = Spread<{
  label: string;
  selector: WorkflowVariableSelector;
}, SerializedTextNode>;

const variableChipClassName =
  "workflow-variable-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] px-1.5 align-baseline text-[13px] font-normal leading-[22px]";

export class WorkflowVariableNode extends TextNode {
  __label: string;
  __selector: WorkflowVariableSelector;

  static getType() {
    return "workflow-variable";
  }

  static clone(node: WorkflowVariableNode) {
    return new WorkflowVariableNode(node.__selector, node.__label, node.__key);
  }

  static importJSON(node: SerializedVariableNode) {
    return $createWorkflowVariableNode(node.selector, node.label);
  }

  constructor(selector: WorkflowVariableSelector, label: string, key?: NodeKey) {
    super(label, key);
    this.__label = label;
    this.__selector = [...selector];
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    dom.className = variableChipClassName;
    dom.dataset.workflowVariable = "true";
    return dom;
  }

  updateDOM(previous: this, dom: HTMLElement, config: EditorConfig) {
    const replace = super.updateDOM(previous, dom, config);
    if (!replace) {
      dom.className = variableChipClassName;
      dom.dataset.workflowVariable = "true";
    }
    return replace;
  }

  exportJSON(): SerializedVariableNode {
    return {
      label: this.__label,
      selector: this.__selector,
      ...super.exportJSON(),
      type: WorkflowVariableNode.getType(),
      version: 1,
    };
  }

  getSelector() {
    return [...this.__selector];
  }

  canInsertTextBefore() { return false; }
  canInsertTextAfter() { return false; }
  isTextEntity(): true { return true; }
}

export function $createWorkflowVariableNode(selector: WorkflowVariableSelector, label: string) {
  return $applyNodeReplacement(new WorkflowVariableNode(selector, label));
}

export function $isWorkflowVariableNode(node: LexicalNode | null | undefined): node is WorkflowVariableNode {
  return node instanceof WorkflowVariableNode;
}

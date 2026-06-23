import {
  $applyNodeReplacement,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import { mockKnowledgeBaseOptions } from "./agent-settings.constants";

export type SerializedKnowledgeBaseChipNode = Spread<
  {
    knowledgeBaseId: string;
    knowledgeBaseName?: string;
  },
  SerializedTextNode
>;

export class KnowledgeBaseChipNode extends TextNode {
  __knowledgeBaseId: string;
  __knowledgeBaseName: string;

  static getType() {
    return "agent-knowledge-base-chip";
  }

  static clone(node: KnowledgeBaseChipNode) {
    return new KnowledgeBaseChipNode(
      node.__knowledgeBaseId,
      node.__knowledgeBaseName,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedKnowledgeBaseChipNode) {
    return $createKnowledgeBaseChipNode({
      id: serializedNode.knowledgeBaseId,
      name: serializedNode.knowledgeBaseName,
    });
  }

  constructor(knowledgeBaseId: string, knowledgeBaseName?: string, key?: NodeKey) {
    const displayName = resolveKnowledgeBaseDisplayName(knowledgeBaseId, knowledgeBaseName);

    super(displayName, key);
    this.__knowledgeBaseId = knowledgeBaseId;
    this.__knowledgeBaseName = displayName;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const dom = super.createDOM(config);
    dom.className = knowledgeBaseChipClassName;
    dom.dataset.knowledgeBaseChip = "true";
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);

    if (!shouldReplace) {
      dom.className = knowledgeBaseChipClassName;
      dom.dataset.knowledgeBaseChip = "true";
    }

    return shouldReplace;
  }

  exportJSON(): SerializedKnowledgeBaseChipNode {
    return {
      knowledgeBaseId: this.__knowledgeBaseId,
      knowledgeBaseName: this.__knowledgeBaseName,
      ...super.exportJSON(),
      type: KnowledgeBaseChipNode.getType(),
      version: 1,
    };
  }

  getKnowledgeBaseId() {
    return this.__knowledgeBaseId;
  }

  getKnowledgeBaseName() {
    return this.__knowledgeBaseName;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createKnowledgeBaseChipNode(knowledgeBase: {
  id: string;
  name?: string;
}) {
  return $applyNodeReplacement(
    new KnowledgeBaseChipNode(knowledgeBase.id, knowledgeBase.name),
  );
}

export function $isKnowledgeBaseChipNode(
  node: LexicalNode | null | undefined,
): node is KnowledgeBaseChipNode {
  return node instanceof KnowledgeBaseChipNode;
}

export function resolveKnowledgeBaseName(knowledgeBaseId: string) {
  return mockKnowledgeBaseOptions.find((option) => option.id === knowledgeBaseId)?.name ?? "";
}

function resolveKnowledgeBaseDisplayName(knowledgeBaseId: string, knowledgeBaseName?: string) {
  return knowledgeBaseName || resolveKnowledgeBaseName(knowledgeBaseId) || knowledgeBaseId;
}

const knowledgeBaseChipClassName =
  "agent-kb-chip mx-0.5 inline-block h-[22px] translate-y-[-1px] rounded-[6px] bg-primary/10 px-1.5 align-baseline text-[13px] font-normal leading-[22px] text-primary";
